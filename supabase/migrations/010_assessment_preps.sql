create table public.assessment_preps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  grade_level text not null default '',
  subject text not null default '',
  lesson_context text not null default '',
  evaluation_goal text not null default '',
  achievement_standards jsonb not null default '[]'::jsonb,
  safety_rules text not null default '',
  student_guidance text not null default '',
  notion_config jsonb not null default '{}'::jsonb,
  sample_evaluation_notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active')),
  current_version integer not null default 0 check (current_version >= 0),
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assessment_prep_versions (
  id uuid primary key default gen_random_uuid(),
  prep_id uuid not null references public.assessment_preps(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  rubric_id uuid references public.rubrics(id) on delete set null,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (prep_id, version_number)
);

alter table public.assessment_preps
  add constraint assessment_preps_active_version_id_fkey
  foreign key (active_version_id)
  references public.assessment_prep_versions(id)
  on delete set null;

alter table public.evaluations
  add column if not exists assessment_prep_version_id uuid
  references public.assessment_prep_versions(id) on delete set null;

create index assessment_preps_owner_id_idx on public.assessment_preps(owner_id);
create index assessment_preps_project_id_idx on public.assessment_preps(project_id);
create index assessment_prep_versions_prep_id_idx on public.assessment_prep_versions(prep_id);
create index assessment_prep_versions_project_id_idx on public.assessment_prep_versions(project_id);
create index evaluations_assessment_prep_version_id_idx
  on public.evaluations(assessment_prep_version_id);

create trigger assessment_preps_set_updated_at
before update on public.assessment_preps
for each row execute function public.set_updated_at();

alter table public.assessment_preps enable row level security;
alter table public.assessment_prep_versions enable row level security;

create policy "Assessment preps are owned by current user"
on public.assessment_preps for all
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.projects
    where projects.id = assessment_preps.project_id
      and projects.owner_id = (select auth.uid())
  )
);

create policy "Assessment prep versions are readable by owner"
on public.assessment_prep_versions for select
to authenticated
using (
  exists (
    select 1 from public.assessment_preps
    where assessment_preps.id = assessment_prep_versions.prep_id
      and assessment_preps.owner_id = (select auth.uid())
  )
);

create policy "Assessment prep versions are insertable by owner"
on public.assessment_prep_versions for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.assessment_preps
    where assessment_preps.id = assessment_prep_versions.prep_id
      and assessment_preps.owner_id = (select auth.uid())
  )
);

revoke all on table public.assessment_preps from anon, authenticated;
revoke all on table public.assessment_prep_versions from anon, authenticated;
grant select, insert, update, delete on table public.assessment_preps to authenticated;
grant select, insert on table public.assessment_prep_versions to authenticated;

create or replace function public.activate_assessment_prep(target_prep_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  prep_record record;
  rubric_snapshot jsonb;
  next_version integer;
  created_version_id uuid;
begin
  select
    prep.*,
    project.rubric_id,
    project.title as project_title
  into prep_record
  from public.assessment_preps as prep
  join public.projects as project on project.id = prep.project_id
  where prep.id = target_prep_id
    and prep.owner_id = (select auth.uid())
    and project.owner_id = (select auth.uid())
  for update of prep;

  if not found then
    raise exception '접근할 수 없는 평가 준비안입니다.';
  end if;

  if trim(prep_record.lesson_context) = ''
    or trim(prep_record.evaluation_goal) = ''
    or trim(prep_record.grade_level) = ''
    or trim(prep_record.subject) = '' then
    raise exception '수업 맥락, 학년, 교과, 평가 목표를 입력해 주세요.';
  end if;

  if jsonb_typeof(prep_record.achievement_standards) <> 'array'
    or jsonb_array_length(prep_record.achievement_standards) = 0 then
    raise exception '성취기준을 한 개 이상 입력해 주세요.';
  end if;

  if prep_record.rubric_id is null then
    raise exception '수업활동에 루브릭을 연결해 주세요.';
  end if;

  select jsonb_build_object(
    'id', rubric.id,
    'title', rubric.title,
    'description', rubric.description,
    'generation_context', rubric.generation_context,
    'criteria', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', criterion.id,
          'label', criterion.label,
          'description', criterion.description,
          'max_score', criterion.max_score,
          'sort_order', criterion.sort_order
        ) order by criterion.sort_order, criterion.created_at
      )
      from public.rubric_criteria as criterion
      where criterion.rubric_id = rubric.id
    ), '[]'::jsonb)
  )
  into rubric_snapshot
  from public.rubrics as rubric
  where rubric.id = prep_record.rubric_id
    and rubric.owner_id = (select auth.uid());

  if rubric_snapshot is null
    or jsonb_array_length(rubric_snapshot -> 'criteria') = 0 then
    raise exception '루브릭 평가 기준을 한 개 이상 준비해 주세요.';
  end if;

  if trim(coalesce(prep_record.notion_config ->> 'database_url', '')) = '' then
    raise exception 'Notion 학생 결과물 데이터베이스 위치를 입력해 주세요.';
  end if;

  if trim(prep_record.student_guidance) = ''
    or trim(prep_record.safety_rules) = '' then
    raise exception '학생 안내와 안전 규칙을 입력해 주세요.';
  end if;

  if trim(prep_record.sample_evaluation_notes) = '' then
    raise exception '샘플 시험 평가 결과를 기록해 주세요.';
  end if;

  next_version := prep_record.current_version + 1;

  insert into public.assessment_prep_versions (
    prep_id,
    project_id,
    rubric_id,
    version_number,
    snapshot,
    created_by
  ) values (
    prep_record.id,
    prep_record.project_id,
    prep_record.rubric_id,
    next_version,
    jsonb_build_object(
      'project_title', prep_record.project_title,
      'grade_level', prep_record.grade_level,
      'subject', prep_record.subject,
      'lesson_context', prep_record.lesson_context,
      'evaluation_goal', prep_record.evaluation_goal,
      'achievement_standards', prep_record.achievement_standards,
      'safety_rules', prep_record.safety_rules,
      'student_guidance', prep_record.student_guidance,
      'notion_config', prep_record.notion_config,
      'sample_evaluation_notes', prep_record.sample_evaluation_notes,
      'rubric', rubric_snapshot
    ),
    (select auth.uid())
  )
  returning id into created_version_id;

  update public.assessment_preps
  set
    status = 'active',
    current_version = next_version,
    active_version_id = created_version_id
  where id = prep_record.id;

  return created_version_id;
end;
$$;

revoke execute on function public.activate_assessment_prep(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.activate_assessment_prep(uuid) to authenticated;
