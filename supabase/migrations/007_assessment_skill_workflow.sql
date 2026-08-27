-- 평가 준비 스킬과 자동채점 스킬의 인계 계약 및 교사 검토 기록
alter table public.projects
add column if not exists assessment_spec jsonb not null default '{}'::jsonb;

alter table public.evaluations
add column if not exists rubric_version text,
add column if not exists execution_id uuid,
add column if not exists evaluation_stage text not null default 'manual'
  check (evaluation_stage in ('manual', 'trial', 'batch')),
add column if not exists review_status text not null default 'pending'
  check (review_status in ('pending', 'kept', 'revised', 'held')),
add column if not exists feedforward text;

create index if not exists evaluations_review_status_idx
  on public.evaluations (project_id, review_status);
