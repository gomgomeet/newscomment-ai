create index if not exists assessment_prep_versions_created_by_idx
on public.assessment_prep_versions(created_by);

create index if not exists assessment_prep_versions_rubric_id_idx
on public.assessment_prep_versions(rubric_id);

create index if not exists assessment_preps_active_version_id_idx
on public.assessment_preps(active_version_id);

create index if not exists evaluation_revisions_comment_id_idx
on public.evaluation_revisions(comment_id);

create index if not exists evaluation_revisions_created_by_idx
on public.evaluation_revisions(created_by);

create index if not exists export_audits_summary_id_idx
on public.export_audits(summary_id);

create index if not exists export_audits_template_id_idx
on public.export_audits(template_id);

create index if not exists student_growth_records_previous_evaluation_idx
on public.student_growth_records(previous_evaluation_id);
