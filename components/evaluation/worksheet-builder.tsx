"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Plus, Printer, Save, Trash2 } from "lucide-react";
import { saveAssessmentSurvey } from "@/app/dashboard/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type WorksheetCriterion = {
  id: string;
  label: string;
  description: string;
  maxScore: number;
};

type RubricLevel = "4" | "3" | "2" | "1";
type RubricLevels = Record<RubricLevel, string>;
type QuestionRubrics = Record<string, RubricLevels>;

const RUBRIC_LEVELS: RubricLevel[] = ["4", "3", "2", "1"];
const RUBRIC_MAX_SCORE = 4;

type WorksheetData = {
  projectTitle: string;
  gradeLevel: string;
  subject: string;
  lessonContext: string;
  evaluationGoal: string;
  criteria: WorksheetCriterion[];
  version: number;
  suggestedPrompt: string;
  projectId: string;
  surveyPath: string;
  surveyReady: boolean;
  savedTitle?: string;
  savedSourceText?: string;
  savedPrompts?: string[];
  savedCriteriaByQuestion?: string[][];
  savedRubricsByQuestion?: QuestionRubrics[];
  printOnLoad: boolean;
};

type CriterionCategory = "content" | "opinion" | "comparison" | "interaction";

function promptCategories(prompt: string) {
  const categories = new Set<CriterionCategory>();
  if (/(중심|요약|간추|사실|정보|내용을.{0,8}(찾|파악|정리)|자료에서.{0,12}(찾|활용))/.test(prompt)) {
    categories.add("content");
  }
  if (/(자신|나의).{0,8}(생각|의견)|의견|주장|이유|근거/.test(prompt)) {
    categories.add("opinion");
  }
  if (/(비교|공통점|차이점|관계)/.test(prompt)) categories.add("comparison");
  if (/(친구|댓글|질문|응답|존중|대화|상호작용)/.test(prompt)) categories.add("interaction");
  if (categories.size === 0 && /(읽|글|자료|기사)/.test(prompt)) categories.add("content");
  return categories;
}

function criterionCategory(criterion: WorksheetCriterion): CriterionCategory {
  const label = criterion.label;
  const text = `${label} ${criterion.description}`;
  if (/(상호작용|존중|질문|응답|대화)/.test(label)) return "interaction";
  if (/(비교|공통|차이|관계)/.test(label)) return "comparison";
  if (/(생각|의견|표현|주장|이유|근거|연결)/.test(label)) return "opinion";
  if (/(이해|내용|중심|요약|자료|정보|탐색|파악|사실)/.test(label)) return "content";
  if (/(상호작용|존중|질문|응답|대화)/.test(text)) return "interaction";
  if (/(생각|의견|표현|주장|이유|근거|연결)/.test(text)) return "opinion";
  return "content";
}

function suggestCriteriaForPrompt(prompt: string, criteria: WorksheetCriterion[]) {
  const categories = promptCategories(prompt);
  const matches = criteria.filter((criterion) => categories.has(criterionCategory(criterion)));
  return (matches.length > 0 ? matches : criteria.slice(0, 1)).map((criterion) => criterion.id);
}

function defaultRubricLevels(criterion: WorksheetCriterion): RubricLevels {
  const category = criterionCategory(criterion);
  if (category === "content") {
    return {
      "4": "자료의 핵심 내용과 중요한 정보를 정확하게 이해하고, 답안에서 구체적으로 활용한다.",
      "3": "자료의 핵심 내용을 대체로 정확하게 이해하고 활용한다.",
      "2": "자료 내용의 일부를 이해하고 있으나 핵심 내용이나 정보 활용이 부족하다.",
      "1": "자료 내용을 잘못 이해했거나 관련된 내용이 거의 나타나지 않는다.",
    };
  }
  if (category === "opinion") {
    return {
      "4": "자신의 생각이 분명하며, 구체적인 이유나 근거를 들어 설득력 있게 표현한다.",
      "3": "자신의 생각과 그 이유를 비교적 분명하게 표현한다.",
      "2": "자신의 생각은 나타나지만 이유나 근거가 부족하거나 설명이 충분하지 않다.",
      "1": "자신의 생각이 불분명하거나 이유와 근거가 거의 나타나지 않는다.",
    };
  }
  if (category === "comparison") {
    return {
      "4": "두 대상의 공통점과 차이점을 구체적인 근거와 함께 분명하게 비교한다.",
      "3": "두 대상의 공통점과 차이점을 대체로 알맞게 비교한다.",
      "2": "공통점이나 차이점의 일부만 제시하거나 비교 근거가 부족하다.",
      "1": "두 대상의 관계나 공통점과 차이점이 거의 나타나지 않는다.",
    };
  }
  return {
    "4": "상대의 의견을 존중하며 적절한 질문과 응답으로 생각을 발전시킨다.",
    "3": "상대의 의견을 듣고 알맞게 질문하거나 응답한다.",
    "2": "질문이나 응답은 있으나 상대 의견과의 연결이 부족하다.",
    "1": "상대 의견에 대한 질문이나 응답이 거의 나타나지 않는다.",
  };
}

