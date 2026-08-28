import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectEvaluationReport } from "@/lib/evaluations/project-report";

function ProgressBar({ value, label }: { value: number; label: string }) {
  const roundedValue = Math.round(value);
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={roundedValue}
    >
      <div className="h-full bg-primary" style={{ width: `${roundedValue}%` }} />
    </div>
  );
}

export function ProjectEvaluationReportView({
  projectId,
  report,
}: {
  projectId: string;
  report: ProjectEvaluationReport;
}) {
  if (report.evaluatedCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>아직 확정된 교사 평가가 없습니다</CardTitle>
          <CardDescription>
            AI 초안을 원자료와 대조한 뒤 교사 평가를 저장하면 학급 리포트가 만들어집니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/dashboard/projects/${projectId}?filter=unevaluated`}>평가 작업대로 이동</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">제출 결과물</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{report.submittedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">교사 평가 완료</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{report.evaluatedCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">{report.completionRate.toFixed(0)}% 완료</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">학급 평균</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{report.averageTotal.toFixed(1)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{report.maxTotal}점 만점 · {report.averagePercentage.toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">먼저 확인할 학생</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{report.priorityStudents.length}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>점수 분포</CardTitle>
            <CardDescription>평균만 보지 않고 학급 안에 어떤 구간이 많은지 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.distribution.map((range) => (
              <div key={range.key} className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-3 text-sm">
                <span>{range.label}</span>
                <ProgressBar value={range.share} label={`${range.label} 학생 비율`} />
                <span className="text-right font-medium">{range.count}명</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>성취기준별 평균</CardTitle>
            <CardDescription>낮은 기준부터 표시해 다음 수업에서 다시 다룰 내용을 찾습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.criterionSummaries.map((criterion) => (
              <div key={criterion.id} className="space-y-2">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{criterion.label}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{criterion.description}</p>
                  </div>
                  <span className="shrink-0 font-medium">{criterion.average.toFixed(1)} / {criterion.maxScore}</span>
                </div>
                <ProgressBar value={criterion.percentage} label={`${criterion.label} 평균 달성률`} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>먼저 확인할 학생</CardTitle>
          <CardDescription>낮은 점수순 목록입니다. 순위를 확정하는 용도가 아니라 다음 피드백 대상을 고르는 데 사용합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.priorityStudents.map((student) => (
            <div key={student.evaluationId} className="flex flex-col justify-between gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium">{student.studentName}</p>
                <p className="mt-1 text-xs text-muted-foreground">먼저 볼 기준: {student.weakestCriterion}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{student.totalScore} / {report.maxTotal}</span>
                {student.sourceUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={student.sourceUrl} target="_blank" rel="noreferrer">원자료</a>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/projects/${projectId}#evaluation-${student.commentId}`}>평가 보기</Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>수업 예시 후보</CardTitle>
          <CardDescription>학생 이름을 가린 상태로 좋은 표현을 검토합니다. 공유 전에는 개인정보와 맥락을 다시 확인하세요.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          {report.highlights.map((highlight) => (
            <div key={highlight.evaluationId} className="rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{highlight.exampleLabel}</p>
                <span className="text-xs font-medium">{highlight.percentage.toFixed(0)}%</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{highlight.excerpt}</p>
              {highlight.feedback ? <p className="mt-3 text-xs leading-5">교사 피드백: {highlight.feedback}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
