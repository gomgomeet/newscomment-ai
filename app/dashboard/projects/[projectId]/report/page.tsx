import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectEvaluationReportView } from "@/components/dashboard/project-evaluation-report";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require-user";
import { buildProjectEvaluationReport } from "@/lib/evaluations/project-report";

export default async function ProjectReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) notFound();

  const [rubricResult, criteriaResult, commentsResult, evaluationsResult] = await Promise.all([
    project.rubric_id
      ? supabase.from("rubrics").select("id, title").eq("id", project.rubric_id).eq("owner_id", user.id).single()
      : Promise.resolve({ data: null, error: null }),
    project.rubric_id
      ? supabase.from("rubric_criteria").select("*").eq("rubric_id", project.rubric_id).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("comments").select("*").eq("project_id", project.id),
    supabase
      .from("evaluations")
      .select("*")
      .eq("project_id", project.id)
      .eq("evaluator_id", user.id)
      .eq("source", "teacher-manual"),
  ]);

  const queryError = rubricResult.error || criteriaResult.error || commentsResult.error || evaluationsResult.error;
  if (queryError) throw new Error(queryError.message);

  const evaluationIds = (evaluationsResult.data ?? []).map((evaluation) => evaluation.id);
  const { data: scores, error: scoresError } = evaluationIds.length
    ? await supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds)
    : { data: [], error: null };

  if (scoresError) throw new Error(scoresError.message);

  const report = buildProjectEvaluationReport({
    comments: commentsResult.data ?? [],
    criteria: criteriaResult.data ?? [],
    evaluations: evaluationsResult.data ?? [],
    scores: scores ?? [],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-muted-foreground">프로젝트 리포트 · 교사 확정 평가 기준</p>
          <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{rubricResult.data?.title || "연결된 루브릭 없음"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={`/dashboard/projects/${project.id}`}>평가 작업대</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/projects">수업활동 목록</Link></Button>
        </div>
      </div>
      <ProjectEvaluationReportView projectId={project.id} report={report} />
    </div>
  );
}
