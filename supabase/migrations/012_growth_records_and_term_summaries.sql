create table public.student_growth_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  student_key text not null,
  previous_evaluation_id uuid references public.evaluations(id) on delete set null,
  current_evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  criterion_key text not null,
  previous_score_percentage numeric(6, 2),
  current_score_percentage numeric(6, 2),
  previous_evidence text,
  current_evidence text,
  change_type text not null check (change_type in ('improved', 'maintained', 'needs-support', 'not-observed')),
  prior_evaluation_forward text,
  forward_applied boolean,
  teacher_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (current_evaluation_id, criterion_key)
);

create table public.student_term_summaries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  student_key text not null,
  period_label text not null,
  included_evaluation_ids uuid[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb,
  draft_text text not null default '',
  teacher_final_text text not null default '',
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_growth_records_owner_student_idx on public.student_growth_records(owner_id, student_key);
create index student_growth_records_current_evaluation_idx on public.student_growth_records(current_evaluation_id);
create index student_term_summaries_owner_student_idx on public.student_term_summaries(owner_id, student_key);

create trigger student_growth_records_set_updated_at before update on public.student_growth_records
for each row execute function public.set_updated_at();
create trigger student_term_summaries_set_updated_at before update on public.student_term_summaries
for each row execute function public.set_updated_at();

alter table public.student_growth_records enable row level security;
alter table public.student_term_summaries enable row level security;

create policy "Student growth records are owned by current user"
on public.student_growth_records for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Student term summaries are owned by current user"
on public.student_term_summaries for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

revoke all on table public.student_growth_records from anon, authenticated;
revoke all on table public.student_term_summaries from anon, authenticated;
grant select, insert, update, delete on table public.student_growth_records to authenticated;
grant select, insert, update, delete on table public.student_term_summaries to authenticated;
