alter table public.rubrics
add column if not exists auto_generated boolean not null default false,
add column if not exists generation_context jsonb not null default '{}'::jsonb;