function createQuestionRubrics(criteria: WorksheetCriterion[], saved?: QuestionRubrics) {
  return Object.fromEntries(criteria.map((criterion) => {
    const defaults = defaultRubricLevels(criterion);
    const savedLevels = saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved[criterion.id]
      : undefined;
    return [criterion.id, Object.fromEntries(RUBRIC_LEVELS.map((level) => [
      level,
      typeof savedLevels?.[level] === "string" ? savedLevels[level].trim() || defaults[level] : defaults[level],
    ])) as RubricLevels];
  }));
}

function buildScoreBands(maxScore: number, criterionCount: number) {
  const minimumScore = Math.min(Math.max(criterionCount, 1), maxScore);
  const width = Math.max(maxScore - minimumScore + 1, 1);
  const normalMin = minimumScore + Math.floor(width * 0.25);
  const goodMin = minimumScore + Math.floor(width * 0.5);
  const excellentMin = minimumScore + Math.floor(width * 0.75);
  return [
    { level: "매우 잘함", min: excellentMin, max: maxScore },
    { level: "잘함", min: goodMin, max: Math.max(excellentMin - 1, goodMin) },
    { level: "보통", min: normalMin, max: Math.max(goodMin - 1, normalMin) },
    { level: "노력 필요", min: minimumScore, max: Math.max(normalMin - 1, minimumScore) },
  ];
}

function scoreRange(min: number, max: number) {
  return min === max ? `${min}점` : `${min}~${max}점`;
}

