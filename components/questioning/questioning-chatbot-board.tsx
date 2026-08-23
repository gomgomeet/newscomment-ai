"use client";

import { ChangeEvent, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FileImage,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTIONING_CHATBOT_CONFIG_KEY,
  buildRubric,
  emptyMaterialAnalysis,
  standardOptions,
  type MaterialAnalysis,
  type QuestioningChatbotConfig,
  type RubricCriterion,
} from "@/lib/questioning-board";

const studentChatbotPath = "/questioning-chatbot";

const quickQuestions = [
  "자료에서 확인할 수 있는 중요한 사실은 무엇인가요?",
  "왜 이런 결과가 나타났을까요?",
  "우리 반이나 학교에서는 어떻게 적용할 수 있을까요?",
  "내 질문은 자료 속 근거를 확인하기에 좋은 질문인가요?",
];

const evidenceRows = [
  {
    label: "학생 첫 질문",
    use: "질문 유형과 성취기준 연결을 확인",
    rubric: "성취기준·자료 연결, 질문 유형 확장",
  },
  {
    label: "자료 근거 표시",
    use: "챗봇 답을 자료로 다시 확인했는지 판단",
    rubric: "자료 근거 확인",
  },
  {
    label: "고친 질문",
    use: "질문이 더 명확하고 깊어졌는지 비교",
    rubric: "질문 유형 확장, 질문 개선·성찰",
  },
  {
    label: "성찰 문장",
    use: "왜 질문이 좋아졌는지 학생의 판단을 확인",
    rubric: "질문 개선·성찰",
  },
  {
    label: "챗봇 피드백",
    use: "교사가 최종 피드백을 쓸 때 참고",
    rubric: "전 항목 보조 자료",
  },
];

function splitLines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createManualMaterial({
  title,
  notes,
}: {
  title: string;
  notes: string;
}): MaterialAnalysis {
  const lines = splitLines(notes);
  return {
    materialTitle: title.trim() || "교사 입력 수업 자료",
    summary: notes.trim() || "교사가 수업 중 제시한 자료를 바탕으로 질문을 만들고 근거를 확인합니다.",
    visibleText: notes.trim(),
    keyConcepts: lines.slice(0, 5),
    possibleMisconceptions: ["챗봇 답을 그대로 믿고 자료 근거를 확인하지 않을 수 있음"],
    questionSeeds: quickQuestions,
    sourceLimit: "교사가 입력한 자료 요약과 보완 메모 안에서만 답합니다.",
    safetyNotice: "학생 개인정보와 사진 속 식별 정보는 입력하지 않습니다.",
  };
}

function buildPrdText({
  targetGrade,
  subjectUnit,
  standard,
  material,
  rubric,
}: {
  targetGrade: string;
  subjectUnit: string;
  standard: string;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
}) {
  const rubricSummary = rubric
    .map(
      (criterion) =>
        `- ${criterion.label}: ${criterion.description}\n  관찰 증거: ${criterion.observableEvidence}\n  피드백 방향: ${criterion.feedbackForward}`,
    )
    .join("\n");

  const questionSeeds = (material.questionSeeds.length ? material.questionSeeds : quickQuestions)
    .slice(0, 4)
    .map((seed) => `- ${seed}`)
    .join("\n");

  return `# 질문하기 수업용 학생 챗봇 제작 PRD

## 1. 수업 기본 정보
- 대상: ${targetGrade || "미정"}
- 교과/단원: ${subjectUnit || "미정"}
- 성취기준: ${standard || "미정"}
- 수업 자료: ${material.materialTitle || "미정"}

## 2. 이 HTML의 구조
- 교사용 보드: 성취기준, 루브릭, 수업 자료, 평가 산출물 구조를 준비한다.
- 학생용 질문 도우미 챗봇: 교사용 보드에서 저장한 자료 범위와 루브릭을 받아 학생 질문을 돕는다.

## 3. 학생 챗봇 역할
학생 대신 정답을 작성하지 않는다. 학생 질문을 사실 질문, 추론 질문, 적용 질문, 성찰 질문으로 분류하고 자료 속 근거 확인과 질문 수정을 돕는다.

## 4. 지식베이스
${material.summary || "수업 자료 요약을 입력해야 합니다."}

## 5. 핵심 개념
${material.keyConcepts.map((concept) => `- ${concept}`).join("\n") || "- 미정"}

## 6. 루브릭
${rubricSummary}

## 7. 학생 기록 필드
- 첫 질문
- 질문 유형
- 챗봇 답 요약
- 자료 속 근거
- 고친 질문
- 성찰 문장
- 교사용 피드백 초안

## 8. 질문 씨앗
${questionSeeds}

## 9. 응답 제한
${material.sourceLimit || "교사가 제공한 수업 자료 범위 안에서만 답한다."}

## 10. 안전 규칙
${material.safetyNotice || "개인정보, 정답 대필, 원문 전체 복사 요청을 제한한다."}
`;
}

