create table public.teacher_notion_connections (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  token_ciphertext text not null check (length(token_ciphertext) > 0),
  workspace_label text,
  bot_id text,
  capabilities text[] not null default array['read_results', 'create_pages']::text[]
    check (capabilities <@ array['read_results', 'create_pages']::text[]),
  default_export_parent_page_id text,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger teacher_notion_connections_set_updated_at
before update on public.teacher_notion_connections
for each row execute function public.set_updated_at();

alter table public.teacher_notion_connections enable row level security;

create policy "Teacher Notion connections are readable by owner"
on public.teacher_notion_connections for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "Teacher Notion connections are insertable by owner"
on public.teacher_notion_connections for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Teacher Notion connections are updatable by owner"
on public.teacher_notion_connections for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Teacher Notion connections are deletable by owner"
on public.teacher_notion_connections for delete
to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.teacher_notion_connections from anon, authenticated;
grant select, insert, update, delete on table public.teacher_notion_connections to authenticated;
