import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";

export default async function InsightsPage() {
  const { supabase, user } = await requireUser();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id);

  if (projectsError) {
    throw new Error(projectsError.message);
  }

  const projectIds = (projects ?? []).map((project) => project.id);
  const rubricIds = Array.from(
    new Set((projects ?? []).map((project) => project.rubric_id).filter(Boolean)),
  ) as string[];

  const { data: evaluations, error: evaluationsError } = projectIds.length
    ? await supabase
        .from("evaluations")
        .select("*")
        .in("project_id", projectIds)
        .eq("evaluator_id", user.id)
    : { data: [], error: null };

  if (evaluationsError) {
    throw new Error(evaluationsError.message);
  }

  const evaluationIds = (evaluations ?? []).map((evaluation) => evaluation.id);
  const { data: scores, error: scoresError } = evaluationIds.length
    ? await supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds)
    : { data: [], error: null };

  if (scoresError) {
    throw new Error(scoresError.message);
  }

  const { data: criteria, error: criteriaError } = rubricIds.length
    ? await supabase.from("rubric_criteria").select("*").in("rubric_id", rubricIds)
    : { data: [], error: null };

  if (criteriaError) {
    throw new Error(criteriaError.message);
  }

  const criterionById = new Map((criteria ?? []).map((criterion) => [criterion.id, criterion]));
  const aggregates = new Map<string, { total: number; count: number }>();

  for (const score of scores ?? []) {
    const current = aggregates.get(score.criterion_id) ?? { total: 0, count: 0 };
    aggregates.set(score.criterion_id, {
      total: current.total + score.score,
      count: current.count + 1,
    });
  }

  const rows = Array.from(aggregates.entries())
    .map(([criterionId, aggregate]) => {
      const criterion = criterionById.get(criterionId);
      const average = aggregate.count > 0 ? aggregate.total / aggregate.count : 0;
      const maxScore = criterion?.max_score ?? 1;
      const percentage = Math.min(Math.max((average / maxScore) * 100, 0), 100);

      return {
        criterionId,
        label: criterion?.label ?? "알 수 없는 기준",
        description: criterion?.description ?? "",
        average,
        maxScore,
        percentage,
        count: aggregate.count,
      };
    })
    .sort((a, b) => a.percentage - b.percentage);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Insights</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          저장된 평가 점수를 기준별 평균으로 요약합니다.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Projects</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{(projects ?? []).length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Evaluations</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{(evaluations ?? []).length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Scores</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{(scores ?? []).length}</CardContent>
        </Card>
      </div>
      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>분석할 평가 점수가 없습니다</CardTitle>
            <CardDescription>댓글 평가를 저장하면 기준별 평균이 표시됩니다.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Card key={row.criterionId}>
              <CardHeader>
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div>
                    <CardTitle className="text-base">{row.label}</CardTitle>
                    <CardDescription>{row.description || "설명 없음"}</CardDescription>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-sm font-medium text-muted-foreground">
                    평균 {row.average.toFixed(1)} / {row.maxScore}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${row.percentage}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">평가 {row.count}개 기준</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
