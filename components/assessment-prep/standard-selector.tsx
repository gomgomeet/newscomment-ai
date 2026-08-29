"use client";

import { useMemo, useState } from "react";
import { BookOpenCheck, Check, ChevronDown, Plus, Save, Trash2, WandSparkles } from "lucide-react";
import { saveAssessmentContext } from "@/app/dashboard/prep/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAssessmentDesignRecommendation,
  buildEvaluationGoalFromStandards,
  getCurriculumSubjects,
} from "@/lib/curriculum/assessment-design-library";

type StandardOption = {
  id: string;
  subject: string;
  gradeBand: string;
  title: string;
  standard: string;
  classroomGoal: string;
};

type SavedStandard = {
  code: string;
  text: string;
};

const gradeOptions = [
  { value: "초등학교 3학년", band: "초등 3-4학년" },
  { value: "초등학교 4학년", band: "초등 3-4학년" },
  { value: "초등학교 5학년", band: "초등 5-6학년" },
  { value: "초등학교 6학년", band: "초등 5-6학년" },
  { value: "중학교 1학년", band: "중학교 1-3학년" },
  { value: "중학교 2학년", band: "중학교 1-3학년" },
  { value: "중학교 3학년", band: "중학교 1-3학년" },
  { value: "고등학교 1학년", band: "고등학교 1학년 공통" },
  { value: "고등학교 2학년", band: "고등학교 2-3학년 선택" },
  { value: "고등학교 3학년", band: "고등학교 2-3학년 선택" },
] as const;

function splitStandard(value: string) {
  const match = value.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  return match ? { code: match[1], text: match[2] } : { code: "", text: value };
}

function standardValue(option: StandardOption) {
  const { code, text } = splitStandard(option.standard);
  return code ? `[${code}] | ${text}` : text;
}

