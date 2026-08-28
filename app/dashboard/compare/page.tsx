import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import type { Database } from "@/lib/db/types";
import { readAiImprovementPlan } from "@/lib/evaluations/ai-improvement";

type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];

export default async function ComparePage() {
  const { supabase, user } = await requireUser();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (projectsError) {
    throw new Error(projectsError.message);
  }

  const projectIds = (projects ?? []).map((project) => project.id);
  const { data: comments, error: commentsError } = projectIds.length
    ? await supabase.from("comments").select("*").in("project_id", projectIds)
    : { data: [], error: null };

  if (commentsError) {
    throw new Error(commentsError.message);
  }

  const { data: evaluations, error: evaluationsError } = projectIds.length
    ? await supabase
        .from("evaluations")
        .select("*")
        .in("project_id", projectIds)
        .eq("evaluator_id", user.id)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };

  if (evaluationsError) {
    throw new Error(evaluationsError.message);
  }

  const evaluationIds = (evaluations ?? []).map((evaluation) => evaluation.id);
  const rubricIds = Array.from(
    new Set((projects ?? []).map((project) => project.rubric_id).filter((id): id is string => Boolean(id))),
  );
  const [scoresResult, criteriaResult] = await Promise.all([
    evaluationIds.length
      ? supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds)
      : Promise.resolve({ data: [], error: null }),
    rubricIds.length
      ? supabase.from("rubric_criteria").select("*").in("rubric_id", rubricIds).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (scoresResult.error || criteriaResult.error) {
    throw new Error((scoresResult.error || criteriaResult.error)?.message);
  }

  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));
  const commentById = new Map((comments ?? []).map((comment) => [comment.id, comment]));
  const criteriaByRubricId = new Map<string, Criterion[]>();
  for (const criterion of criteriaResult.data ?? []) {
    const rubricCriteria = criteriaByRubricId.get(criterion.rubric_id) ?? [];
    rubricCriteria.push(criterion);
    criteriaByRubricId.set(criterion.rubric_id, rubricCriteria);
  }
  const scoresByEvaluationId = new Map<string, Map<string, Score>>();
  for (const score of scoresResult.data ?? []) {
    const evaluationScores = scoresByEvaluationId.get(score.evaluation_id) ?? new Map();
    evaluationScores.set(score.criterion_id, score);
    scoresByEvaluationId.set(score.evaluation_id, evaluationScores);
  }
  const evaluationPairs = Array.from(
    (evaluations ?? []).reduce(
      (pairs, evaluation) => {
        const current = pairs.get(evaluation.comment_id) ?? {};
        if (evaluation.source === "teacher-manual") {
          current.teacher = evaluation;
        } else {
          current.ai = evaluation;
        }
        pairs.set(evaluation.comment_id, current);
        return pairs;
      },
      new Map<
        string,
        {
          teacher?: NonNullable<typeof evaluations>[number];
          ai?: NonNullable<typeof evaluations>[number];
        }
      >(),
    ),
  ).sort(([, a], [, b]) => {
    const aTime = new Date((a.teacher ?? a.ai)?.updated_at ?? 0).getTime();
    const bTime = new Date((b.teacher ?? b.ai)?.updated_at ?? 0).getTime();
    return bTime - aTime;
  });

  const criterionAgreement = new Map<
    string,
    { label: string; comparisons: number; exact: number; withinOne: number; totalGap: number; teacherTotal: number; aiTotal: number }
  >();
  let pairedCriterionCount = 0;
  let exactCriterionCount = 0;
  let totalCriterionGap = 0;
  let teacherHigherCount = 0;
  let aiHigherCount = 0;

  for (const [, pair] of evaluationPairs) {
    if (!pair.teacher || !pair.ai) continue;
    const project = projectById.get(pair.teacher.project_id);
    const projectCriteria = project?.rubric_id ? criteriaByRubricId.get(project.rubric_id) ?? [] : [];
    const teacherScores = scoresByEvaluationId.get(pair.teacher.id) ?? new Map();
    const aiScores = scoresByEvaluationId.get(pair.ai.id) ?? new Map();

    for (const criterion of projectCriteria) {
      const teacherScore = teacherScores.get(criterion.id)?.score;
      const aiScore = aiScores.get(criterion.id)?.score;
      if (teacherScore == null || aiScore == null) continue;

      const gap = Math.abs(teacherScore - aiScore);
      const aggregate = criterionAgreement.get(criterion.id) ?? {
        label: criterion.label,
        comparisons: 0,
        exact: 0,
        withinOne: 0,
        totalGap: 0,
        teacherTotal: 0,
        aiTotal: 0,
      };
      aggregate.comparisons += 1;
      aggregate.exact += gap === 0 ? 1 : 0;
      aggregate.withinOne += gap <= 1 ? 1 : 0;
      aggregate.totalGap += gap;
      aggregate.teacherTotal += teacherScore;
      aggregate.aiTotal += aiScore;
      criterionAgreement.set(criterion.id, aggregate);

      pairedCriterionCount += 1;
      exactCriterionCount += gap === 0 ? 1 : 0;
      totalCriterionGap += gap;
      teacherHigherCount += teacherScore > aiScore ? 1 : 0;
      aiHigherCount += aiScore > teacherScore ? 1 : 0;
    }
  }

  const agreementRows = Array.from(criterionAgreement.entries())
    .map(([id, aggregate]) => ({
      id,
      ...aggregate,
      exactRate: aggregate.comparisons > 0 ? (aggregate.exact / aggregate.comparisons) * 100 : 0,
      withinOneRate: aggregate.comparisons > 0 ? (aggregate.withinOne / aggregate.comparisons) * 100 : 0,
      averageGap: aggregate.comparisons > 0 ? aggregate.totalGap / aggregate.comparisons : 0,
      teacherAverage: aggregate.comparisons > 0 ? aggregate.teacherTotal / aggregate.comparisons : 0,
      aiAverage: aggregate.comparisons > 0 ? aggregate.aiTotal / aggregate.comparisons : 0,
    }))
    .sort((a, b) => a.exactRate - b.exactRate || b.averageGap - a.averageGap);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">AI·교사 평가 대조</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          AI 초안과 교사 최종평가의 기준별 차이를 확인해 AI를 어디까지 참고할지 판단합니다.
        </p>
      </div>
      {pairedCriterionCount > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">기준 점수 비교</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{pairedCriterionCount}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">정확히 일치</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{((exactCriterionCount / pairedCriterionCount) * 100).toFixed(0)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">{exactCriterionCount}개 기준</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">평균 점수 차이</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{(totalCriterionGap / pairedCriterionCount).toFixed(2)}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">차이 방향</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6">
                <p>교사가 높음 {teacherHigherCount}건</p>
                <p>AI가 높음 {aiHigherCount}건</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>성취기준별 일치율</CardTitle>
              <CardDescription>일치율이 낮거나 평균 차이가 큰 기준부터 표시합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agreementRows.map((row) => (
                <div key={row.id} className="rounded-md border border-border p-4">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <p className="font-medium">{row.label}</p>
                    <p className="text-sm font-medium">정확히 일치 {row.exactRate.toFixed(0)}% · ±1점 이내 {row.withinOneRate.toFixed(0)}%</p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${row.label} 정확한 점수 일치율`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.exactRate)}>
                    <div className="h-full bg-primary" style={{ width: `${row.exactRate}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    교사 평균 {row.teacherAverage.toFixed(1)} · AI 평균 {row.aiAverage.toFixed(1)} · 평균 차이 {row.averageGap.toFixed(2)} · 비교 {row.comparisons}건
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
      {evaluationPairs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>비교할 평가가 없습니다</CardTitle>
            <CardDescription>수업활동 상세에서 댓글 평가를 먼저 저장하세요.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {evaluationPairs.map(([commentId, pair]) => {
            const evaluation = pair.teacher ?? pair.ai;
            const project = evaluation ? projectById.get(evaluation.project_id) : null;
            const comment = commentById.get(commentId);
            const scoreDifference =
              pair.teacher?.total_score != null && pair.ai?.total_score != null
                ? pair.teacher.total_score - pair.ai.total_score
                : null;
            const projectCriteria = project?.rubric_id ? criteriaByRubricId.get(project.rubric_id) ?? [] : [];
            const teacherScores = pair.teacher ? scoresByEvaluationId.get(pair.teacher.id) ?? new Map() : new Map();
            const aiScores = pair.ai ? scoresByEvaluationId.get(pair.ai.id) ?? new Map() : new Map();
            const improvementPlan = pair.ai
              ? readAiImprovementPlan(pair.ai.raw_output)
              : { suggestions: [], revisionPrompt: null };
            const improvementByCriterion = new Map(
              improvementPlan.suggestions.map((suggestion) => [suggestion.criterion_id, suggestion]),
            );

            return (
              <Card key={commentId}>
                <CardHeader>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <CardTitle className="text-base">{project?.title ?? "수업활동 없음"}</CardTitle>
                      <CardDescription>
                        {comment?.student_name || "이름 없는 댓글"}
                      </CardDescription>
                    </div>
                    {scoreDifference !== null ? (
                      <span className="rounded-md bg-muted px-2 py-1 text-sm font-medium text-muted-foreground">
                        교사-AI {scoreDifference > 0 ? "+" : ""}
                        {scoreDifference.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="line-clamp-3 rounded-md border border-border bg-background p-3 text-sm leading-6">
                    {comment?.content ?? "댓글을 찾을 수 없습니다."}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs font-medium text-muted-foreground">교사 최종 평가</p>
                      <p className="mt-2 text-lg font-semibold">총점 {pair.teacher?.total_score ?? "-"}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {pair.teacher?.feedback || "저장된 교사 피드백 없음"}
                      </p>
                    </div>
                    <div className="rounded-md border border-dashed border-border p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        AI 초안 {pair.ai?.model_name ? `· ${pair.ai.model_name}` : ""}
                      </p>
                      <p className="mt-2 text-lg font-semibold">총점 {pair.ai?.total_score ?? "-"}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {pair.ai?.feedback || "저장된 AI 초안 없음"}
                      </p>
                    </div>
                  </div>
                  {pair.teacher && pair.ai && projectCriteria.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold">성취기준별 점수와 근거</p>
                      {projectCriteria.map((criterion) => {
                        const teacherScore = teacherScores.get(criterion.id);
                        const aiScore = aiScores.get(criterion.id);
                        const improvement = improvementByCriterion.get(criterion.id);
                        const difference =
                          teacherScore && aiScore ? teacherScore.score - aiScore.score : null;
                        return (
                          <div key={criterion.id} className="rounded-md border border-border p-4">
                            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                              <p className="font-medium">{criterion.label}</p>
                              <p className="text-sm font-medium">
                                교사 {teacherScore?.score ?? "-"} · AI {aiScore?.score ?? "-"}
                                {difference !== null ? ` · 차이 ${difference > 0 ? "+" : ""}${difference.toFixed(1)}` : ""}
                              </p>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <p className="text-xs leading-5 text-muted-foreground">교사 근거: {teacherScore?.rationale || "저장된 근거 없음"}</p>
                              <p className="text-xs leading-5 text-muted-foreground">AI 근거: {aiScore?.rationale || "저장된 근거 없음"}</p>
                            </div>
                            {improvement ? (
                              <div className="mt-3 rounded-md bg-primary/5 p-3 text-xs leading-5">
                                <p className="font-medium text-primary">향상 방법 제안</p>
                                <p className="mt-1">{improvement.suggestion}</p>
                                <p className="mt-1 text-muted-foreground">완료 확인: {improvement.success_check}</p>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {project ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/projects/${project.id}#evaluation-${commentId}`}>수업활동 열기</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
