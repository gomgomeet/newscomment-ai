import Link from "next/link";
import { CheckCircle2, CircleDashed, ExternalLink, LockKeyhole, Save, Sparkles } from "lucide-react";
import { activateAssessmentPrep, saveAssessmentPrep } from "@/app/dashboard/prep/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentPrepReadiness } from "@/lib/assessment-prep/readiness";
import type { Database, Json } from "@/lib/db/types";
import type { EvaluationNotionConnectionStatus } from "@/lib/notion/teacher-connection";

type Prep = Database["public"]["Tables"]["assessment_preps"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];
type Rubric = Database["public"]["Tables"]["rubrics"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type PrepVersion = Database["public"]["Tables"]["assessment_prep_versions"]["Row"];

function asRecord(value: Json | null | undefined) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function textValue(record: Record<string, Json | undefined> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function formatStandards(value: Json) {
  if (!Array.isArray(value)) return "";
  return value.flatMap((standard) => {
    const record = asRecord(standard);
    const code = textValue(record, "code").trim();
    const text = (textValue(record, "text") || textValue(record, "summary")).trim();
    if (!code && !text) return [];
    return [code ? `${code} | ${text}` : text];
  }).join("\n");
}

export function AssessmentPrepEditor({
  prep,
  project,
  rubric,
  criteria,
  versions,
  readiness,
  notionConnection,
}: {
  prep: Prep;
  project: Project;
  rubric: Rubric | null;
  criteria: Criterion[];
  versions: PrepVersion[];
  readiness: AssessmentPrepReadiness;
  notionConnection: EvaluationNotionConnectionStatus;
}) {
  const notion = asRecord(prep.notion_config);
  const notionMode = textValue(notion, "content_mode") === "page_body" ? "page_body" : "property";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_64%,#ecfeff_100%)] p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold text-indigo-700">평가 준비 프렙</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{project.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              여기에 확정한 성취기준과 루브릭은 평가 초안, 교사 재채점, 성장 기록의 공통 기준이 됩니다.
              저장 중인 초안과 실제 평가에 쓰는 활성 버전은 분리됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-indigo-800 shadow-sm">
              준비 {readiness.completedCount}/6
            </span>
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
              활성 버전 v{prep.current_version}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/projects/${project.id}`}>평가활동 보기 <ExternalLink className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {readiness.stages.map((stage, index) => (
            <a key={stage.key} href={`#${stage.key}`} className="rounded-xl border border-indigo-100 bg-white/85 p-3 hover:border-indigo-300">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {stage.complete
                  ? <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  : <CircleDashed className="h-4 w-4 text-amber-600" />}
                {index + 1}단계
              </div>
              <p className="mt-2 text-sm font-semibold">{stage.label}</p>
            </a>
          ))}
        </div>
      </section>

      <form action={saveAssessmentPrep} className="space-y-6">
        <input type="hidden" name="prep_id" value={prep.id} />

        <Card id="context">
          <CardHeader>
            <CardTitle>1. 수업 맥락</CardTitle>
            <CardDescription>어떤 학생과 수업에서 무엇을 관찰할지 설명합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="grade_level">학년</Label>
              <Input id="grade_level" name="grade_level" defaultValue={prep.grade_level} placeholder="예: 초등학교 5학년" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">교과·영역</Label>
              <Input id="subject" name="subject" defaultValue={prep.subject} placeholder="예: 국어 · 매체 읽기와 쓰기" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="lesson_context">수업 맥락</Label>
              <Textarea id="lesson_context" name="lesson_context" defaultValue={prep.lesson_context} rows={4} placeholder="수업 주제, 학생이 수행한 과제, 관찰할 과정 등을 적어 주세요." />
            </div>
          </CardContent>
        </Card>

        <Card id="standards">
          <CardHeader>
            <CardTitle>2. 성취기준과 평가 목표</CardTitle>
            <CardDescription>한 줄에 하나씩 `성취기준 코드 | 원문` 형식으로 입력합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="achievement_standards">성취기준 원문</Label>
              <Textarea id="achievement_standards" name="achievement_standards" defaultValue={formatStandards(prep.achievement_standards)} rows={5} placeholder="[6국05-01] | 글의 구조를 고려하여 내용을 요약한다." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evaluation_goal">이번 평가 목표</Label>
              <Textarea id="evaluation_goal" name="evaluation_goal" defaultValue={prep.evaluation_goal} rows={4} placeholder="학생 결과물에서 확인할 지식·과정·태도를 구체적으로 적어 주세요." />
            </div>
          </CardContent>
        </Card>

        <Card id="rubric">
          <CardHeader>
            <CardTitle>3. 평가 기준 검토</CardTitle>
            <CardDescription>연결된 루브릭은 활성화 시 기준명·설명·배점까지 그대로 복사해 보존합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {rubric ? (
              <>
                <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center">
                  <div><p className="font-semibold">{rubric.title}</p><p className="mt-1 text-sm text-muted-foreground">{rubric.description || "설명 없음"}</p></div>
                  <Button asChild variant="outline" size="sm"><Link href={`/dashboard/rubrics/${rubric.id}`}>루브릭 편집</Link></Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {criteria.map((criterion) => (
                    <div key={criterion.id} className="rounded-xl border p-4">
                      <div className="flex justify-between gap-3"><p className="font-medium">{criterion.label}</p><span className="text-sm font-semibold text-indigo-700">{criterion.max_score}점</span></div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{criterion.description}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                연결된 루브릭이 없습니다. <Link href={`/dashboard/projects/${project.id}`} className="font-semibold underline">수업활동에서 루브릭을 선택</Link>해 주세요.
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="notion">
          <CardHeader>
            <CardTitle>4. Notion 결과물 읽기</CardTitle>
            <CardDescription>Notion 원본은 읽기만 하며 평가 결과를 되쓰지 않습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`rounded-xl border p-4 text-sm ${notionConnection.configured ? "border-teal-200 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <div className="flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4" />{notionConnection.configured ? `${notionConnection.workspaceLabel} 연결됨` : "Notion 읽기 토큰 연결 필요"}</div>
              <p className="mt-1 leading-6">
                {notionConnection.configured ? "Integration에 공유된 데이터베이스만 읽을 수 있습니다." : "평가 준비 목록의 ‘내 Notion 연결’에서 통합 토큰을 확인하고 저장해 주세요."}
              </p>
              <Link href="/dashboard/prep#notion-connection" className="mt-2 inline-flex font-semibold underline">Notion 연결 관리</Link>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notion_database_url">학생 결과물 데이터베이스 URL</Label>
              <Input id="notion_database_url" name="notion_database_url" type="url" defaultValue={textValue(notion, "database_url")} placeholder="https://www.notion.so/..." />
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/prep/${prep.id}/notion-preview`}>저장된 설정으로 연결 미리보기</Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="notion_content_mode">결과물 위치</Label>
                <Select id="notion_content_mode" name="notion_content_mode" defaultValue={notionMode}>
                  <option value="property">데이터베이스 속성</option>
                  <option value="page_body">각 학생 페이지 본문</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notion_student_property">학생 식별자 속성</Label>
                <Input id="notion_student_property" name="notion_student_property" defaultValue={textValue(notion, "student_property")} placeholder="예: 학생번호" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notion_content_property">결과물 내용 속성</Label>
                <Input id="notion_content_property" name="notion_content_property" defaultValue={textValue(notion, "content_property")} placeholder="본문 모드에서는 비워도 됩니다" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notion_activity_property">활동명 속성</Label>
                <Input id="notion_activity_property" name="notion_activity_property" defaultValue={textValue(notion, "topic_property")} placeholder="예: 활동명" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="guidance">
          <CardHeader><CardTitle>5. 학생 안내와 안전 규칙</CardTitle><CardDescription>평가 전에 학생에게 공개할 안내와 교사가 지킬 규칙을 분리합니다.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="student_guidance">학생 안내</Label><Textarea id="student_guidance" name="student_guidance" defaultValue={prep.student_guidance} rows={6} placeholder="결과물 제출 위치, 평가 기준, 수정 기회 등을 안내합니다." /></div>
            <div className="space-y-2"><Label htmlFor="safety_rules">안전·개인정보·AI 규칙</Label><Textarea id="safety_rules" name="safety_rules" defaultValue={prep.safety_rules} rows={6} placeholder="실명 최소화, 민감정보 제외, AI 초안은 교사가 최종 확인 등" /></div>
          </CardContent>
        </Card>

        <Card id="sample">
          <CardHeader><CardTitle>6. 샘플 시험 평가</CardTitle><CardDescription>예시 결과물 하나에 기준을 적용해 모호한 기준과 교사 확인 지점을 기록합니다.</CardDescription></CardHeader>
          <CardContent><Textarea name="sample_evaluation_notes" defaultValue={prep.sample_evaluation_notes} rows={6} placeholder="예: 사실 근거가 없는 주장은 2점 이하. 출처가 있으나 주장과 연결이 약하면 교사 확인 우선으로 분류." /></CardContent>
        </Card>

        <div className="sticky bottom-4 z-10 flex flex-col justify-between gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center">
          <div><p className="font-semibold">초안을 먼저 저장하세요.</p><p className="text-sm text-muted-foreground">저장해도 현재 활성 버전과 과거 평가는 바뀌지 않습니다.</p></div>
          <Button type="submit"><Save className="h-4 w-4" /> 초안 저장</Button>
        </div>
      </form>

      <Card>
        <CardHeader><CardTitle>활성 버전 만들기</CardTitle><CardDescription>6단계가 모두 준비되면 불변 스냅샷을 만들고 이후 평가의 기준으로 사용합니다.</CardDescription></CardHeader>
        <CardContent className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-indigo-600" /><div><p className="font-medium">현재 준비 {readiness.completedCount}/6</p><p className="text-sm text-muted-foreground">활성화 후 수정하면 다음 활성화 때 v{prep.current_version + 1}이 생성됩니다.</p></div></div>
          <form action={activateAssessmentPrep}><input type="hidden" name="prep_id" value={prep.id} /><Button type="submit" disabled={readiness.completedCount < 6}>이 평가안 활성화</Button></form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>버전 기록</CardTitle><CardDescription>과거 평가 기준은 수정하지 않고 계속 추적합니다.</CardDescription></CardHeader>
        <CardContent>
          {versions.length === 0 ? <p className="text-sm text-muted-foreground">아직 활성화된 버전이 없습니다.</p> : (
            <div className="space-y-2">{versions.map((version) => <div key={version.id} className="flex items-center justify-between rounded-xl border p-3"><span className="font-medium">v{version.version_number}</span><span className="text-sm text-muted-foreground">{new Date(version.created_at).toLocaleString("ko-KR")}</span></div>)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