export function QuestioningChatbotBoard() {
  const [selectedStandardId, setSelectedStandardId] = useState(standardOptions[0].id);
  const [customStandard, setCustomStandard] = useState("");
  const [targetGrade, setTargetGrade] = useState(standardOptions[0].gradeBand);
  const [subjectUnit, setSubjectUnit] = useState(`${standardOptions[0].subject} / 질문하기 수업`);
  const [materialTitle, setMaterialTitle] = useState("수업 자료");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [material, setMaterial] = useState<MaterialAnalysis>(emptyMaterialAnalysis());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRubricOpen, setIsRubricOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedStandard = standardOptions.find((option) => option.id === selectedStandardId) || standardOptions[0];
  const standardText = selectedStandardId === "custom" ? customStandard : selectedStandard.standard;
  const rubric = useMemo(() => buildRubric(standardText), [standardText]);
  const totalScore = rubric.length * 5;
  const prdText = useMemo(
    () => buildPrdText({ targetGrade, subjectUnit, standard: standardText, material, rubric }),
    [material, rubric, standardText, subjectUnit, targetGrade],
  );

  function handleStandardChange(value: string) {
    setSelectedStandardId(value);
    if (value !== "custom") {
      const nextStandard = standardOptions.find((option) => option.id === value);
      if (nextStandard) {
        setTargetGrade(nextStandard.gradeBand);
        setSubjectUnit(`${nextStandard.subject} / ${nextStandard.title}`);
      }
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setNotice("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setImageDataUrl(result);
      setImageName(file.name);
      setNotice("");
      if (!materialTitle || materialTitle === "수업 자료") {
        setMaterialTitle(file.name.replace(/\.[^.]+$/, ""));
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalyzeImage() {
    if (!imageDataUrl) {
      setNotice("먼저 수업 자료 이미지를 업로드해 주세요.");
      return;
    }

    setIsAnalyzing(true);
    setNotice("");

    try {
      const response = await fetch("/api/questioning-board/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          standard: standardText,
          targetGrade,
          subjectUnit,
          teacherNotes,
        }),
      });
      const payload = (await response.json()) as Partial<MaterialAnalysis> & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "이미지 분석에 실패했습니다.");
      }

      setMaterial({
        materialTitle: payload.materialTitle || materialTitle,
        summary: payload.summary || teacherNotes,
        visibleText: payload.visibleText || "",
        keyConcepts: payload.keyConcepts || [],
        possibleMisconceptions: payload.possibleMisconceptions || [],
        questionSeeds: payload.questionSeeds || quickQuestions,
        sourceLimit: payload.sourceLimit || "분석된 수업 자료 범위 안에서만 답합니다.",
        safetyNotice: payload.safetyNotice || "학생 개인정보는 입력하지 않습니다.",
      });
      setNotice("이미지 분석을 바탕으로 학생용 챗봇 지식베이스를 준비했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지 분석에 실패했습니다.";
      setNotice(`${message} 직접 입력한 자료 요약으로도 보드를 사용할 수 있습니다.`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleUseManualMaterial() {
    setMaterial(createManualMaterial({ title: materialTitle, notes: teacherNotes }));
    setNotice("교사 입력 자료 요약을 학생용 챗봇 지식베이스로 반영했습니다.");
  }

  function saveStudentChatbotConfig() {
    if (!material.summary.trim()) {
      setNotice("학생용 챗봇을 열기 전에 이미지 분석 또는 직접 자료 요약 반영을 먼저 해 주세요.");
      return false;
    }

    const config: QuestioningChatbotConfig = {
      targetGrade,
      subjectUnit,
      standard: standardText,
      material,
      rubric,
      prdText,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(QUESTIONING_CHATBOT_CONFIG_KEY, JSON.stringify(config));
    setNotice("현재 설정을 학생용 질문 도우미 챗봇에 연결했습니다.");
    return true;
  }

  function handleOpenStudentChatbot() {
    if (saveStudentChatbotConfig()) {
      window.open(studentChatbotPath, "_blank", "noopener,noreferrer");
    }
  }

  async function handleCopyPrd() {
    await navigator.clipboard.writeText(prdText);
    setNotice("현재 보드 설정을 챗봇 제작 PRD로 복사했습니다.");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground">
                <Bot className="size-4 text-primary" aria-hidden="true" />
                교사용 질문 챗봇 제작 보드
              </div>
              <h1 className="mt-4 text-2xl font-semibold leading-tight sm:text-3xl">
                수업 자료와 평가 루브릭을 준비해 학생용 질문 도우미 챗봇으로 연결합니다
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                성취기준, 수업 자료, 평가 산출물, 챗봇 제작 PRD를 한 화면에서 정리합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleCopyPrd}>
                <Copy className="size-4" aria-hidden="true" />
                PRD 복사
              </Button>
              <Button type="button" onClick={handleOpenStudentChatbot}>
                <ExternalLink className="size-4" aria-hidden="true" />
                학생용 챗봇 열기
              </Button>
            </div>
          </div>
          {notice ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{notice}</p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[340px_minmax(0,1fr)_380px] lg:px-8">
        <section className="space-y-4">
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">1. 성취기준 선택</h2>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="target-grade">대상</Label>
                <Input
                  id="target-grade"
                  value={targetGrade}
                  onChange={(event) => setTargetGrade(event.target.value)}
                  placeholder="예: 초등 5학년"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject-unit">교과 / 단원</Label>
                <Input
                  id="subject-unit"
                  value={subjectUnit}
                  onChange={(event) => setSubjectUnit(event.target.value)}
                  placeholder="예: 국어 / 자료 읽고 질문하기"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="standard-select">성취기준</Label>
                <Select
                  id="standard-select"
                  value={selectedStandardId}
                  onChange={(event) => handleStandardChange(event.target.value)}
                >
                  {standardOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.subject} · {option.title}
                    </option>
                  ))}
                  <option value="custom">직접 입력</option>
                </Select>
              </div>
              {selectedStandardId === "custom" ? (
                <div className="space-y-2">
                  <Label htmlFor="custom-standard">직접 입력한 성취기준</Label>
                  <Textarea
                    id="custom-standard"
                    value={customStandard}
                    onChange={(event) => setCustomStandard(event.target.value)}
                    placeholder="성취기준 또는 수업 목표를 입력하세요."
                  />
                </div>
              ) : (
                <div className="rounded-md border border-border bg-background p-3 text-sm leading-6">
                  <p className="font-medium">{selectedStandard.gradeBand}</p>
                  <p className="mt-1 text-muted-foreground">{selectedStandard.standard}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{selectedStandard.classroomGoal}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">2. 평가 루브릭</h2>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">총 {totalScore}점 · 4개 평가 항목</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      NIE 루브릭처럼 학생 산출물에서 보이는 증거와 다음 피드백을 함께 확인합니다.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsRubricOpen((current) => !current)}
                  >
                    {isRubricOpen ? "접기" : "전체 보기"}
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {rubric.map((criterion) => (
                    <span key={criterion.key} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {criterion.label}
                    </span>
                  ))}
                </div>
              </div>

              {isRubricOpen ? (
                <div className="space-y-3">
                  {rubric.map((criterion) => (
                    <div key={criterion.key} className="rounded-md border border-border bg-background p-3">
                      <h3 className="text-sm font-semibold">{criterion.label}</h3>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{criterion.description}</p>
                      <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
                        <p>
                          <b className="text-foreground">관찰 증거</b> · {criterion.observableEvidence}
                        </p>
                        <p>
                          <b className="text-foreground">피드백 방향</b> · {criterion.feedbackForward}
                        </p>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {criterion.levels.map((level) => (
                          <div key={level.score} className="grid grid-cols-[34px_minmax(0,1fr)] gap-2 text-xs">
                            <span className="rounded-md bg-muted px-2 py-1 text-center font-semibold">{level.score}</span>
                            <span className="leading-5 text-muted-foreground">
                              <b className="text-foreground">{level.label}</b> · {level.descriptor}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <FileImage className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">3. 수업 자료 입력</h2>
              </div>
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-[260px_minmax(0,1fr)]">
              <div className="space-y-3">
                <Label htmlFor="material-title">자료 이름</Label>
                <Input
                  id="material-title"
                  value={materialTitle}
                  onChange={(event) => setMaterialTitle(event.target.value)}
                  placeholder="예: 신문기사 사진, 교과서 지문"
                />
                <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-background p-4 text-center text-sm text-muted-foreground hover:bg-muted">
                  <Upload className="mb-3 size-6 text-primary" aria-hidden="true" />
                  <span className="font-medium text-foreground">이미지 업로드</span>
                  <span className="mt-1 text-xs">JPG, PNG 등 수업 자료 이미지</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
                </label>
                {imageDataUrl ? (
                  <div className="overflow-hidden rounded-md border border-border bg-background">
                    <Image
                      src={imageDataUrl}
                      alt={imageName || "업로드한 수업 자료"}
                      width={520}
                      height={360}
                      unoptimized
                      className="max-h-56 w-full object-contain"
                    />
                    <p className="truncate border-t border-border px-3 py-2 text-xs text-muted-foreground">{imageName}</p>
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="teacher-notes">자료 요약 / 교사 보완 메모</Label>
                  <Textarea
                    id="teacher-notes"
                    value={teacherNotes}
                    onChange={(event) => setTeacherNotes(event.target.value)}
                    className="min-h-40"
                    placeholder="이미지 분석 전후로 교사가 꼭 넣고 싶은 자료 요약, 핵심 개념, 학생이 헷갈릴 부분을 적어 주세요."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleAnalyzeImage} disabled={isAnalyzing || !imageDataUrl}>
                    {isAnalyzing ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : <Wand2 className="size-4" aria-hidden="true" />}
                    AI 이미지 분석
                  </Button>
                  <Button type="button" variant="outline" onClick={handleUseManualMaterial}>
                    직접 요약 반영
                  </Button>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                    학생 챗봇 지식베이스
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {material.summary || "이미지를 분석하거나 직접 자료 요약을 반영하면 학생용 챗봇이 사용할 자료 범위가 정리됩니다."}
                  </p>
                  {material.keyConcepts.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {material.keyConcepts.map((concept) => (
                        <span key={concept} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {concept}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {material.questionSeeds.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-muted-foreground">질문 씨앗</p>
                      <ul className="mt-2 space-y-1 text-sm leading-6">
                        {material.questionSeeds.slice(0, 4).map((seed) => (
                          <li key={seed}>- {seed}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">4. 평가 자료화 설계</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">학생 산출물</th>
                    <th className="px-4 py-3 font-semibold">교사용 활용</th>
                    <th className="px-4 py-3 font-semibold">연결 루브릭</th>
                  </tr>
                </thead>
                <tbody>
                  {evidenceRows.map((row) => (
                    <tr key={row.label} className="border-b border-border align-top">
                      <td className="px-4 py-3 font-medium">{row.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.use}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.rubric}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">5. 챗봇 제작 PRD</h2>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-md border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
                이 칸의 내용이 학생용 질문 도우미 챗봇에 반영될 제작 명세입니다.
              </div>
              <Textarea value={prdText} readOnly className="min-h-[520px] font-mono text-xs leading-5" />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button type="button" variant="outline" onClick={handleCopyPrd}>
                  <Copy className="size-4" aria-hidden="true" />
                  PRD 복사
                </Button>
                <Button type="button" onClick={handleOpenStudentChatbot}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  학생용 챗봇 열기
                </Button>
              </div>
              <div className="rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
                학생용 챗봇 경로: <span className="font-medium text-foreground">{studentChatbotPath}</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
