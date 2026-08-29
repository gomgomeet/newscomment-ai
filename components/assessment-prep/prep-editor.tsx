import Link from "next/link";
import { ArrowRight, Save, WandSparkles } from "lucide-react";
import { activateAssessmentPrep, createAssessmentRubric, saveAssessmentPrep } from "@/app/dashboard/prep/actions";
import { PrepRubricCriteria } from "@/components/assessment-prep/prep-rubric-criteria";
import { AssessmentStandardSelector } from "@/components/assessment-prep/standard-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssessmentPrepReadiness } from "@/lib/assessment-prep/readiness";
import { standardOptions } from "@/lib/curriculum/achievement-standards";
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

function readStandards(value: Json) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((standard) => {
    const record = asRecord(standard);
    const code = textValue(record, "code").trim();
    const text = (textValue(record, "text") || textValue(record, "summary")).trim();
    if (!code && !text) return [];
    return [{ code, text }];
  });
}

export function AssessmentPrepEditor({
  prep,
  project,
  rubric,
  criteria,
  versions: _versions,
  readiness,
  notionConnection: _notionConnection,
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
  const notionSourcePageUrl = textValue(notion, "source_page_url");
  const responseCollectionUrl = textValue(notion, "response_collection_url");
  const notionDatabaseUrl = textValue(notion, "database_url");

  return (
    <div className="space-y-6">
      <form id="assessment-prep-form" action={saveAssessmentPrep} className="space-y-6">
        <input type="hidden" name="prep_id" value={prep.id} />
        <input type="hidden" name="notion_source_page_url" value={notionSourcePageUrl} />
        <input type="hidden" name="notion_response_collection_url" value={responseCollectionUrl} />
        <input type="hidden" name="notion_database_url" value={notionDatabaseUrl} />
        <input type="hidden" name="notion_content_mode" value={notionMode} />
        <input type="hidden" name="notion_student_property" value={textValue(notion, "student_property")} />
        <input type="hidden" name="notion_content_property" value={textValue(notion, "content_property")} />
        <input type="hidden" name="notion_activity_property" value={textValue(notion, "topic_property")} />
        <input type="hidden" name="student_guidance" value={prep.student_guidance} />
        <input type="hidden" name="safety_rules" value={prep.safety_rules} />
        <input type="hidden" name="sample_evaluation_notes" value={prep.sample_evaluation_notes} />

        <AssessmentStandardSelector
          initialActivityName={project.title}
          initialGradeLevel={prep.grade_level}
          initialSubject={prep.subject}
          initialLessonContext={prep.lesson_context}
          initialEvaluationGoal={prep.evaluation_goal}
          initialStandards={readStandards(prep.achievement_standards)}
          options={standardOptions}
        />

        <div className="sticky bottom-4 z-10 flex flex-col justify-between gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center">
          <div><p className="font-semibold">평가 설계를 저장하세요.</p><p className="text-sm text-muted-foreground">학생 배포와 채점 운영은 평가 바로 하기에서 이어집니다.</p></div>
          <Button type="submit"><Save className="h-4 w-4" /> 초안 저장</Button>
        </div>
      </form>

      <Card id="rubric" className="scroll-mt-6">
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <CardTitle>3. 평가 루브릭</CardTitle>
              <CardDescription className="mt-1">
                수업 맥락과 성취기준에 맞는 평가 요소와 성취수준별 관찰 기준을 만듭니다.
              </CardDescription>
            </div>
            <Button
              type="submit"
              form="assessment-prep-form"
              formAction={createAssessmentRubric}
              size="sm"
            >
              <WandSparkles className="h-4 w-4" /> 루브릭 만들기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {rubric ? (
            <>
              <div className="flex flex-col justify-between gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <p className="font-semibold">{rubric.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">{rubric.description || "설명 없음"}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/rubrics/${rubric.id}`}>전체 편집</Link>
                </Button>
              </div>
              <PrepRubricCriteria prepId={prep.id} criteria={criteria} />
            </>
          ) : (
            <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              1·2번을 저장한 뒤 루브릭 만들기를 눌러 주세요.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>다음 단계</CardTitle>
          <CardDescription>설계가 끝나면 학생용 질문지 배포, 자동 채점, 교사 피드백, 생기부 기록으로 이어집니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <div className="flex flex-wrap justify-end gap-2">
            <form action={activateAssessmentPrep}>
              <input type="hidden" name="prep_id" value={prep.id} />
              <Button type="submit" disabled={readiness.completedCount < readiness.stages.length}>
                평가 설계 확정 <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
            <Button asChild variant="outline">
              <Link href="/dashboard/evaluation">
                평가 바로 하기
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
