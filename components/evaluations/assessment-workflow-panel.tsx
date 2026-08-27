import { CheckCircle2, ClipboardCheck, Database, Sparkles } from "lucide-react";
import { saveAssessmentSpec } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentSpec } from "@/lib/assessment-spec";

export function AssessmentWorkflowPanel({
  projectId,
  spec,
  rubricReady,
  trialCount,
  pendingReviewCount,
}: {
  projectId: string;
  spec: AssessmentSpec | null;
  rubricReady: boolean;
  trialCount: number;
  pendingReviewCount: number;
}) {
  const steps = [
    { label: "평가 준비", done: Boolean(spec?.approved), detail: spec?.approved ? `${spec.version} 교사 승인` : "목표와 증거를 확인" },
    { label: "시험 채점", done: trialCount >= (spec?.trialCount ?? 3), detail: `${trialCount}/${spec?.trialCount ?? 3}건` },
    { label: "교사 검토", done: trialCount > 0 && pendingReviewCount === 0, detail: pendingReviewCount ? `${pendingReviewCount}건 대기` : "검토 반영" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>3F 평가 작업 흐름</CardTitle>
        <CardDescription>평가 준비 스킬의 설계를 승인한 뒤, 자동채점 스킬의 초안을 교사가 검토합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = index === 0 ? ClipboardCheck : index === 1 ? Sparkles : CheckCircle2;
            return (
              <div key={step.label} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{step.done ? "완료" : "진행 필요"}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
            );
          })}
        </div>

        <form action={saveAssessmentSpec} className="space-y-4 border-t border-border pt-5">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="assessment_version">버전</Label>
              <Input id="assessment_version" name="version" defaultValue={spec?.version ?? "v1.0"} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="achievement_standard">성취기준</Label>
              <Input id="achievement_standard" name="achievement_standard" required defaultValue={spec?.achievementStandard ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="learning_goal">평가목표</Label>
            <Textarea id="learning_goal" name="learning_goal" required defaultValue={spec?.learningGoal ?? ""} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="essential_question">핵심 질문</Label>
              <Textarea id="essential_question" name="essential_question" defaultValue={spec?.essentialQuestion ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evidence_description">평가할 학습 증거</Label>
              <Textarea id="evidence_description" name="evidence_description" defaultValue={spec?.evidenceDescription ?? ""} placeholder="예: 기사 근거를 인용해 자신의 판단을 설명한 댓글" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defer_conditions">AI가 판단을 보류할 조건</Label>
            <Input id="defer_conditions" name="defer_conditions" defaultValue={spec?.deferConditions ?? ""} placeholder="예: 원문 누락, 학생 결과물 공란, 근거 확인 불가" />
          </div>
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold">Notion 속성 연결</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="notion_student_property">학생 속성</Label><Input id="notion_student_property" name="notion_student_property" defaultValue={spec?.notionStudentProperty ?? "학생명"} /></div>
              <div className="space-y-2"><Label htmlFor="notion_input_property">결과물 속성</Label><Input id="notion_input_property" name="notion_input_property" defaultValue={spec?.notionInputProperty ?? "나의 생각"} /></div>
              <div className="space-y-2"><Label htmlFor="notion_feedback_property">피드백 속성</Label><Input id="notion_feedback_property" name="notion_feedback_property" defaultValue={spec?.notionFeedbackProperty ?? "교사 피드백"} /></div>
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input className="mt-1" type="checkbox" name="approved" defaultChecked={spec?.approved ?? false} disabled={!rubricReady} />
            <span><strong>교사 승인</strong><br /><span className="text-muted-foreground">루브릭과 위 설계를 확인했습니다. 승인 후 AI 시험 채점을 시작할 수 있습니다.</span></span>
          </label>
          {!rubricReady ? <p className="text-sm text-destructive">먼저 수업활동에 루브릭과 평가기준을 연결해 주세요.</p> : null}
          <Button type="submit">평가설계 저장</Button>
        </form>
      </CardContent>
    </Card>
  );
}
