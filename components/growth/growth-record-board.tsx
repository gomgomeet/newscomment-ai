import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpenCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { openStudentSummary } from "@/app/dashboard/growth/actions";
import type { GrowthRecordActivity, GrowthRecordStudent } from "@/lib/growth/aggregate-growth-records";

function formatPercentage(value: number | null) {
  return value == null ? "-" : `${Math.round(value)}%`;
}

export function GrowthRecordBoard({
  activities,
  students,
  reviewStudentCount,
  unnamedResultCount,
}: {
  activities: GrowthRecordActivity[];
  students: GrowthRecordStudent[];
  reviewStudentCount: number;
  unnamedResultCount: number;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="overflow-hidden rounded-2xl border border-teal-900/10 bg-[linear-gradient(135deg,#f0fdfa_0%,#ffffff_62%,#eff6ff_100%)] p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-teal-700">과정중심평가 누적 보기</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">성장 기록 보드(생기부)</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              평가활동별 결과를 모아 교사가 먼저 살펴볼 학생과 기준을 찾습니다. 현재는 동일한 학생 표기를 기준으로 활동을 연결합니다.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/projects">평가활동 열기 <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={UserRoundCheck} label="누적 학생" value={students.length} tone="teal" />
        <SummaryCard icon={BookOpenCheck} label="평가활동" value={activities.length} tone="blue" />
        <SummaryCard icon={AlertTriangle} label="교사 확인 우선" value={reviewStudentCount} tone="amber" />
        <SummaryCard icon={Sparkles} label="식별자 확인 필요" value={unnamedResultCount} tone="slate" />
      </section>

      {students.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>아직 누적할 평가 결과가 없습니다</CardTitle>
            <CardDescription>학생 식별자가 있는 댓글 평가를 저장하면 활동별·학생별 성장 기록이 이곳에 표시됩니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/dashboard/projects">첫 평가 시작하기</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">교사 확인 우선</h3>
              <p className="mt-1 text-sm text-muted-foreground">근거·피드백·점수 상태를 기준으로 먼저 볼 학생을 선별했습니다.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {students.filter((student) => student.reviewReasons.length > 0).slice(0, 6).map((student) => (
                <StudentReviewCard key={student.studentKey} student={student} />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">학생별 누적 기록</h3>
              <p className="mt-1 text-sm text-muted-foreground">여러 활동의 평가를 같은 학생 표기 기준으로 묶었습니다.</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="hidden grid-cols-[minmax(140px,1fr)_80px_90px_90px_minmax(140px,1fr)_minmax(160px,1.2fr)] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-semibold text-muted-foreground md:grid">
                <span>학생</span><span>활동</span><span>평균</span><span>변화</span><span>강점 기준</span><span>다음 평가 포워드</span>
              </div>
              {students.map((student) => (
                <div key={student.studentKey} className="grid gap-3 border-b border-border px-5 py-4 [content-visibility:auto] [contain-intrinsic-size:auto_84px] last:border-b-0 md:grid-cols-[minmax(140px,1fr)_80px_90px_90px_minmax(140px,1fr)_minmax(160px,1.2fr)] md:items-center">
                  <div>
                    <p className="font-semibold">{student.studentKey}</p>
                    <p className="mt-1 text-xs text-muted-foreground">최근 · {student.latestActivityTitle}</p>
                  </div>
                  <p className="text-sm"><span className="md:hidden text-muted-foreground">활동 </span>{student.activityCount}개</p>
                  <p className="text-sm font-semibold">{formatPercentage(student.averagePercentage)}</p>
                  <p className={`text-sm font-semibold ${(student.changePercentage ?? 0) > 0 ? "text-teal-700" : (student.changePercentage ?? 0) < 0 ? "text-amber-800" : "text-muted-foreground"}`}>{student.changePercentage == null ? "-" : `${student.changePercentage > 0 ? "+" : ""}${Math.round(student.changePercentage)}%p`}</p>
                  <p className="text-sm text-muted-foreground">{student.strongestCriterion ?? "근거 없음"}</p>
                  <div><p className="text-sm text-indigo-800">{student.latestEvaluationForward ?? "아직 없음"}</p><form action={openStudentSummary} className="mt-2"><input type="hidden" name="student_key" value={student.studentKey} /><Button size="sm" variant="ghost">종합 기록 작성</Button></form></div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">평가활동별 현황</h3>
          <p className="mt-1 text-sm text-muted-foreground">완료율과 취약 기준을 확인하고 원평가로 이동합니다.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {activities.map((activity) => <ActivityCard key={activity.id} activity={activity} />)}
        </div>
      </section>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">다음 확장</CardTitle>
          <CardDescription>
            교사가 확정한 평가 포워드와 활동 간 변화가 누적됩니다. 학교 양식 PDF 기반 종합 기록 작성과 내보내기는 작성 도우미에서 이어집니다.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof UserRoundCheck; label: string; value: number; tone: "teal" | "blue" | "amber" | "slate" }) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <Card><CardContent className="flex items-center gap-4 p-5"><span className={`rounded-xl p-3 ${tones[tone]}`}><Icon className="h-5 w-5" /></span><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div></CardContent></Card>
  );
}

function StudentReviewCard({ student }: { student: GrowthRecordStudent }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div><CardTitle className="text-lg">{student.studentKey}</CardTitle><CardDescription className="mt-1">{student.latestActivityTitle} · 누적 {student.activityCount}개 활동</CardDescription></div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">평균 {formatPercentage(student.averagePercentage)}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">{student.reviewReasons.map((reason) => <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">{reason}</span>)}</div>
        <div className="grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">강점 기준</span><br />{student.strongestCriterion ?? "확인 필요"}</p><p><span className="text-muted-foreground">살펴볼 기준</span><br />{student.needsAttentionCriterion ?? "확인 필요"}</p></div>
        <p className="line-clamp-2 rounded-lg bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">{student.latestFeedback || "아직 저장된 종합 피드백이 없습니다."}</p>
        <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm leading-6 text-indigo-950"><span className="font-medium">다음 평가 포워드 · </span>{student.latestEvaluationForward || "아직 확정된 평가 포워드가 없습니다."}</p>
        <form action={openStudentSummary}><input type="hidden" name="student_key" value={student.studentKey} /><Button type="submit" size="sm" variant="outline">성장 근거·세특 작성 열기</Button></form>
      </CardContent>
    </Card>
  );
}

function ActivityCard({ activity }: { activity: GrowthRecordActivity }) {
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{activity.title}</CardTitle><CardDescription className="mt-1">댓글 {activity.commentCount} · 평가 {activity.evaluatedCount} · 확인 우선 {activity.reviewCount}</CardDescription></div><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">{activity.completionPercentage}% 완료</span></div></CardHeader>
      <CardContent className="space-y-4">
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${activity.title} 평가 완료율`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={activity.completionPercentage}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${activity.completionPercentage}%` }} />
        </div>
        <div className="flex flex-col justify-between gap-3 text-sm sm:flex-row sm:items-center"><div><span className="text-muted-foreground">평균 </span>{formatPercentage(activity.averagePercentage)}<span className="ml-3 text-muted-foreground">취약 기준 </span>{activity.weakestCriterion ?? "아직 없음"}</div><Button asChild size="sm" variant="outline"><Link href={`/dashboard/projects/${activity.id}`}>평가 열기</Link></Button></div>
        {activity.forwardSamples.length > 0 ? <div className="rounded-lg bg-indigo-50/60 p-3"><p className="text-xs font-semibold text-indigo-800">이 활동의 다음 지도 포인트</p><ul className="mt-2 space-y-1 text-sm text-indigo-950">{activity.forwardSamples.map((forward) => <li key={forward}>· {forward}</li>)}</ul></div> : null}
      </CardContent>
    </Card>
  );
}
