alter table public.evaluations
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'confirmed')),
  add column if not exists confidence numeric(4, 3)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add column if not exists review_reasons text[] not null default '{}',
  add column if not exists evaluation_forward text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists revision integer not null default 1 check (revision > 0),
  add column if not exists change_reason text;

create table public.evaluation_revisions (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  total_score numeric(8, 2),
  feedback text,
  evaluation_forward text,
  review_reasons text[] not null default '{}',
  score_snapshot jsonb not null default '[]'::jsonb,
  change_reason text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (evaluation_id, revision_number)
);

create index evaluations_status_idx on public.evaluations(status);
create index evaluations_review_reasons_idx on public.evaluations using gin(review_reasons);
create index evaluation_revisions_evaluation_id_idx on public.evaluation_revisions(evaluation_id);
create index evaluation_revisions_project_id_idx on public.evaluation_revisions(project_id);

alter table public.evaluation_revisions enable row level security;

create policy "Evaluation revisions follow project ownership"
on public.evaluation_revisions for select
to authenticated
using (
  exists (
    select 1 from public.projects
    where projects.id = evaluation_revisions.project_id
      and projects.owner_id = (select auth.uid())
  )
);

create policy "Evaluation revisions are insertable by owner"
on public.evaluation_revisions for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.projects
    where projects.id = evaluation_revisions.project_id
      and projects.owner_id = (select auth.uid())
  )
);

revoke all on table public.evaluation_revisions from anon, authenticated;
grant select, insert on table public.evaluation_revisions to authenticated;
