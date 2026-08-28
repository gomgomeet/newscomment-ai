import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";

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

  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));
  const commentById = new Map((comments ?? []).map((comment) => [comment.id, comment]));
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">저장된 평가</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          저장된 평가 결과를 수업활동과 댓글 기준으로 비교합니다.
        </p>
      </div>
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
                  {project ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/projects/${project.id}`}>수업활동 열기</Link>
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
