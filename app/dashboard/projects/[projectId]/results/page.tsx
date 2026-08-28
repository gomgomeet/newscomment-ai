import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, Sparkles, TrendingDown, TriangleAlert, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { readNotionResultMetadata } from "@/lib/notion/result-metadata";

export default async function ProjectResultsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();
  if (projectError || !project) notFound();

  const [commentsResult, evaluationsResult, criteriaResult] = await Promise.all([
    supabase.from("comments").select("*").eq("project_id", project.id),
    supabase.from("evaluations").select("*").eq("project_id", project.id).eq("evaluator_id", user.id),
    project.rubric_id
      ? supabase.from("rubric_criteria").select("*").eq("rubric_id", project.rubric_id).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const queryError = commentsResult.error ?? evaluationsResult.error ?? criteriaResult.error;
  if (queryError) throw new Error(queryError.message);

  const comments = commentsResult.data ?? [];
  const allEvaluations = evaluationsResult.data ?? [];
  const evaluations = allEvaluations.filter(
    (evaluation) => evaluation.source === "teacher-manual" && evaluation.status === "confirmed",
  );
  const aiEvaluations = allEvaluations.filter((evaluation) => evaluation.source === "ai-draft");
  const criteria = criteriaResult.data ?? [];
  const evaluationIds = evaluations.map((evaluation) => evaluation.id);
  const scoresResult = evaluationIds.length
    ? await supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds)
    : { data: [], error: null };
  if (scoresResult.error) throw new Error(scoresResult.error.message);
  const scores = scoresResult.data ?? [];
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const scoresByEvaluation = new Map<string, typeof scores>();
  for (const score of scores) {
    const rows = scoresByEvaluation.get(score.evaluation_id) ?? [];
    rows.push(score);
    scoresByEvaluation.set(score.evaluation_id, rows);
  }
  const criterionRows = criteria.map((criterion) => {
    const criterionScores = scores.filter((score) => score.criterion_id === criterion.id);
    const average = criterionScores.length
      ? criterionScores.reduce((sum, score) => sum + score.score, 0) / criterionScores.length
      : null;
    return { criterion, average, percentage: average == null ? null : (average / criterion.max_score) * 100 };
  }).toSorted((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));
  const confirmedIds = new Set(evaluations.map((evaluation) => evaluation.comment_id));
  const aiDraftIds = new Set(aiEvaluations.map((evaluation) => evaluation.comment_id));
  const reviewPendingCount = Math.max(comments.length - confirmedIds.size, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4"><Button asChild variant="ghost"><Link href={`/dashboard/projects/${project.id}`}><ArrowLeft className="h-4 w-4" /> 평가 작업대로</Link></Button><span className="text-sm text-muted-foreground">{project.title}</span></div>
      <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-teal-700">평가활동 최종결과</p><h2 className="mt-1 text-2xl font-semibold">교사가 확정한 결과만 집계합니다.</h2><p className="mt-2 text-sm text-muted-foreground">제출 {comments.length}개 · AI 초안 {aiDraftIds.size}개 · 교사 확정 {evaluations.length}개 · 확인 대기 {reviewPendingCount}개</p></div><Button asChild><Link href={`/dashboard/compare?project=${project.id}`}>이 활동 검토하기</Link></Button></div></section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-5"><UsersRound className="h-5 w-5 text-blue-700" /><div><p className="text-sm text-muted-foreground">제출 학생 결과</p><p className="text-2xl font-semibold">{comments.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><Sparkles className="h-5 w-5 text-indigo-700" /><div><p className="text-sm text-muted-foreground">AI 평가 초안</p><p className="text-2xl font-semibold">{aiDraftIds.size}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><CheckCircle2 className="h-5 w-5 text-teal-700" /><div><p className="text-sm text-muted-foreground">교사 확정</p><p className="text-2xl font-semibold">{evaluations.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><TriangleAlert className="h-5 w-5 text-amber-700" /><div><p className="text-sm text-muted-foreground">교사 확인 대기</p><p className="text-2xl font-semibold">{reviewPendingCount}</p></div></CardContent></Card>
      </section>
      <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>기준별 학급 분포</CardTitle><CardDescription>확정 점수의 만점 대비 평균입니다.</CardDescription></div><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"><TrendingDown className="h-3.5 w-3.5" /> 취약 기준 · {criterionRows[0]?.criterion.label ?? "아직 없음"}</span></div></CardHeader><CardContent className="space-y-4">{criterionRows.map(({ criterion, average, percentage }) => <div key={criterion.id}><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{criterion.label}</span><span>{average == null ? "-" : `${average.toFixed(1)}/${criterion.max_score}`}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(Math.max(percentage ?? 0, 0), 100)}%` }} /></div></div>)}</CardContent></Card>
      <section className="space-y-4"><div><h3 className="text-xl font-semibold">학생별 최종결과와 평가 포워드</h3><p className="mt-1 text-sm text-muted-foreground">Notion 원결과물, 기준별 교사 근거와 확정 평가를 바로 대조할 수 있습니다.</p></div><div className="grid gap-4 lg:grid-cols-2">{evaluations.map((evaluation) => { const comment = commentById.get(evaluation.comment_id); const notionMetadata = comment ? readNotionResultMetadata(comment.metadata) : null; const scoreByCriterion = new Map((scoresByEvaluation.get(evaluation.id) ?? []).map((score) => [score.criterion_id, score])); return <Card key={evaluation.id}><CardHeader><div className="flex justify-between gap-3"><div><CardTitle className="text-lg">{comment?.student_name || "학생 식별자 없음"}</CardTitle><CardDescription>확정 v{evaluation.revision} · 총점 {evaluation.total_score ?? "-"}</CardDescription>{notionMetadata?.pageUrl ? <a href={notionMetadata.pageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">Notion 원본 보기 <ExternalLink className="h-3.5 w-3.5" /></a> : null}</div>{evaluation.review_reasons.length ? <span className="h-fit rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">확인 사유 {evaluation.review_reasons.length}</span> : null}</div></CardHeader><CardContent className="space-y-3"><p className="line-clamp-4 rounded-lg bg-muted/50 p-3 text-sm leading-6">{comment?.content || "원결과물 없음"}</p><p className="text-sm leading-6"><span className="font-medium">교사 피드백 · </span>{evaluation.feedback || "없음"}</p><p className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm leading-6 text-indigo-950"><span className="font-medium">평가 포워드 · </span>{evaluation.evaluation_forward || "아직 없음"}</p>{criteria.length ? <details className="rounded-lg border"><summary className="cursor-pointer px-3 py-2 text-sm font-semibold">기준별 점수와 교사 근거</summary><div className="space-y-2 border-t p-3">{criteria.map((criterion) => { const score = scoreByCriterion.get(criterion.id); return <div key={criterion.id} className="rounded-md bg-muted/50 p-2.5"><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{criterion.label}</span><span>{score?.score ?? "-"}/{criterion.max_score}</span></div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{score?.rationale || "교사 근거 없음"}</p></div>; })}</div></details> : null}<Button asChild size="sm" variant="outline"><Link href={`/dashboard/projects/${project.id}?view=all#comment-${evaluation.comment_id}`}>원평가 열기</Link></Button></CardContent></Card>; })}</div></section>
    </div>
  );
}
