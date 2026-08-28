import { GrowthRecordBoard } from "@/components/growth/growth-record-board";
import { aggregateGrowthRecords } from "@/lib/growth/aggregate-growth-records";
import { requireUser } from "@/lib/auth/require-user";

export default async function GrowthRecordPage() {
  const { supabase, user } = await requireUser();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (projectsError) throw new Error(projectsError.message);

  const projectIds = (projects ?? []).map((project) => project.id);
  const rubricIds = Array.from(new Set((projects ?? []).map((project) => project.rubric_id).filter(Boolean))) as string[];
  const [commentsResult, evaluationsResult, criteriaResult] = await Promise.all([
    projectIds.length
      ? supabase.from("comments").select("*").in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from("evaluations").select("*").in("project_id", projectIds).eq("evaluator_id", user.id).eq("source", "teacher-manual").eq("status", "confirmed")
      : Promise.resolve({ data: [], error: null }),
    rubricIds.length
      ? supabase.from("rubric_criteria").select("*").in("rubric_id", rubricIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const queryError = commentsResult.error ?? evaluationsResult.error ?? criteriaResult.error;
  if (queryError) throw new Error(queryError.message);

  const evaluationIds = (evaluationsResult.data ?? []).map((evaluation) => evaluation.id);
  const scoresResult = evaluationIds.length
    ? await supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds)
    : { data: [], error: null };
  if (scoresResult.error) throw new Error(scoresResult.error.message);

  const board = aggregateGrowthRecords({
    projects: projects ?? [],
    comments: commentsResult.data ?? [],
    evaluations: evaluationsResult.data ?? [],
    scores: scoresResult.data ?? [],
    criteria: criteriaResult.data ?? [],
  });

  return <GrowthRecordBoard {...board} />;
}
