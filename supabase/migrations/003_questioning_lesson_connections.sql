create table if not exists public.questioning_lesson_connections (
  id uuid primary key default gen_random_uuid(),
  lesson_code text not null unique check (lesson_code ~ '^[A-Z0-9-]{4,32}$'),
  teacher_label text,
  lesson_title text,
  gemini_model text not null default 'gemini-2.5-flash',
  gemini_api_key_ciphertext text not null,
  notion_api_key_ciphertext text not null,
  notion_prep_database_id text not null,
  notion_result_database_id text not null,
  chatbot_config jsonb not null default '{}'::jsonb,
  student_chatbot_path text not null default '/questioning-chatbot',
  status text not null default 'active' check (status in ('active', 'archived')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questioning_lesson_connections_lesson_code_idx
  on public.questioning_lesson_connections (lesson_code);

create index if not exists questioning_lesson_connections_status_idx
  on public.questioning_lesson_connections (status);

create trigger questioning_lesson_connections_set_updated_at
before update on public.questioning_lesson_connections
for each row execute function public.set_updated_at();

alter table public.questioning_lesson_connections enable row level security;

revoke all on table public.questioning_lesson_connections from anon, authenticated;
grant select, insert, update, delete on table public.questioning_lesson_connections to service_role;
