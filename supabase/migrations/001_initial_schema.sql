create extension if not exists "pgcrypto";

create type public.user_role as enum ('teacher', 'admin');
create type public.project_status as enum ('draft', 'active', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'teacher',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.rubrics(id) on delete cascade,
  label text not null,
  description text not null,
  max_score integer not null default 5 check (max_score > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  rubric_id uuid references public.rubrics(id) on delete set null,
  title text not null,
  description text,
  source_url text,
  status public.project_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  student_name text,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  evaluator_id uuid not null references public.profiles(id) on delete cascade,
  model_name text,
  total_score numeric(8, 2),
  feedback text,
  raw_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comment_id, evaluator_id)
);

create table public.evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  criterion_id uuid not null references public.rubric_criteria(id) on delete cascade,
  score numeric(8, 2) not null check (score >= 0),
  rationale text,
  created_at timestamptz not null default now(),
  unique (evaluation_id, criterion_id)
);

create index projects_owner_id_idx on public.projects(owner_id);
create index projects_rubric_id_idx on public.projects(rubric_id);
create index rubrics_owner_id_idx on public.rubrics(owner_id);
create index rubric_criteria_rubric_id_idx on public.rubric_criteria(rubric_id);
create index comments_project_id_idx on public.comments(project_id);
create index evaluations_project_id_idx on public.evaluations(project_id);
create index evaluations_comment_id_idx on public.evaluations(comment_id);
create index evaluation_scores_evaluation_id_idx on public.evaluation_scores(evaluation_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger rubrics_set_updated_at
before update on public.rubrics
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create trigger evaluations_set_updated_at
before update on public.evaluations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.projects enable row level security;
alter table public.comments enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_scores enable row level security;

create policy "Profiles are readable by owner"
on public.profiles for select
using (auth.uid() = id);

create policy "Profiles are editable by owner"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Rubrics are owned by current user"
on public.rubrics for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Rubric criteria follow rubric ownership"
on public.rubric_criteria for all
using (
  exists (
    select 1 from public.rubrics
    where rubrics.id = rubric_criteria.rubric_id
      and rubrics.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.rubrics
    where rubrics.id = rubric_criteria.rubric_id
      and rubrics.owner_id = auth.uid()
  )
);

create policy "Projects are owned by current user"
on public.projects for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Comments follow project ownership"
on public.comments for all
using (
  exists (
    select 1 from public.projects
    where projects.id = comments.project_id
      and projects.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects
    where projects.id = comments.project_id
      and projects.owner_id = auth.uid()
  )
);

create policy "Evaluations follow project ownership"
on public.evaluations for all
using (
  exists (
    select 1 from public.projects
    where projects.id = evaluations.project_id
      and projects.owner_id = auth.uid()
  )
)
with check (
  evaluator_id = auth.uid()
  and exists (
    select 1 from public.projects
    where projects.id = evaluations.project_id
      and projects.owner_id = auth.uid()
  )
);

create policy "Evaluation scores follow evaluation ownership"
on public.evaluation_scores for all
using (
  exists (
    select 1
    from public.evaluations
    join public.projects on projects.id = evaluations.project_id
    where evaluations.id = evaluation_scores.evaluation_id
      and projects.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.evaluations
    join public.projects on projects.id = evaluations.project_id
    where evaluations.id = evaluation_scores.evaluation_id
      and projects.owner_id = auth.uid()
  )
);
