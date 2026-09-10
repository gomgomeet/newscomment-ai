import Link from "next/link";
import { ArrowRight, Check, Circle, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AssessmentPrepReadiness } from "@/lib/assessment-prep/readiness";

export function AssessmentPrepBanner({
  readiness,
}: {
  readiness: AssessmentPrepReadiness | null;
}) {
  if (!readiness) {
    return (
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-indigo-700">평가 준비 프렙</p>
            <h3 className="mt-1 text-xl font-semibold">수업활동을 만들고 평가 흐름을 연결하세요.</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              평가 목표와 성취기준을 정한 뒤 Notion 결과물을 읽어 평가·성장 기록으로 이어갑니다.
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/projects">첫 수업활동 만들기 <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_70%)] p-6">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
            <Workflow className="h-4 w-4" /> 평가 준비 프렙 → 평가 → 성장 기록
          </div>
          <h3 className="mt-2 text-xl font-semibold">{readiness.projectTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Notion은 학생 결과물을 읽는 입력 채널로만 사용하고, 교사 확정 평가와 누적 기록은 평가 대시보드에 보존합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-800">
            {readiness.completedCount}/{readiness.stages.length} 완료
          </span>
          <Button asChild size="sm">
            <Link href={readiness.nextStage?.href ?? "/dashboard/prep"}>
              {readiness.nextStage ? "준비 이어서 하기" : "연결 상태 보기"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {readiness.stages.map((stage, index) => (
          <Link
            key={stage.key}
            href={stage.href}
            className="rounded-xl border border-indigo-100 bg-white/80 p-3 transition-colors hover:border-indigo-300"
          >
            <div className="flex items-center gap-2">
              {stage.complete ? (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-teal-100 text-teal-700"><Check className="h-3.5 w-3.5" /></span>
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">{index + 1}단계</span>
            </div>
            <p className="mt-2 text-sm font-semibold">{stage.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
