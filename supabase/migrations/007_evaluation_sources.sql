alter table public.evaluations
  add column if not exists source text not null default 'teacher-manual'
    check (source in ('teacher-manual', 'ai-draft'));

alter table public.evaluations
  drop constraint if exists evaluations_comment_id_evaluator_id_key;

alter table public.evaluations
  add constraint evaluations_comment_evaluator_source_key
    unique (comment_id, evaluator_id, source);

create index if not exists evaluations_source_idx
  on public.evaluations(source);
