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
    .eq("evaluator_id", user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            프로젝트, 루브릭, 평가 작업의 시작점입니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/projects">프로젝트 관리</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Projects" value={projectCount ?? 0} description="현재 계정에서 접근 가능한 프로젝트" />
        <StatCard title="Rubrics" value={rubricCount ?? 0} description="평가 기준 묶음과 배점 관리" />
        <StatCard title="Evaluations" value={evaluationCount ?? 0} description="저장된 수동 평가 결과" />
      </div>
    </div>
  );
}
