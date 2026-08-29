import { GrowthRecordBoard } from "@/components/growth/growth-record-board";
import { aggregateGrowthRecords } from "@/lib/growth/aggregate-growth-records";
import { parseStudentRecordEvidence, type StudentRecordSummaryPreview } from "@/lib/growth/student-records";
import { requireUser } from "@/lib/auth/require-user";

export default async function GrowthRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { message, notice } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (projectsError) throw new Error(projectsError.message);

  const projectIds = (projects ?? []).map((project) => project.id);
  const rubricIds = Array.from(new Set((projects ?? []).map((project) => project.rubric_id).filter(Boolean))) as string[];
  const [commentsResult, evaluationsResult, criteriaResult, prepsResult, summariesResult] = await Promise.all([
    projectIds.length
      ? supabase.from("comments").select("*").in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from("evaluations").select("*").in("project_id", projectIds).eq("evaluator_id", user.id).eq("source", "teacher-manual").eq("status", "confirmed")
      : Promise.resolve({ data: [], error: null }),
    rubricIds.length
      ? supabase.from("rubric_criteria").select("*").in("rubric_id", rubricIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from("assessment_preps").select("*").eq("owner_id", user.id).in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("student_term_summaries")
      .select("*")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  const queryError = commentsResult.error ?? evaluationsResult.error ?? criteriaResult.error ?? prepsResult.error ?? summariesResult.error;
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
    preps: prepsResult.data ?? [],
  });

  const latestSummaryByStudentSubject = new Map<string, StudentRecordSummaryPreview>();
  for (const summary of summariesResult.data ?? []) {
    const evidence = parseStudentRecordEvidence(summary.evidence);
    if (!evidence?.subject) continue;
    const key = `${summary.student_key}\u0000${evidence.subject}`;
    if (latestSummaryByStudentSubject.has(key)) continue;
    latestSummaryByStudentSubject.set(key, {
      id: summary.id,
      studentKey: summary.student_key,
      periodLabel: summary.period_label,
      draftText: summary.draft_text,
      teacherFinalText: summary.teacher_final_text,
      status: summary.status,
      updatedAt: summary.updated_at,
      evidence,
    });
  }

  return (
    <GrowthRecordBoard
      {...board}
      summaries={Array.from(latestSummaryByStudentSubject.values())}
      message={message}
      notice={notice}
    />
  );
}
