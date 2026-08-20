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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Compare</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          저장된 평가 결과를 프로젝트와 댓글 기준으로 비교합니다.
        </p>
      </div>
      {(evaluations ?? []).length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>비교할 평가가 없습니다</CardTitle>
            <CardDescription>프로젝트 상세에서 댓글 평가를 먼저 저장하세요.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {(evaluations ?? []).map((evaluation) => {
            const project = projectById.get(evaluation.project_id);
            const comment = commentById.get(evaluation.comment_id);

            return (
              <Card key={evaluation.id}>
                <CardHeader>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <CardTitle className="text-base">{project?.title ?? "프로젝트 없음"}</CardTitle>
                      <CardDescription>
                        {comment?.student_name || "이름 없는 댓글"} · {evaluation.model_name || "manual"}
                      </CardDescription>
                    </div>
                    <span className="rounded-md bg-muted px-2 py-1 text-sm font-medium text-muted-foreground">
                      총점 {evaluation.total_score ?? 0}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="line-clamp-3 rounded-md border border-border bg-background p-3 text-sm leading-6">
                    {comment?.content ?? "댓글을 찾을 수 없습니다."}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {evaluation.feedback || "종합 피드백 없음"}
                  </p>
                  {project ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/projects/${project.id}`}>프로젝트 열기</Link>
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