export function WorksheetBuilder({
  worksheet,
  message,
  notice,
}: {
  worksheet: WorksheetData;
  message?: string;
  notice?: string;
}) {
  const savedTitle = typeof worksheet.savedTitle === "string" ? worksheet.savedTitle : "";
  const savedSourceText = typeof worksheet.savedSourceText === "string" ? worksheet.savedSourceText : "";
  const savedPrompts = Array.isArray(worksheet.savedPrompts)
    ? worksheet.savedPrompts.filter((prompt): prompt is string => typeof prompt === "string")
    : [];
  const savedCriteriaByQuestion = Array.isArray(worksheet.savedCriteriaByQuestion)
    ? worksheet.savedCriteriaByQuestion
    : [];
  const savedRubricsByQuestion = Array.isArray(worksheet.savedRubricsByQuestion)
    ? worksheet.savedRubricsByQuestion
    : [];
  const initialPrompts = savedPrompts.length > 0 ? savedPrompts : [worksheet.suggestedPrompt];
  const criterionIds = new Set(worksheet.criteria.map((criterion) => criterion.id));
  const [title, setTitle] = useState(savedTitle || `${worksheet.projectTitle} 평가지`);
  const [sourceText, setSourceText] = useState(savedSourceText);
  const [prompts, setPrompts] = useState(initialPrompts);
  const [criteriaByQuestion, setCriteriaByQuestion] = useState(() => initialPrompts.map((prompt, index) => {
    const savedRow = savedCriteriaByQuestion[index];
    const saved = Array.isArray(savedRow)
      ? savedRow.filter((criterionId) => typeof criterionId === "string" && criterionIds.has(criterionId))
      : [];
    return saved.length > 0 ? saved : suggestCriteriaForPrompt(prompt, worksheet.criteria);
  }));
  const [rubricsByQuestion, setRubricsByQuestion] = useState(() => initialPrompts.map((_, index) => (
    createQuestionRubrics(worksheet.criteria, savedRubricsByQuestion[index])
  )));
  const [copied, setCopied] = useState(false);
  const criteriaForQuestion = prompts.map((_, index) => {
    const selectedIds = new Set(criteriaByQuestion[index] ?? []);
    return worksheet.criteria.filter((criterion) => selectedIds.has(criterion.id));
  });
  const pointsByQuestion = criteriaForQuestion.map((criteria) => criteria.length * RUBRIC_MAX_SCORE);
  const worksheetTotalPoints = pointsByQuestion.reduce((sum, points) => sum + points, 0);

  useEffect(() => {
    if (!worksheet.printOnLoad) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [worksheet.printOnLoad]);

  function printWorksheet() {
    if (!sourceText.trim() && !window.confirm("평가 자료가 비어 있습니다. 그대로 인쇄할까요?")) return;
    window.print();
  }

  async function copySurveyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${worksheet.surveyPath}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function updatePrompt(index: number, value: string) {
    setPrompts((current) => current.map((prompt, promptIndex) => promptIndex === index ? value : prompt));
  }

  function addPrompt() {
    setPrompts((current) => current.length >= 10 ? current : [...current, ""]);
    setCriteriaByQuestion((current) => [...current, []]);
    setRubricsByQuestion((current) => [...current, createQuestionRubrics(worksheet.criteria)]);
  }

  function removePrompt(index: number) {
    setPrompts((current) => current.length === 1 ? current : current.filter((_, promptIndex) => promptIndex !== index));
    setCriteriaByQuestion((current) => current.length === 1 ? current : current.filter((_, promptIndex) => promptIndex !== index));
    setRubricsByQuestion((current) => current.length === 1 ? current : current.filter((_, promptIndex) => promptIndex !== index));
  }

  function toggleCriterion(questionIndex: number, criterionId: string) {
    setCriteriaByQuestion((current) => current.map((selected, index) => {
      if (index !== questionIndex) return selected;
      return selected.includes(criterionId)
        ? selected.filter((id) => id !== criterionId)
        : [...selected, criterionId];
    }));
  }

  function applySuggestedCriteria(questionIndex: number) {
    setCriteriaByQuestion((current) => current.map((selected, index) => (
      index === questionIndex ? suggestCriteriaForPrompt(prompts[questionIndex] ?? "", worksheet.criteria) : selected
    )));
  }

  function updateRubricLevel(questionIndex: number, criterionId: string, level: RubricLevel, value: string) {
    setRubricsByQuestion((current) => current.map((rubrics, index) => (
      index === questionIndex
        ? { ...rubrics, [criterionId]: { ...rubrics[criterionId], [level]: value } }
        : rubrics
    )));
  }

  return (
    <div className="mx-auto max-w-[210mm] space-y-4 py-2 print:max-w-none print:space-y-0 print:py-0">
      <style>{"@media print { @page { size: A4; margin: 12mm; } }"}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost">
          <Link href="/dashboard/evaluation"><ArrowLeft className="h-4 w-4" /> 평가 바로 하기로</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" disabled={!worksheet.surveyReady}>
            {worksheet.surveyReady ? (
              <Link href={worksheet.surveyPath} target="_blank">학생 설문 열기 <ExternalLink className="h-4 w-4" /></Link>
            ) : <span>학생 평가지 열기</span>}
          </Button>
          <Button type="button" variant="outline" onClick={copySurveyLink} disabled={!worksheet.surveyReady}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "복사됨" : "배포 링크 복사"}
          </Button>
          <Button type="button" onClick={printWorksheet}><Printer className="h-4 w-4" /> 인쇄·PDF 저장</Button>
        </div>
      </div>

      {message ? <p className="rounded-md border border-destructive px-4 py-3 text-sm text-destructive print:hidden">{message}</p> : null}
      {notice ? <p className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900 print:hidden">{notice}</p> : null}

      {!worksheet.surveyReady ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:hidden">
          평가 자료와 문항을 저장하면 학생용 평가지 링크가 열립니다.
        </p>
      ) : null}

      <form action={saveAssessmentSurvey} className="space-y-4 rounded-md border bg-background p-5 print:hidden">
        <input type="hidden" name="project_id" value={worksheet.projectId} />
        <input type="hidden" name="question_criteria" value={JSON.stringify(criteriaByQuestion)} />
        <input type="hidden" name="question_rubrics" value={JSON.stringify(rubricsByQuestion)} />
        <h2 className="text-lg font-semibold">평가지 내용 편집</h2>
        <div className="space-y-2">
          <Label htmlFor="worksheet_title">평가지 제목</Label>
          <Input id="worksheet_title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="worksheet_source">평가 자료</Label>
          <Textarea
            id="worksheet_source"
            name="source_text"
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            rows={8}
            placeholder="학생이 읽거나 살펴볼 글, 기사, 자료를 붙여 넣으세요."
            required
          />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="worksheet_prompt_0">수행 문항</Label>
            <Button type="button" variant="outline" size="sm" onClick={addPrompt} disabled={prompts.length >= 10}>
              <Plus className="h-4 w-4" /> 문항 추가
            </Button>
          </div>
          {prompts.map((prompt, index) => (
            <div key={index} className="space-y-2 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`worksheet_prompt_${index}`} className="sr-only">{index + 1}번 문항</Label>
                  <Textarea
                    id={`worksheet_prompt_${index}`}
                    name="prompts"
                    value={prompt}
                    onChange={(event) => updatePrompt(index, event.target.value)}
                    rows={3}
                    placeholder={`${index + 1}번 문항을 입력하세요.`}
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-10 shrink-0 p-0 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                  onClick={() => removePrompt(index)}
                  disabled={prompts.length === 1}
                  aria-label={`${index + 1}번 문항 삭제`}
                  title="문항 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {worksheet.criteria.map((criterion) => (
                    <label key={criterion.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(criteriaByQuestion[index] ?? []).includes(criterion.id)}
                        onChange={() => toggleCriterion(index, criterion.id)}
                        className="h-4 w-4 accent-teal-700"
                      />
                      <span>{criterion.label}</span>
                    </label>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => applySuggestedCriteria(index)}>
                  평가 요소 추천
                </Button>
              </div>
              {(criteriaByQuestion[index] ?? []).length > 0 ? (
                <details className="rounded-md border bg-muted/20">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">수준별 기준 작성·확인</summary>
                  <div className="overflow-x-auto border-t p-3">
                    <table className="min-w-[900px] border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="w-36 border px-2 py-2 text-left">평가 요소</th>
                          {RUBRIC_LEVELS.map((level) => (
                            <th key={level} className="border px-2 py-2 text-left">{level}점 {level === "4" ? "매우 잘함" : level === "3" ? "잘함" : level === "2" ? "노력 필요" : "더 연습 필요"}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {worksheet.criteria.filter((criterion) => (criteriaByQuestion[index] ?? []).includes(criterion.id)).map((criterion) => (
                          <tr key={criterion.id}>
                            <th className="border px-2 py-2 text-left align-top">{criterion.label}</th>
                            {RUBRIC_LEVELS.map((level) => (
                              <td key={level} className="border p-1 align-top">
                                <Textarea
                                  value={rubricsByQuestion[index]?.[criterion.id]?.[level] ?? ""}
                                  onChange={(event) => updateRubricLevel(index, criterion.id, level, event.target.value)}
                                  rows={5}
                                  className="min-h-28 resize-y text-xs leading-5"
                                  aria-label={`${index + 1}번 문항 ${criterion.label} ${level}점 기준`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex justify-end"><Button type="submit"><Save className="h-4 w-4" /> 평가지 저장</Button></div>
      </form>

      <section id="saved-worksheet" className="scroll-mt-6 space-y-3 print:space-y-0">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border bg-background px-5 py-4 print:hidden">
          <div>
            <h2 className="text-lg font-semibold">{worksheet.surveyReady ? "저장된 평가지" : "평가지 미리보기"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              문항 {prompts.length}개 · 문항별 선택 루브릭 적용 · 총 {worksheetTotalPoints}점
            </p>
          </div>
          <p className="text-sm font-medium text-teal-800">
            {worksheet.surveyReady ? "학생 배포와 출력 준비 완료" : "저장하면 학생용 링크가 생성됩니다."}
          </p>
        </div>

      <main className="min-h-[277mm] bg-white px-[14mm] py-[12mm] text-black shadow-sm ring-1 ring-black/10 print:min-h-0 print:px-0 print:py-0 print:shadow-none print:ring-0">
        <header className="border-b-2 border-black pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold">{[worksheet.gradeLevel, worksheet.subject].filter(Boolean).join(" · ")}</p>
              <h1 className="mt-1 text-2xl font-bold">{title || "평가지"}</h1>
            </div>
            <p className="text-xs text-neutral-500">평가 설계 v{worksheet.version}</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-8 text-sm">
            <div className="flex items-end gap-2"><span className="shrink-0 font-semibold">이름</span><span className="h-6 flex-1 border-b border-black" /></div>
            <div className="flex items-end gap-2"><span className="shrink-0 font-semibold">날짜</span><span className="h-6 flex-1 border-b border-black" /></div>
          </div>
        </header>

        <section className="mt-6 break-inside-avoid">
          <h2 className="text-base font-bold">평가 자료</h2>
          <div className="mt-2 min-h-40 whitespace-pre-wrap border border-black px-4 py-3 text-sm leading-7">
            {sourceText.trim() || <span className="text-neutral-400 print:text-transparent">평가 자료를 입력하세요.</span>}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-bold">수행 문항</h2>
          <div className="mt-3 space-y-6">
            {prompts.map((prompt, index) => (
              <div key={index} className="break-inside-avoid">
                <p className="border-l-4 border-black bg-neutral-100 px-4 py-3 text-sm font-semibold leading-7">
                  {index + 1}. {prompt || "문항을 입력하세요."}
                </p>
                <div className="mt-3 h-48 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,#d4d4d4_32px)]" />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 border-t border-black pt-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-bold">루브릭 점수 계산</h2>
              <p className="mt-1 text-xs text-neutral-500">각 문항에서 실제로 확인할 수 있는 평가 요소만 적용합니다.</p>
            </div>
            <p className="text-sm font-bold">총 {worksheetTotalPoints}점</p>
          </div>
          <div className="mt-4 space-y-5">
            {prompts.map((prompt, questionIndex) => {
              const selectedCriteria = criteriaForQuestion[questionIndex] ?? [];
              const questionPoints = pointsByQuestion[questionIndex] ?? 0;
              const criterionLabels = selectedCriteria.map((criterion) => criterion.label).join(" · ");
              const scoreBands = buildScoreBands(questionPoints, selectedCriteria.length);
              const questionRubrics = rubricsByQuestion[questionIndex] ?? {};
              return (
              <div key={questionIndex} className="break-inside-avoid space-y-3">
                <div className="flex items-center justify-between gap-3 bg-neutral-100 px-3 py-2 text-sm font-bold">
                  <span>{questionIndex + 1}번 문항</span>
                  <span>{questionPoints}점 만점</span>
                </div>
                <p className="border-x border-black px-3 py-2 text-xs leading-5">{prompt || "문항을 입력하세요."}</p>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="w-32 border border-black px-2 py-2 text-left">평가 요소</th>
                      {RUBRIC_LEVELS.map((level) => (
                        <th key={level} className="border border-black px-2 py-2 text-left">
                          {level}점 {level === "4" ? "매우 잘함" : level === "3" ? "잘함" : level === "2" ? "노력 필요" : "더 연습 필요"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCriteria.map((criterion) => (
                      <tr key={criterion.id}>
                        <th className="border border-black px-2 py-2 text-left align-top">{criterion.label}</th>
                        {RUBRIC_LEVELS.map((level) => (
                          <td key={level} className="border border-black px-2 py-2 align-top leading-5">
                            {questionRubrics[criterion.id]?.[level] ?? defaultRubricLevels(criterion)[level]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-end gap-3 border border-black px-3 py-2 text-sm font-bold">
                  <span>문항 점수</span><span className="min-w-24 border-b border-black text-center">/ {questionPoints}점</span>
                </div>
                {selectedCriteria.length > 0 ? (
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="w-24 border border-black px-2 py-2 text-left">성취수준</th>
                        <th className="w-24 border border-black px-2 py-2">점수 범위</th>
                        <th className="border border-black px-2 py-2 text-left">학생 상태</th>
                        <th className="border border-black px-2 py-2 text-left">다음 지도 방향</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoreBands.map((band, bandIndex) => (
                        <tr key={band.level}>
                          <td className="border border-black px-2 py-2 font-semibold">{band.level}</td>
                          <td className="border border-black px-2 py-2 text-center">{scoreRange(band.min, band.max)}</td>
                          <td className="border border-black px-2 py-2">
                            {bandIndex === 0 ? `${criterionLabels}에서 구체적이고 분명한 증거가 나타납니다.` : null}
                            {bandIndex === 1 ? `${criterionLabels}이 대체로 드러나지만 한 부분은 조금 보완할 수 있습니다.` : null}
                            {bandIndex === 2 ? `${criterionLabels}의 일부가 나타나지만 설명이나 근거가 부족합니다.` : null}
                            {bandIndex === 3 ? `${criterionLabels}이 답안에서 충분히 드러나지 않습니다.` : null}
                          </td>
                          <td className="border border-black px-2 py-2">
                            {bandIndex === 0 ? "더 깊은 근거나 다른 관점을 덧붙이게 합니다." : null}
                            {bandIndex === 1 ? "약한 평가 요소 한 가지를 골라 문장을 보태게 합니다." : null}
                            {bandIndex === 2 ? "자료 내용과 자신의 이유를 한 문장씩 추가하게 합니다." : null}
                            {bandIndex === 3 ? "평가 요소를 확인하며 교사와 함께 한 문장씩 다시 씁니다." : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="border border-black px-3 py-3 text-sm">이 문항에서 평가할 루브릭 요소를 선택해 주세요.</p>
                )}
              </div>
              );
            })}
          </div>
          <div className="mt-5 flex items-center justify-end gap-4 border-y-2 border-black px-4 py-3 text-base font-bold">
            <span>평가지 총점</span>
            <span className="min-w-28 border-b border-black pb-1 text-center">/ {worksheetTotalPoints}점</span>
          </div>
        </section>
      </main>
      </section>
    </div>
  );
}