export function AssessmentStandardSelector({
  initialActivityName,
  initialGradeLevel,
  initialSubject,
  initialLessonContext,
  initialEvaluationGoal,
  initialStandards,
  options,
}: {
  initialActivityName: string;
  initialGradeLevel: string;
  initialSubject: string;
  initialLessonContext: string;
  initialEvaluationGoal: string;
  initialStandards: SavedStandard[];
  options: StandardOption[];
}) {
  const initialCodes = useMemo(
    () => new Set(initialStandards.map((standard) => standard.code.replace(/^\[|\]$/g, "")).filter(Boolean)),
    [initialStandards],
  );
  const [gradeLevel, setGradeLevel] = useState(initialGradeLevel);
  const [subject, setSubject] = useState(initialSubject);
  const [lessonContext, setLessonContext] = useState(initialLessonContext);
  const [evaluationGoal, setEvaluationGoal] = useState(initialEvaluationGoal);
  const appliedContext = {
    gradeBand: gradeOptions.find((grade) => grade.value === initialGradeLevel)?.band ?? "",
    subject: initialSubject,
  };
  const [selectedIds, setSelectedIds] = useState(() => new Set(
    options.filter((option) => initialCodes.has(splitStandard(option.standard).code)).map((option) => option.id),
  ));

  const gradeBand = gradeOptions.find((grade) => grade.value === gradeLevel)?.band ?? "";
  const subjects = getCurriculumSubjects();
  const subjectValues = subjects as readonly string[];
  const filteredOptions = options.filter(
    (option) => option.gradeBand === appliedContext.gradeBand && option.subject === appliedContext.subject,
  );
  const selectedOptions = Array.from(selectedIds).flatMap((id) => {
    const option = options.find((item) => item.id === id);
    return option ? [option] : [];
  });
  const knownCodes = new Set(options.map((option) => splitStandard(option.standard).code));
  const initialCustomStandards = initialStandards
    .filter((standard) => !knownCodes.has(standard.code.replace(/^\[|\]$/g, "")))
    .map((standard) => standard.code ? `${standard.code} | ${standard.text}` : standard.text)
    .join("\n");
  const [customStandards, setCustomStandards] = useState(initialCustomStandards);
  const designRecommendation = buildAssessmentDesignRecommendation({
    subject,
    gradeBand,
    lessonContext,
    standards: selectedOptions.map((option) => option.standard),
  });

  function addStandard(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  function removeStandard(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function createEvaluationGoal() {
    const standards = [
      ...selectedOptions.map((option) => option.standard),
      ...customStandards.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    ];
    setEvaluationGoal(buildEvaluationGoalFromStandards({ lessonContext, standards }));
  }

  return (
    <>
      {selectedOptions.map((option) => (
        <input key={option.id} type="hidden" name="achievement_standards" value={standardValue(option)} />
      ))}

      <Card id="context">
        <CardHeader className="p-4 pb-3">
          <CardTitle>1. 수업 맥락</CardTitle>
          <CardDescription>학년·교과와 수업 내용을 입력한 뒤 관련 성취기준을 불러옵니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="activity_name">활동명</Label>
            <Input
              id="activity_name"
              name="activity_name"
              defaultValue={initialActivityName}
              placeholder="예: 주민 참여 민주주의 사례를 읽고 생각 표현하기"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grade_level">학년</Label>
            <Select
              id="grade_level"
              name="grade_level"
              value={gradeLevel}
              onChange={(event) => setGradeLevel(event.target.value)}
            >
              <option value="">학년 선택</option>
              {initialGradeLevel && !gradeOptions.some((grade) => grade.value === initialGradeLevel) && (
                <option value={initialGradeLevel}>{initialGradeLevel}</option>
              )}
              {gradeOptions.map((grade) => <option key={grade.value} value={grade.value}>{grade.value}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">교과</Label>
            <Select
              id="subject"
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              <option value="">교과 선택</option>
              {initialSubject && !subjectValues.includes(initialSubject) && <option value={initialSubject}>{initialSubject}</option>}
              {subjects.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="lesson_context">수업 맥락</Label>
            <Textarea
              id="lesson_context"
              name="lesson_context"
              value={lessonContext}
              onChange={(event) => setLessonContext(event.target.value)}
              rows={2}
              className="min-h-16"
              placeholder="수업 주제, 학생이 수행한 과제, 관찰할 과정 등을 적어 주세요."
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" size="sm" formAction={saveAssessmentContext} disabled={!gradeBand || !subject}>
              <Save className="h-4 w-4" /> 수업 맥락 저장
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card id="standards">
        <CardHeader className="p-4 pb-3">
          <CardTitle>2. 성취기준과 평가 목표</CardTitle>
          <CardDescription>기준을 클릭해 아래 선택 목록에 추가합니다. 학년과 교과를 바꿔 계속 추가할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          {!appliedContext.gradeBand || !appliedContext.subject ? (
            <div className="flex min-h-20 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
              1단계에서 학년과 교과를 선택한 뒤 성취기준을 불러와 주세요.
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="flex min-h-20 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
              선택한 조건에 등록된 성취기준이 없습니다. 아래 직접 입력을 이용해 주세요.
            </div>
          ) : (
            <fieldset className="space-y-2">
              <legend className="mb-2 flex w-full items-center justify-between gap-3 text-sm font-semibold">
                <span>{appliedContext.gradeBand} · {appliedContext.subject}</span>
                <span className="font-normal text-muted-foreground">클릭하여 추가</span>
              </legend>
              <div className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
                {filteredOptions.map((option) => {
                  const selected = selectedIds.has(option.id);
                  return (
                    <button
                      type="button"
                      key={option.id}
                      onClick={() => addStandard(option.id)}
                      disabled={selected}
                      className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${selected ? "border-teal-300 bg-teal-50" : "hover:border-foreground/40 hover:bg-muted/40"}`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{option.title}</span>
                        <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{option.standard}</span>
                      </span>
                      <span className="mt-0.5 shrink-0 text-teal-700">
                        {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <a
                href="https://app.notion.com/p/3c4c5f01a4a480f18ae4fb01f792ddda"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline underline-offset-4"
              >
                <BookOpenCheck className="h-3.5 w-3.5" /> 원문 자료 보기
              </a>
            </fieldset>
          )}

          <section className="space-y-2 border-t pt-4" aria-labelledby="selected-standards-title">
            <div className="flex items-center justify-between gap-3">
              <h4 id="selected-standards-title" className="text-sm font-semibold">선택한 성취기준</h4>
              <span className="text-xs text-muted-foreground">{selectedOptions.length}개</span>
            </div>
            {selectedOptions.length === 0 ? (
              <p className="rounded-md bg-muted/40 px-3 py-3 text-sm text-muted-foreground">아직 선택한 성취기준이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {selectedOptions.map((option) => (
                  <div key={option.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-teal-800">{option.gradeBand} · {option.subject}</p>
                      <p className="mt-0.5 text-sm font-semibold">{option.title}</p>
                      <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{option.standard}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeStandard(option.id)}
                      aria-label={`${option.title} 삭제`}
                      title="선택에서 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <details className="rounded-md border px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              목록에 없는 성취기준 직접 입력
              <ChevronDown className="h-4 w-4" />
            </summary>
            <div className="mt-3 space-y-2">
              <Label htmlFor="custom_achievement_standards">성취기준 코드와 원문</Label>
              <Textarea
                id="custom_achievement_standards"
                name="custom_achievement_standards"
                value={customStandards}
                onChange={(event) => setCustomStandards(event.target.value)}
                rows={3}
                placeholder="[6국05-01] | 글의 구조를 고려하여 내용을 요약한다."
              />
            </div>
          </details>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="evaluation_goal">이번 평가 목표</Label>
              <Button
                type="button"
                size="sm"
                className="bg-indigo-700 text-white hover:bg-indigo-800"
                onClick={createEvaluationGoal}
                disabled={!lessonContext.trim() || (selectedOptions.length === 0 && !customStandards.trim())}
              >
                <WandSparkles className="h-4 w-4" /> 이번 평가 목표 만들기
              </Button>
            </div>
            <Textarea
              id="evaluation_goal"
              name="evaluation_goal"
              value={evaluationGoal}
              onChange={(event) => setEvaluationGoal(event.target.value)}
              rows={4}
              className="min-h-24"
              placeholder="선택한 성취기준을 이번 활동에서 어떻게 평가할지 적어 주세요."
            />
          </div>

          {designRecommendation ? (
            <section className="rounded-md border border-indigo-100 bg-indigo-50/60 p-4" aria-labelledby="assessment-library-title">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 id="assessment-library-title" className="text-sm font-semibold text-indigo-950">
                    교육과정 평가요소 라이브러리 초안
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-indigo-900/75">
                    HWP 원문에서 확인한 교과 영역과 평가 방향을 바탕으로 추천합니다. 원문 미제공 교과는 1차 골격으로 표시됩니다.
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-indigo-800">
                  {designRecommendation.sourceFiles.join(", ")}
                </span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {designRecommendation.selectedElements.map((element) => (
                  <div key={element.key} className="rounded-md border border-indigo-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{element.label}</p>
                      <span className="shrink-0 text-xs font-medium text-indigo-700">{element.domain}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">{element.lens}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{element.observableEvidence}</p>
                    <p className="mt-2 text-sm leading-6 text-indigo-950">{element.criterionStem}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 rounded-md bg-white px-3 py-2 text-xs leading-5 text-indigo-900/80">
                {designRecommendation.sourceNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
              <div className="mt-3 rounded-md bg-white px-3 py-2 text-sm leading-6 text-indigo-950">
                {designRecommendation.suggestedGoal}
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
