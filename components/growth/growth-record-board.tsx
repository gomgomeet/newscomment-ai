import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, FilePenLine, Sparkles } from "lucide-react";
import { openStudentSummary } from "@/app/dashboard/growth/actions";
import { Button } from "@/components/ui/button";
import type {
  GrowthRecordActivity,
  GrowthRecordActivitySpecial,
  GrowthRecordStudent,
} from "@/lib/growth/aggregate-growth-records";
import type { ActivitySpecialRecord, StudentRecordSummaryPreview } from "@/lib/growth/student-records";

type DisplayActivityRecord = GrowthRecordActivitySpecial & {
  generatedBy: ActivitySpecialRecord["generatedBy"];
};

type SubjectRecordGroup = {
  studentKey: string;
  subject: string;
  records: DisplayActivityRecord[];
};

function subjectRecordKey(studentKey: string, subject: string) {
  return `${studentKey}\u0000${subject}`;
}

function activityRecordKey(studentKey: string, subject: string, projectId: string) {
  return `${subjectRecordKey(studentKey, subject)}\u0000${projectId}`;
}

export function GrowthRecordBoard({
  activities,
  activitySpecialRecords,
  students,
  summaries,
  reviewStudentCount,
  unnamedResultCount,
  message,
  notice,
}: {
  activities: GrowthRecordActivity[];
  activitySpecialRecords: GrowthRecordActivitySpecial[];
  students: GrowthRecordStudent[];
  summaries: StudentRecordSummaryPreview[];
  reviewStudentCount: number;
  unnamedResultCount: number;
  message?: string;
  notice?: string;
}) {
  const summaryByStudentSubject = new Map(
    summaries.map((summary) => [subjectRecordKey(summary.studentKey, summary.evidence.subject), summary]),
  );
  const activityRecordByKey = new Map<string, DisplayActivityRecord>();

  for (const record of activitySpecialRecords) {
    activityRecordByKey.set(activityRecordKey(record.studentKey, record.subject, record.projectId), {
      ...record,
      generatedBy: "evidence-draft",
    });
  }

  for (const summary of summaries) {
    for (const record of summary.evidence.activityRecords) {
      const subject = record.subject || summary.evidence.subject;
      const key = activityRecordKey(summary.studentKey, subject, record.projectId);
      const fallback = activityRecordByKey.get(key);
      activityRecordByKey.set(key, {
        studentKey: summary.studentKey,
        projectId: record.projectId,
        activityTitle: record.activityTitle,
        subject,
        gradeLevel: fallback?.gradeLevel ?? summary.evidence.gradeLevel,
        evaluationIds: record.evaluationIds,
        confirmedAt: fallback?.confirmedAt ?? summary.updatedAt,
        recordText: record.recordText,
        evidenceSummary: record.evidenceSummary,
        generatedBy: record.generatedBy,
      });
    }
  }

  const subjectGroups = new Map<string, SubjectRecordGroup>();
  for (const record of activityRecordByKey.values()) {
    const key = subjectRecordKey(record.studentKey, record.subject);
    const group = subjectGroups.get(key) ?? {
      studentKey: record.studentKey,
      subject: record.subject,
      records: [],
    };
    group.records.push(record);
    subjectGroups.set(key, group);
  }
  const displayGroups = Array.from(subjectGroups.values()).toSorted((a, b) => {
    const studentOrder = a.studentKey.localeCompare(b.studentKey, "ko");
    return studentOrder !== 0 ? studentOrder : a.subject.localeCompare(b.subject, "ko");
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="border-b border-border pb-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-teal-700">교사 확정 평가 누적</p>
            <h2 className="mt-1 text-2xl font-semibold">과목별 세특 기록</h2>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/evaluation">평가 보드 <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      {message ? <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{message}</div> : null}
      {notice ? <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{notice}</div> : null}

      <section className="grid overflow-hidden rounded-md border bg-card sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="학생" value={students.length} />
        <Metric label="과목별 기록" value={displayGroups.length} />
        <Metric label="확인 우선" value={reviewStudentCount} />
        <Metric label="이름 확인 필요" value={unnamedResultCount} />
      </section>

      {displayGroups.length === 0 ? (
        <section className="rounded-md border bg-card p-6">
          <h3 className="font-semibold">아직 작성할 세특 근거가 없습니다</h3>
          <p className="mt-2 text-sm text-muted-foreground">교사가 확정한 평가가 생기면 학생별·과목별 활동 근거가 표시됩니다.</p>
          <Button asChild className="mt-4"><Link href="/dashboard/evaluation">평가 시작하기</Link></Button>
        </section>
      ) : (
        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">학생별·과목별 통합 세특</h3>
            <p className="mt-1 text-sm text-muted-foreground">같은 과목의 활동 근거만 모아 한 문장으로 종합합니다.</p>
          </div>
          <div className="overflow-hidden rounded-md border bg-card">
            <div className="hidden grid-cols-[120px_100px_minmax(260px,0.9fr)_minmax(360px,1.2fr)_120px] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-semibold text-muted-foreground lg:grid">
              <span>이름</span><span>과목</span><span>활동 근거</span><span>과목별 통합 세특</span><span className="text-right">작업</span>
            </div>
            {displayGroups.map((group) => {
              const summary = summaryByStudentSubject.get(subjectRecordKey(group.studentKey, group.subject));
              const records = group.records.toSorted((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
              const integratedText = summary
                ? (summary.status === "confirmed" ? summary.teacherFinalText : summary.draftText)
                : "아직 과목별 통합 세특 초안을 만들지 않았습니다.";
              return (
                <div key={subjectRecordKey(group.studentKey, group.subject)} className="grid gap-4 border-b px-4 py-4 last:border-b-0 lg:grid-cols-[120px_100px_minmax(260px,0.9fr)_minmax(360px,1.2fr)_120px] lg:items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{group.studentKey}</p>
                      {summary?.status === "confirmed" ? <CheckCircle2 className="h-4 w-4 text-teal-600" aria-label="교사 확정" /> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground lg:hidden">{group.subject}</p>
                  </div>
                  <p className="hidden text-sm font-semibold lg:block">{group.subject}</p>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-teal-800">
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /> 활동 {records.length}개
                    </summary>
                    <div className="mt-3 space-y-3 border-l-2 border-teal-200 pl-3">
                      {records.map((record) => (
                        <div key={record.projectId}>
                          <p className="text-sm font-semibold">{record.activityTitle}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{record.recordText}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{record.evidenceSummary}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                  <div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${summary?.status === "confirmed" ? "bg-teal-50 text-teal-700" : "bg-muted text-muted-foreground"}`}>
                      {summary?.status === "confirmed" ? "교사 확정" : summary ? "초안" : "미작성"}
                    </span>
                    <p className="mt-2 text-sm leading-6">{integratedText}</p>
                  </div>
                  <div className="flex justify-end">
                    {summary ? (
                      <Button asChild size="sm" variant="outline"><Link href={`/dashboard/growth/summaries/${summary.id}`}><FilePenLine className="h-4 w-4" /> 수정</Link></Button>
                    ) : (
                      <CreateSummaryButton studentKey={group.studentKey} subject={group.subject} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">평가활동 현황</h3>
        <div className="overflow-hidden rounded-md border bg-card">
          {activities.map((activity) => (
            <div key={activity.id} className="grid gap-2 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(220px,1fr)_100px_100px_120px_100px] sm:items-center">
              <p className="font-medium">{activity.title}</p>
              <p className="text-sm text-muted-foreground">{activity.subject}</p>
              <p className="text-sm text-muted-foreground">{activity.completionPercentage}% 완료</p>
              <p className="text-sm text-muted-foreground">확인 우선 {activity.reviewCount}건</p>
              <Button asChild size="sm" variant="ghost"><Link href={`/dashboard/projects/${activity.id}?view=answers`}>교사 피드백</Link></Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function CreateSummaryButton({ studentKey, subject }: { studentKey: string; subject: string }) {
  return (
    <form action={openStudentSummary}>
      <input type="hidden" name="student_key" value={studentKey} />
      <input type="hidden" name="subject" value={subject} />
      <Button type="submit" size="sm">
        <Sparkles className="h-4 w-4" /> 통합하기
      </Button>
    </form>
  );
}
