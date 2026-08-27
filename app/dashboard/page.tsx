import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireUser } from "@/lib/auth/require-user";
import { summarizeProjectProgress } from "@/lib/evaluation-dashboard";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const [
    { data: projects, error: projectsError },
    { count: rubricCount, error: rubricCountError },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("rubrics")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id),
  ]);

  if (projectsError) {
    throw new Error(projectsError.message);
  }

  if (rubricCountError) {
    throw new Error(rubricCountError.message);
  }

  const projectIds = (projects ?? []).map((project) => project.id);
  const [
    { data: comments, error: commentsError },
    { data: evaluations, error: evaluationsError },
  ] = projectIds.length
    ? await Promise.all([
        supabase.from("comments").select("*").in("project_id", projectIds),
        supabase
          .from("evaluations")
          .select("*")
          .in("project_id", projectIds)
          .eq("evaluator_id", user.id),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (commentsError) {
    throw new Error(commentsError.message);
  }

  if (evaluationsError) {
    throw new Error(evaluationsError.message);
  }

  const progressRows = summarizeProjectProgress({
    projects: projects ?? [],
    comments: comments ?? [],
    evaluations: evaluations ?? [],
  });
  const activeRows = progressRows
    .filter((row) => row.commentCount > 0)
    .sort((a, b) => {
      if (a.remainingCount !== b.remainingCount) return b.remainingCount - a.remainingCount;
      return (b.lastEvaluationAt ?? b.project.updated_at).localeCompare(a.lastEvaluationAt ?? a.project.updated_at);
    });
  const totalComments = progressRows.reduce((sum, row) => sum + row.commentCount, 0);
  const totalEvaluated = progressRows.reduce((sum, row) => sum + row.evaluatedCount, 0);
  const totalRemaining = Math.max(totalComments - totalEvaluated, 0);
  const overallRate = totalComments > 0 ? totalEvaluated / totalComments : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">대시보드</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            수업활동별 채점 진행 상황과 다음에 볼 댓글을 확인합니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/projects">수업활동 관리</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="채점 진행률" value={`${Math.round(overallRate * 100)}%`} description={`${totalEvaluated}개 완료 · ${totalRemaining}개 남음`} />
        <StatCard title="진행 중인 댓글" value={totalComments} description={`${(projects ?? []).length}개 수업활동에 모인 댓글`} />
        <StatCard title="평가 루브릭" value={rubricCount ?? 0} description="기준과 배점을 묶어 둔 루브릭" />
      </div>
      <Card>
        <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <CardTitle>지금 할 일</CardTitle>
            <CardDescription>댓글을 가져온 수업활동의 채점 진행 상황입니다.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/projects">
              전체 보기
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activeRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">
              아직 댓글이 들어온 수업활동이 없습니다. 수업활동을 만들고 댓글을 가져오면 여기서 바로 이어서 채점할 수 있습니다.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activeRows.slice(0, 6).map((row) => {
                const percentage = Math.round(row.completionRate * 100);
                const isComplete = row.commentCount > 0 && row.remainingCount === 0;

                return (
                  <div key={row.project.id} className="grid gap-4 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/dashboard/projects/${row.project.id}`} className="font-medium text-foreground hover:underline">
                          {row.project.title}
                        </Link>
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {isComplete ? <CheckCircle2 className="size-3" aria-hidden="true" /> : <Clock3 className="size-3" aria-hidden="true" />}
                          {isComplete ? "채점 완료" : `${row.remainingCount}개 남음`}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          댓글 {row.commentCount}개 · 채점 {row.evaluatedCount}개 · 진행률 {percentage}%
                          {row.lastEvaluationAt ? ` · 마지막 채점 ${new Date(row.lastEvaluationAt).toLocaleDateString("ko-KR")}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant={isComplete ? "outline" : "default"}>
                      <Link href={`/dashboard/projects/${row.project.id}${isComplete ? "" : "?filter=remaining"}`}>
                        {isComplete ? "리포트 보기" : "이어서 채점하기"}
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
