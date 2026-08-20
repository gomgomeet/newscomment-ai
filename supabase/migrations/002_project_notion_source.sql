-- Milestone 13: remember the Notion database and property mapping used for comment import.
alter table public.projects
  add column if not exists notion_source jsonb not null default '{}'::jsonb;

-- Speeds up the duplicate check that skips Notion pages already imported into a project.
create index if not exists comments_notion_page_id_idx
  on public.comments ((metadata ->> 'notion_page_id'))
  where metadata ? 'notion_page_id';
