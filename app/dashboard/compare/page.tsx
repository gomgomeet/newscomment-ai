import { EvaluationReviewBoard } from "@/components/evaluations/evaluation-review-board";
import { requireUser } from "@/lib/auth/require-user";
import { buildEvaluationReviewQueue } from "@/lib/evaluation/build-review-queue";

export default async function ComparePage() {
  const { supabase, user } = await requireUser();

  const [projectsResult, commentsResult, evaluationsResult] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("comments").select("*").order("updated_at", { ascending: false }),
    supabase
      .from("evaluations")
      .select("*")
      .eq("evaluator_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  if (projectsResult.error) throw new Error(projectsResult.error.message);
  if (commentsResult.error) throw new Error(commentsResult.error.message);
  if (evaluationsResult.error) throw new Error(evaluationsResult.error.message);

  const projects = projectsResult.data ?? [];
  const projectIds = new Set(projects.map((project) => project.id));
  const comments = (commentsResult.data ?? []).filter((comment) => projectIds.has(comment.project_id));
  const evaluations = (evaluationsResult.data ?? []).filter((evaluation) =>
    projectIds.has(evaluation.project_id),
  );
  const evaluationIds = evaluations.map((evaluation) => evaluation.id);
  const rubricIds = Array.from(
    new Set(projects.map((project) => project.rubric_id).filter((id): id is string => Boolean(id))),
  );

  const [scoresResult, criteriaResult] = await Promise.all([
    evaluationIds.length
      ? supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds)
      : Promise.resolve({ data: [], error: null }),
    rubricIds.length
      ? supabase
          .from("rubric_criteria")
          .select("*")
          .in("rubric_id", rubricIds)
          .order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (scoresResult.error) throw new Error(scoresResult.error.message);
  if (criteriaResult.error) throw new Error(criteriaResult.error.message);

  const items = buildEvaluationReviewQueue({
    projects,
    comments,
    evaluations,
    scores: scoresResult.data ?? [],
    criteria: criteriaResult.data ?? [],
  });

  return <EvaluationReviewBoard items={items} />;
}
