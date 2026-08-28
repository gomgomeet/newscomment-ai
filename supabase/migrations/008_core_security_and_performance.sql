-- Restrict the Data API to signed-in teachers and keep grants aligned with RLS.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.rubrics from anon, authenticated;
revoke all on table public.rubric_criteria from anon, authenticated;
revoke all on table public.projects from anon, authenticated;
revoke all on table public.comments from anon, authenticated;
revoke all on table public.evaluations from anon, authenticated;
revoke all on table public.evaluation_scores from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.rubrics to authenticated;
grant select, insert, update, delete on table public.rubric_criteria to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.comments to authenticated;
grant select, insert, update, delete on table public.evaluations to authenticated;
grant select, insert, update, delete on table public.evaluation_scores to authenticated;

-- Trigger/event-trigger functions never need to be callable through the Data API.
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;

-- The function body already uses a schema-qualified table name.
alter function public.handle_new_user() set search_path = '';

-- Foreign-key indexes used by review and questioning queries.
create index if not exists evaluation_scores_criterion_id_idx
  on public.evaluation_scores(criterion_id);
create index if not exists evaluations_evaluator_id_idx
  on public.evaluations(evaluator_id);
create index if not exists questioning_thinking_cards_parent_card_id_idx
  on public.questioning_thinking_cards(parent_card_id);

-- Evaluate the current user once per statement and scope policies to signed-in users.
drop policy if exists "Profiles are readable by owner" on public.profiles;
create policy "Profiles are readable by owner"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Profiles are editable by owner" on public.profiles;
create policy "Profiles are editable by owner"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Rubrics are owned by current user" on public.rubrics;
create policy "Rubrics are owned by current user"
on public.rubrics for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Rubric criteria follow rubric ownership" on public.rubric_criteria;
create policy "Rubric criteria follow rubric ownership"
on public.rubric_criteria for all
to authenticated
using (
  exists (
    select 1 from public.rubrics
    where rubrics.id = rubric_criteria.rubric_id
      and rubrics.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.rubrics
    where rubrics.id = rubric_criteria.rubric_id
      and rubrics.owner_id = (select auth.uid())
  )
);

drop policy if exists "Projects are owned by current user" on public.projects;
create policy "Projects are owned by current user"
on public.projects for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Comments follow project ownership" on public.comments;
create policy "Comments follow project ownership"
on public.comments for all
to authenticated
using (
  exists (
    select 1 from public.projects
    where projects.id = comments.project_id
      and projects.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.projects
    where projects.id = comments.project_id
      and projects.owner_id = (select auth.uid())
  )
);

drop policy if exists "Evaluations follow project ownership" on public.evaluations;
create policy "Evaluations follow project ownership"
on public.evaluations for all
to authenticated
using (
  exists (
    select 1 from public.projects
    where projects.id = evaluations.project_id
      and projects.owner_id = (select auth.uid())
  )
)
with check (
  evaluator_id = (select auth.uid())
  and exists (
    select 1 from public.projects
    where projects.id = evaluations.project_id
      and projects.owner_id = (select auth.uid())
  )
);

drop policy if exists "Evaluation scores follow evaluation ownership" on public.evaluation_scores;
create policy "Evaluation scores follow evaluation ownership"
on public.evaluation_scores for all
to authenticated
using (
  exists (
    select 1
    from public.evaluations
    join public.projects on projects.id = evaluations.project_id
    where evaluations.id = evaluation_scores.evaluation_id
      and projects.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.evaluations
    join public.projects on projects.id = evaluations.project_id
    where evaluations.id = evaluation_scores.evaluation_id
      and projects.owner_id = (select auth.uid())
  )
);
