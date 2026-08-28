insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-form-templates', 'school-form-templates', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.school_pdf_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  school_name text not null,
  document_type text not null,
  school_year text not null,
  file_name text not null,
  storage_path text not null unique,
  sha256 text not null,
  page_count integer not null default 0 check (page_count >= 0),
  has_acroform boolean not null default false,
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'ready', 'error')),
  analysis_error text,
  original_version integer not null default 1 check (original_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_pdf_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.school_pdf_templates(id) on delete cascade,
  page_number integer not null default 1 check (page_number > 0),
  field_label text not null,
  acroform_name text,
  x numeric(10, 2),
  y numeric(10, 2),
  width numeric(10, 2),
  height numeric(10, 2),
  source_key text not null default 'teacher_final_text',
  char_limit integer check (char_limit is null or char_limit > 0),
  line_limit integer check (line_limit is null or line_limit > 0),
  font_size numeric(5, 2) not null default 10 check (font_size > 0),
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.export_audits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid references public.school_pdf_templates(id) on delete set null,
  summary_id uuid references public.student_term_summaries(id) on delete set null,
  export_type text not null check (export_type in ('pdf', 'notion')),
  status text not null check (status in ('started', 'completed', 'failed')),
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index school_pdf_templates_owner_idx on public.school_pdf_templates(owner_id);
create index school_pdf_template_fields_template_idx on public.school_pdf_template_fields(template_id, sort_order);
create index export_audits_owner_created_idx on public.export_audits(owner_id, created_at desc);

create trigger school_pdf_templates_set_updated_at before update on public.school_pdf_templates
for each row execute function public.set_updated_at();
create trigger school_pdf_template_fields_set_updated_at before update on public.school_pdf_template_fields
for each row execute function public.set_updated_at();

alter table public.school_pdf_templates enable row level security;
alter table public.school_pdf_template_fields enable row level security;
alter table public.export_audits enable row level security;

create policy "School PDF templates are owned by current user"
on public.school_pdf_templates for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "School PDF fields follow template ownership"
on public.school_pdf_template_fields for all to authenticated
using (exists (select 1 from public.school_pdf_templates where school_pdf_templates.id = school_pdf_template_fields.template_id and school_pdf_templates.owner_id = (select auth.uid())))
with check (exists (select 1 from public.school_pdf_templates where school_pdf_templates.id = school_pdf_template_fields.template_id and school_pdf_templates.owner_id = (select auth.uid())));

create policy "Export audits are owned by current user"
on public.export_audits for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

revoke all on table public.school_pdf_templates from anon, authenticated;
revoke all on table public.school_pdf_template_fields from anon, authenticated;
revoke all on table public.export_audits from anon, authenticated;
grant select, insert, update, delete on table public.school_pdf_templates to authenticated;
grant select, insert, update, delete on table public.school_pdf_template_fields to authenticated;
grant select, insert, update on table public.export_audits to authenticated;

drop policy if exists "Teachers can read own school form files" on storage.objects;
create policy "Teachers can read own school form files"
on storage.objects for select to authenticated
using (bucket_id = 'school-form-templates' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Teachers can upload own school form files" on storage.objects;
create policy "Teachers can upload own school form files"
on storage.objects for insert to authenticated
with check (bucket_id = 'school-form-templates' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Teachers can update own school form files" on storage.objects;
create policy "Teachers can update own school form files"
on storage.objects for update to authenticated
using (bucket_id = 'school-form-templates' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'school-form-templates' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Teachers can delete own school form files" on storage.objects;
create policy "Teachers can delete own school form files"
on storage.objects for delete to authenticated
using (bucket_id = 'school-form-templates' and (storage.foldername(name))[1] = (select auth.uid())::text);
