import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectProgressCard } from "@/components/dashboard/project-progress-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireUser } from "@/lib/auth/require-user";
import { buildProjectProgress } from "@/lib/evaluations/progress";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const { count: projectCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  const { count: rubricCount } = await supabase
    .from("rubrics")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  const { count: evaluationCount } = await supabase
    .from("evaluations")
    .select("id", { count: "exact", head: true })
    .eq("evaluator_id", user.id)
    .eq("source", "teacher-manual");
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
    ? await supabase.from("comments").select("id, project_id").in("project_id", projectIds)
    : { data: [], error: null };

  if (commentsError) {
    throw new Error(commentsError.message);
  }

  const { data: evaluations, error: evaluationsError } = projectIds.length
    ? await supabase
        .from("evaluations")
        .select("comment_id, project_id, updated_at")
        .in("project_id", projectIds)
        .eq("evaluator_id", user.id)
        .eq("source", "teacher-manual")
    : { data: [], error: null };

  if (evaluationsError) {
    throw new Error(evaluationsError.message);
  }

  const progressProjects = buildProjectProgress(projects ?? [], comments ?? [], evaluations ?? [])
    .filter((project) => project.commentCount > 0)
    .sort((a, b) => {
      if (a.remainingCount !== b.remainingCount) {
        return b.remainingCount - a.remainingCount;
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">대시보드</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            수업활동과 루브릭을 만들고 댓글을 채점하는 곳입니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/projects">수업활동 관리</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="수업활동" value={projectCount ?? 0} description="내가 만든 댓글 평가 수업활동" />
        <StatCard title="평가 루브릭" value={rubricCount ?? 0} description="기준과 배점을 묶어 둔 루브릭" />
        <StatCard title="채점한 댓글" value={evaluationCount ?? 0} description="지금까지 저장한 평가" />
      </div>
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">지금 이어서 볼 수업활동</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            댓글 수와 교사 평가 수를 기준으로 남은 채점이 많은 수업활동을 먼저 보여 줍니다.
          </p>
        </div>
        {progressProjects.length === 0 ? (
          <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
            아직 채점할 댓글이 있는 수업활동이 없습니다.
          </p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {progressProjects.map((project) => (
              <ProjectProgressCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
