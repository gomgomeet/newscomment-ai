import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireUser } from "@/lib/auth/require-user";

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
    </div>
  );
}
