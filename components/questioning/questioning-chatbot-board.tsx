"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileImage,
  KeyRound,
  RefreshCw,
  SlidersHorizontal,
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
  QUESTIONING_AI_SETTINGS_KEY,
  QUESTIONING_CHATBOT_CONFIG_KEY,
  DEFAULT_QUESTION_FOCUS_MEMO,
  REFERENCE_ONLY_QUESTION_MATERIAL_TEXT,
  buildRubric,
  buildStandardAssessmentAnalysis,
  createDefaultQuestioningChatbotBehavior,
  createDefaultQuestioningLessonMaterial,
  isQuestioningAiSettings,
  normalizeQuestioningChatbotBehavior,
  questioningAiModelOptions,
  shouldUseReferenceOnlyQuestionMaterial,
  standardOptions,
  standardSource,
  type QuestioningAiSettings,
  type MaterialAnalysis,
  type QuestionClassifierKeywords,
  type QuestioningChatbotConfig,
  type QuestioningChatbotBehavior,
  type RubricCriterion,
  type StandardAssessmentAnalysis,
} from "@/lib/questioning-board";

const studentChatbotPath = "/questioning-chatbot";

const quickQuestions = [
  "자료에서 확인할 수 있는 중요한 사실은 무엇인가요?",
  "왜 이런 결과가 나타났을까요?",
  "우리 반이나 학교에서는 어떻게 적용할 수 있을까요?",
  "내 질문은 자료 속 근거를 확인하기에 좋은 질문인가요?",
];

const defaultAiModel = questioningAiModelOptions[0]?.value || "gemini-2.5-flash";
const defaultLessonMaterial = createDefaultQuestioningLessonMaterial();
const defaultChatbotBehavior = createDefaultQuestioningChatbotBehavior();

const classifierKeywordFields: {
  key: keyof QuestionClassifierKeywords;
  label: string;
  placeholder: string;
}[] = [
  { key: "inference", label: "추론 질문 판별 표현", placeholder: "왜, 어떻게, 까닭, 원인" },
  { key: "application", label: "적용 질문 판별 표현", placeholder: "우리, 나라면, 실천, 해결" },
  { key: "extension", label: "확장 질문 판별 표현", placeholder: "더 알아, 추가, 관련, 조사" },
  { key: "reflection", label: "성찰 질문 판별 표현", placeholder: "내 질문, 내 생각, 배운 점, 성찰" },
  { key: "off_topic", label: "범위 밖 질문 판별 표현", placeholder: "게임, 연예인, 날씨" },
  { key: "safety", label: "안전 확인 판별 표현", placeholder: "전화번호, 주소, 대필, 전체 정답" },
];

const evaluationRecordColumns = [
  { label: "학교_반_번호", placeholder: "예: 푸른초등학교_4-2_15" },
  { label: "성취기준·자료 연결", placeholder: "0~5" },
  { label: "자료 근거 확인", placeholder: "0~5" },
  { label: "질문 유형 확장", placeholder: "0~5" },
  { label: "질문 다시 쓰기·성찰", placeholder: "0~5" },
  { label: "총점", placeholder: "자동" },
  { label: "점수 근거", placeholder: "점수를 준 근거" },
  { label: "질문모음", placeholder: "학생 질문 기록" },
  { label: "챗봇 답변모음", placeholder: "챗봇 답변 기록" },
  { label: "세특용 피드백", placeholder: "학생 활동 피드백" },
];

const evaluationRecordGuideRows = [
  {
    label: "학교_반_번호",
    guide: "학생이 입력한 학교, 반, 번호를 밑줄로 합쳐 기록합니다. 예: 푸른초등학교_4-2_15",
    use: "실명 없이 학생별 평가 기록을 구분합니다.",
  },
  {
    label: "성취기준·자료 연결",
    guide: "학생 질문과 자료 근거가 성취기준의 핵심 행동과 연결되는지 0~5점으로 입력합니다.",
    use: "성취기준 도달 정도를 확인합니다.",
  },
  {
    label: "자료 근거 확인",
    guide: "챗봇 답을 자료 속 문장, 장면, 표로 다시 확인했는지 0~5점으로 입력합니다.",
    use: "AI 답 수용이 아니라 자료 기반 검증이 일어났는지 확인합니다.",
  },
  {
    label: "질문 유형 확장",
    guide: "사실 질문에서 추론, 적용, 성찰 질문으로 사고가 확장되는지 0~5점으로 입력합니다.",
    use: "질문 수준과 사고 확장 과정을 확인합니다.",
  },
  {
    label: "질문 다시 쓰기·성찰",
    guide: "처음 질문을 다시 쓰고 바꾼 이유를 설명하는지 0~5점으로 입력합니다.",
    use: "성취기준별 도달 정도와 총점을 확인합니다.",
  },
  {
    label: "총점",
    guide: "네 개 평가기준 점수를 합산합니다.",
    use: "학생별 전체 수행 수준을 빠르게 파악합니다.",
  },
  {
    label: "점수 근거",
    guide: "점수를 준 이유가 되는 학생 발화, 근거 확인, 질문 변화 내용을 적습니다.",
    use: "평가 판단의 설명 가능성을 높입니다.",
  },
  {
    label: "질문모음",
    guide: "첫 질문, 이어진 생각, 확장 질문, 다시 쓴 질문을 모아 둡니다.",
    use: "질문 유형과 사고 확장 과정을 확인합니다.",
  },
  {
    label: "챗봇 답변모음",
    guide: "챗봇의 핵심 답변, 격려, 자료 확인 피드백을 모아 둡니다.",
    use: "학생이 받은 지원과 근거 확인 과정을 추적합니다.",
  },
  {
    label: "세특용 피드백",
    guide: "관찰 가능한 활동 내용, 질문의 성장, 다음 과제를 문장으로 정리합니다.",
    use: "세특이나 개별 피드백 초안으로 활용합니다.",
  },
];

function splitLines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createReferenceOnlySummary(title: string, notes: string) {
  const trimmedNotes = notes.trim();
  if (title.includes("급식실 남은 음식") && trimmedNotes.includes("푸른초")) {
    return createDefaultQuestioningLessonMaterial().summary;
  }

  if (!trimmedNotes) {
    return "긴 지문 또는 교과서 자료입니다. 학생은 원문을 직접 살펴보며 질문하고, 챗봇은 교사가 정한 수업 범위 안에서만 대화를 돕습니다.";
  }

  const summaryLines = trimmedNotes
    .replace(/\r/g, "\n")
    .split(/\n+|(?<=[.!?。？！])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 10 && !/기자$/.test(line))
    .slice(0, 5)
    .join(" ");

  const summary = summaryLines || trimmedNotes;
  return summary.length > 700 ? `${summary.slice(0, 697)}...` : summary;
}

function createManualMaterial({
  title,
  notes,
  questionFocusMemo = "",
  referenceOnly = false,
}: {
  title: string;
  notes: string;
  questionFocusMemo?: string;
  referenceOnly?: boolean;
}): MaterialAnalysis {
  const lines = splitLines(notes);
  const materialTitle = title.trim() || "교사 입력 수업 자료";
  const titleConcepts = splitLines(materialTitle);
  const useReferenceOnly = shouldUseReferenceOnlyQuestionMaterial({
    title: materialTitle,
    text: notes,
    forceReferenceOnly: referenceOnly,
  });

  if (useReferenceOnly) {
    const referenceSummary = createReferenceOnlySummary(materialTitle, notes);
    const referenceConcepts = Array.from(
      new Set([...titleConcepts, ...lines.filter((line) => line.length <= 30)]),
    ).slice(0, 5);

    return {
      materialTitle,
      summary: referenceSummary,
      visibleText: REFERENCE_ONLY_QUESTION_MATERIAL_TEXT,
      questionFocusMemo: questionFocusMemo.trim(),
      keyConcepts: referenceConcepts.length ? referenceConcepts : titleConcepts.slice(0, 5),
      possibleMisconceptions: ["원문을 확인하지 않고 챗봇 답만으로 근거를 판단할 수 있음"],
      questionSeeds: quickQuestions,
      sourceLimit: "긴 지문 또는 교과서 원문은 학생이 직접 확인하도록 안내하고, 교사가 지정한 수업 범위 안에서만 답합니다.",
      safetyNotice: "학생 개인정보와 사진 속 식별 정보는 입력하지 않습니다.",
    };
  }

  return {
    materialTitle,
    summary: notes.trim() || "교사가 수업 중 제시한 자료를 바탕으로 질문을 만들고 근거를 확인합니다.",
    visibleText: notes.trim(),
    questionFocusMemo: questionFocusMemo.trim(),
    keyConcepts: lines.slice(0, 5),
    possibleMisconceptions: ["챗봇 답을 그대로 믿고 자료 근거를 확인하지 않을 수 있음"],
    questionSeeds: quickQuestions,
    sourceLimit: "교사가 입력한 질문 자료 전체 내용 안에서만 답합니다.",
    safetyNotice: "학생 개인정보와 사진 속 식별 정보는 입력하지 않습니다.",
  };
}

function buildPrdText({
  targetGrade,
  subjectUnit,
  standard,
  assessmentAnalysis,
  material,
  rubric,
  behavior,
}: {
  targetGrade: string;
  subjectUnit: string;
  standard: string;
  assessmentAnalysis: StandardAssessmentAnalysis;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  behavior: QuestioningChatbotBehavior;
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
  const questionFocusMemo =
    material.questionFocusMemo?.trim() ||
    DEFAULT_QUESTION_FOCUS_MEMO;

  const classifierSummary = classifierKeywordFields
    .map((field) => `- ${field.label}: ${behavior.classifierKeywords[field.key].join(", ") || "사용 안 함"}`)
    .join("\n");

  return `# 질문하기 수업용 학생 챗봇 제작 PRD

## 1. 수업 기본 정보
- 대상: ${targetGrade || "미정"}
- 교과/단원: ${subjectUnit || "미정"}
- 성취기준: ${standard || "미정"}
- 수업 자료: ${material.materialTitle || "미정"}
- 기본 성취기준 자료: ${standardSource.title} (${standardSource.url})

## 2. 이 HTML의 구조
- 교사용 보드: 성취기준, 루브릭, 수업 자료, 평가 산출물 구조를 준비한다.
- 학생용 질문 도우미 챗봇: 교사용 보드에서 저장한 자료 범위를 받아 학생의 질문·대답·생각과 대화한다.
- 질문 자료 표시 원칙: 학생 화면에는 제목, 먼저 볼 내용 2~3개, 빠른 탐색 포인트를 먼저 보여 주고, 전체 원문은 '질문 자료 전체 보기'로 접어 둔다. 단, 교사용 보드에 반영한 전체 텍스트는 요약하거나 생략하지 않고 문단과 줄바꿈을 유지해 펼침 영역에 제공한다.

## 2-1. Gemini와 Notion DB 역할 분리
- Gemini API는 교사 개인 키를 사용하며, 학생 질문에 대한 응답, 질문 유형 내부 분석, 평가 루브릭 판단 근거, 세특용 피드백 초안 생성만 담당한다.
- Notion API도 교사 개인 Integration과 교사 개인 Notion 템플릿 DB를 사용한다.
- Gemini API가 Notion에 직접 접근하거나 기록하지 않는다.
- Notion API 접근과 기록은 웹앱 서버 API가 담당한다.
- 운영형에서는 교사별 Gemini 키, Notion 토큰, 자동 탐색된 준비 DB/결과 DB 연결값, 현재 챗봇 설정을 Supabase 연결정보 테이블에 암호화해 저장하고 수업 코드로 불러온다.
- 교사는 Notion API 토큰만 입력하고, 웹앱 서버는 Integration이 연결된 Notion 템플릿에서 챗봇 수업 준비 DB와 챗봇 수업 결과 DB를 자동으로 찾는다.
- Supabase는 학생 활동 기록 저장소가 아니라 교사별 수업 연결정보를 찾는 작은 금고 역할만 한다.
- Gemini 키, Notion 토큰, 자동 탐색된 DB 연결값의 실제 값은 학생 브라우저, Gemini 프롬프트, PRD 본문, 공개 저장소에 포함하지 않는다.
- 교사용 보드 상단에서 ‘Supabase에 저장하고 수업 코드 만들기’를 누르면 웹앱 서버가 연결정보를 Supabase에 저장하고, 성취기준, 질문 자료, 루브릭, PRD를 교사 개인 챗봇 수업 준비 DB에 기록한다.
- 학생이 챗봇에 질문하면 웹앱 서버가 수업 코드로 교사별 연결정보를 찾고, 교사 개인 Gemini 응답을 받은 뒤 질문, 답변, 내부 평가 분석을 교사 개인 챗봇 수업 결과 DB의 학교_반_번호 페이지에 누적 저장한다.

## 3. 학생 챗봇 역할
학생이 한 질문·대답·생각을 먼저 구체적으로 받아 주고 질문 자료와 연결해 대화한다. 질문 종류나 분석 결과를 학생에게 설명하지 않고, 완성된 다음 질문이나 직접적인 후속 질문을 대신 써 주지 않는다. 응답 뒤에는 학생의 질문 시도를 인정하는 짧은 격려만 더해, 학생이 스스로 다음 궁금증을 이어 가게 한다. 활동지 정답 전체 작성이나 수행평가 대필은 하지 않는다.

### 3-0. 교사 메모 우선 운영 원칙
- 챗봇은 개인정보 보호, 안전, 저작권, 수업 자료 범위 제한을 지킨 다음에는 교사의 질문 성격 메모를 가장 중요한 수업 운영 지침으로 삼는다.
- 학생 질문에 답할 때 먼저 학생 발화를 받아 주되, 답변의 초점·예시 선택·격려 방식은 아래 교사 메모와 맞아야 한다.
- 교사 메모가 특정 질문 방향, 사고 방식, 활동 흐름, 피드백 톤을 제시하면 일반적인 질문 도우미 규칙보다 그 메모를 우선한다.
- 단, 교사 메모 원문을 학생에게 그대로 읽어 주거나 “교사 메모에 따르면”처럼 노출하지 않는다.

### 3-1. 챗봇 질문 성격 메모
- 교사 입력 메모 원문: ${questionFocusMemo}
- 챗봇 반영 방식: 위 메모를 학생에게 그대로 설명하지 않고, 모든 답변의 방향·격려 방식·피드백 톤에 지속적으로 반영한다.

### 3-2. 질문 응답 역할 상세
1. 학생이 ‘채팅 시작’을 누르면 챗봇이 먼저 인사하고 질문 자료에서 눈에 들어온 내용이나 궁금한 점을 묻는다.
2. 학생 발화가 질문이면 질문 자료의 구체적인 사실과 표현을 근거로 답한다.
3. 제목을 보고 내용을 예측하는 질문에는 제목을 그대로 다시 읽어 주지 않고, 학생의 예측을 받아 준 뒤 자료에서 확인할 점을 자연스럽게 안내한다.
4. 학생 발화가 이전 대화에 이어지는 대답이나 생각이면 그 내용을 먼저 구체적으로 받아 주고 앞선 대화와 연결한다.
5. 응답 뒤에는 교사 메모가 의도한 질문 방향에 맞춰 학생의 시도를 인정하는 짧은 격려 문장만 제시한다.
6. 사실·추론·적용·확장·성찰 등의 질문 분류와 루브릭 분석은 교사용 내부 평가 정보로만 저장하고 학생 화면에는 표시하지 않는다.
7. 자료에 직접 없는 내용은 질문 종류를 말하지 않고 수업 주제와 연결되는 범위와 추가 확인이 필요함을 자연스럽게 설명한다.
8. 실시간 검색이나 교사가 제공한 추가 자료가 없으면 출처를 지어내지 않고, 확인할 검색어·출처 유형·점검 질문을 제안한다.
9. 수업 내용과 상관없는 질문에는 “수업 내용과 관련된 질문에 대해서만 응답할 수 있어요.”라고 답하고, 학생이 다시 수업 자료로 돌아오도록 부드럽게 격려한다.
10. 학생 발화가 짧거나 막연해도 틀렸다고 말하지 않고 가능한 의미를 먼저 받아 준 뒤, 스스로 다시 살펴볼 수 있도록 격려한다.
11. 학생 화면에는 직접적인 다음 질문, 질문 만들기 힌트, 질문 분석 제목을 노출하지 않는다.
12. 격려 문장은 학생이 그대로 따라 쓸 질문문이 아니라, 시도와 탐구 태도를 인정하는 자연스러운 문장으로 작성한다.

### 3-3. 학생 화면 격려 문구 예시
- 좋아요. 방금 떠올린 생각을 붙잡고 자료를 천천히 다시 살펴봐요.
- 좋은 출발이에요. 자료를 보며 내 생각을 조금씩 이어 가면 됩니다.
- 괜찮아요. 지금 떠오른 궁금함을 바탕으로 천천히 다시 생각해 봐요.

## 4. 성취기준 분석
- 핵심 성취: ${assessmentAnalysis.coreAchievement}
- 내용 요소: ${assessmentAnalysis.contentTargets.join(", ")}
- 수행 행동: ${assessmentAnalysis.performanceBehaviors.join(" / ")}
- 학생 산출물: ${assessmentAnalysis.studentProducts.join(", ")}

## 5. 질문 유형과 평가 연결
${assessmentAnalysis.questionTypeLinks
  .map((link) => `- ${link.label}: ${link.assessmentRole} / 수집 증거: ${link.evidenceToCollect}`)
  .join("\n")}

## 6. 학생에게 보여 줄 질문 자료 전체 내용
${material.visibleText || (material.summary ? REFERENCE_ONLY_QUESTION_MATERIAL_TEXT : "질문 자료 전체 내용을 입력해야 합니다.")}

## 7. 핵심 개념
${material.keyConcepts.map((concept) => `- ${concept}`).join("\n") || "- 미정"}

## 8. 루브릭
${rubricSummary}

## 9. 학생 기록 필드
- 학교_반_번호
- 성취기준·자료 연결
- 자료 근거 확인
- 질문 유형 확장
- 질문 다시 쓰기·성찰
- 총점
- 점수 근거
- 질문모음
- 챗봇 답변모음
- 세특용 피드백
- 저장 위치: 챗봇 수업 결과 DB의 학생별 학교_반_번호 페이지

## 10. Notion 저장 방식
- 교사용 운영형에서는 교사 개인 Notion API 토큰으로 Integration이 연결된 Notion 템플릿을 검색한다.
- DB 이름이 유지되어 있으면 챗봇 수업 준비 DB와 챗봇 수업 결과 DB를 자동으로 찾아 연결한다.
- 자동 탐색된 DB 연결값은 학생 화면이나 PRD 본문에 노출하지 않고 Supabase 연결정보에만 저장한다.
- 로컬 실습형에서는 Notion 연결 없이 브라우저 localStorage 기반으로 학생용 챗봇을 열 수 있다.

## 11. 질문 씨앗
${questionSeeds}

## 12. 교사 편집 챗봇 동작 설정
${classifierSummary}
- 사실 질문: 다른 유형의 판별 표현이 없을 때 기본 분류
- 범위 밖 질문 응답: ${behavior.offTopicResponse}
- 짧거나 막연한 발화 이어가기: ${behavior.insufficientQuestionResponse}
- 추가 지시: ${behavior.additionalInstructions}

## 13. 응답 제한
${material.sourceLimit || "교사가 제공한 수업 자료 범위 안에서만 답한다."}

## 14. 안전 규칙
${material.safetyNotice || "개인정보, 정답 대필, 원문 전체 복사 요청을 제한한다."}
`;
}

function escapeXml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textCell(value: string | number, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function numberCell(value: number, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}><Data ss:Type="Number">${value}</Data></Cell>`;
}

function formulaCell(formula: string, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style} ss:Formula="${escapeXml(formula)}"><Data ss:Type="Number">0</Data></Cell>`;
}

function sanitizeFilename(value: string) {
  return (value.trim() || "질문하기_평가기록")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 48);
}

function buildEvaluationWorkbookXml({
  targetGrade,
  subjectUnit,
  standard,
  assessmentAnalysis,
  materialTitle,
  rubric,
}: {
  targetGrade: string;
  subjectUnit: string;
  standard: string;
  assessmentAnalysis: StandardAssessmentAnalysis;
  materialTitle: string;
  rubric: RubricCriterion[];
}) {
  const recordHeaders = [
    ...evaluationRecordColumns.map((column) => column.label),
  ];
  const scoreColumnCount = 4;
  const mergedHeaderColumns = recordHeaders.length - 1;
  const blankRows = Array.from({ length: 30 }, (_, index) => {
    const cells = [
      textCell(index === 0 ? "예: 푸른초등학교_4-2_15" : ""),
      ...Array.from({ length: scoreColumnCount }, () => numberCell(0)),
      formulaCell(`=SUM(RC[-${scoreColumnCount}]:RC[-1])`, "Score"),
      ...Array.from({ length: 4 }, () => textCell("")),
    ];
    return `<Row>${cells.join("")}</Row>`;
  }).join("");

  const levelScores = [0, 1, 2, 3, 4, 5];
  const rubricRows = rubric
    .map((criterion) => {
      const levelMap = new Map(criterion.levels.map((level) => [level.score, `${level.label}: ${level.descriptor}`]));
      return `<Row>${[
        textCell(criterion.label),
        textCell(criterion.description),
        textCell(criterion.observableEvidence),
        textCell(criterion.feedbackForward),
        ...levelScores.map((score) => textCell(levelMap.get(score) || "")),
      ].join("")}</Row>`;
    })
    .join("");

  const recordFieldWorkbookRows = evaluationRecordGuideRows
    .map((row) => `<Row>${[textCell(row.label), textCell(row.guide), textCell(row.use)].join("")}</Row>`)
    .join("");

  const behaviorRows = assessmentAnalysis.performanceBehaviors
    .map((behavior) => `<Row>${[textCell("수행 행동"), textCell(behavior)].join("")}</Row>`)
    .join("");
  const elementRows = assessmentAnalysis.evaluationElements
    .map((element) =>
      `<Row>${[
        textCell(element.label),
        textCell(element.focus),
        textCell(element.studentEvidence),
        textCell(element.rubricUse),
      ].join("")}</Row>`,
    )
    .join("");
  const questionTypeRows = assessmentAnalysis.questionTypeLinks
    .map((link) =>
      `<Row>${[textCell(link.label), textCell(link.assessmentRole), textCell(link.evidenceToCollect)].join("")}</Row>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EEF2F7" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/><Alignment ss:Vertical="Center"/></Style>
    <Style ss:ID="Score"><NumberFormat ss:Format="0"/></Style>
  </Styles>
  <Worksheet ss:Name="평가 기록">
    <Table>
      <Column ss:Width="170"/>
      <Column ss:Width="105"/>
      <Column ss:Width="105"/>
      <Column ss:Width="105"/>
      <Column ss:Width="125"/>
      <Column ss:Width="60"/>
      <Column ss:Width="260"/>
      <Column ss:Width="260"/>
      <Column ss:Width="260"/>
      <Column ss:Width="320"/>
      <Row><Cell ss:MergeAcross="${mergedHeaderColumns}" ss:StyleID="Title"><Data ss:Type="String">${escapeXml(subjectUnit || "질문하기 수업")} 평가 기록</Data></Cell></Row>
      <Row>${[textCell("대상", "Header"), textCell(targetGrade || "미정"), textCell("성취기준", "Header"), textCell(standard || "미정"), textCell("수업 자료", "Header"), textCell(materialTitle || "미정")].join("")}</Row>
      <Row>${recordHeaders.map((header) => textCell(header, "Header")).join("")}</Row>
      ${blankRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="성취기준 분석">
    <Table>
      <Column ss:Width="150"/>
      <Column ss:Width="420"/>
      <Column ss:Width="260"/>
      <Column ss:Width="260"/>
      <Row><Cell ss:MergeAcross="3" ss:StyleID="Title"><Data ss:Type="String">성취기준 분석</Data></Cell></Row>
      <Row>${[textCell("기본 자료", "Header"), textCell(`${standardSource.title} (${standardSource.url})`)].join("")}</Row>
      <Row>${[textCell("성취기준", "Header"), textCell(standard || "미정")].join("")}</Row>
      <Row>${[textCell("핵심 성취", "Header"), textCell(assessmentAnalysis.coreAchievement)].join("")}</Row>
      <Row>${[textCell("내용 요소", "Header"), textCell(assessmentAnalysis.contentTargets.join(", "))].join("")}</Row>
      ${behaviorRows}
      <Row>${["평가 요소", "평가 초점", "학생 산출물/관찰 증거", "루브릭 활용"].map((header) => textCell(header, "Header")).join("")}</Row>
      ${elementRows}
      <Row>${["질문 유형", "평가에서의 역할", "수집할 증거"].map((header) => textCell(header, "Header")).join("")}</Row>
      ${questionTypeRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="루브릭">
    <Table>
      <Column ss:Width="140"/>
      <Column ss:Width="240"/>
      <Column ss:Width="260"/>
      <Column ss:Width="260"/>
      ${levelScores.map(() => '<Column ss:Width="240"/>').join("")}
      <Row>${["항목", "설명", "관찰 증거", "피드백 방향", ...levelScores.map((score) => `${score}점`)].map((header) => textCell(header, "Header")).join("")}</Row>
      ${rubricRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="평가 기록 작성 기준">
    <Table>
      <Column ss:Width="150"/>
      <Column ss:Width="320"/>
      <Column ss:Width="280"/>
      <Row>${["열 이름", "작성 내용", "활용"].map((header) => textCell(header, "Header")).join("")}</Row>
      ${recordFieldWorkbookRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function downloadExcelWorkbook(workbookXml: string, filename: string) {
  const blob = new Blob([workbookXml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function QuestioningChatbotBoard() {
  const [selectedStandardId, setSelectedStandardId] = useState(standardOptions[0].id);
  const [customStandard, setCustomStandard] = useState("");
  const [targetGrade, setTargetGrade] = useState(standardOptions[0].gradeBand);
  const [subjectUnit, setSubjectUnit] = useState(`${standardOptions[0].subject} / 질문하기 수업`);
  const [materialTitle, setMaterialTitle] = useState(defaultLessonMaterial.materialTitle);
  const [teacherNotes, setTeacherNotes] = useState(defaultLessonMaterial.visibleText);
  const [questionFocusMemo, setQuestionFocusMemo] = useState(defaultLessonMaterial.questionFocusMemo || "");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [material, setMaterial] = useState<MaterialAnalysis>(defaultLessonMaterial);
  const [isReferenceOnlyMaterial, setIsReferenceOnlyMaterial] = useState(false);
  const [behavior, setBehavior] = useState<QuestioningChatbotBehavior>(defaultChatbotBehavior);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingPreparationToNotion, setIsSavingPreparationToNotion] = useState(false);
  const [isRubricOpen, setIsRubricOpen] = useState(false);
  const [isStandardDetailsOpen, setIsStandardDetailsOpen] = useState(false);
  const [isBehaviorSettingsOpen, setIsBehaviorSettingsOpen] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(defaultAiModel);
  const [isAiKeySaved, setIsAiKeySaved] = useState(false);
  const [connectionTeacherLabel, setConnectionTeacherLabel] = useState("");
  const [connectionLessonCode, setConnectionLessonCode] = useState("");
  const [connectionSetupToken, setConnectionSetupToken] = useState("");
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionPrepDatabaseId, setNotionPrepDatabaseId] = useState("");
  const [notionResultDatabaseId, setNotionResultDatabaseId] = useState("");
  const [savedStudentChatbotUrl, setSavedStudentChatbotUrl] = useState("");
  const [isSavingLessonConnection, setIsSavingLessonConnection] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedStandard = standardOptions.find((option) => option.id === selectedStandardId) || standardOptions[0];
  const standardText = selectedStandardId === "custom" ? customStandard : selectedStandard.standard;
  const assessmentAnalysis = useMemo(() => buildStandardAssessmentAnalysis(standardText), [standardText]);
  const rubric = useMemo(() => buildRubric(standardText), [standardText]);
  const totalScore = rubric.length * 5;
  const configuredMaterial = useMemo(() => {
    const fullText = teacherNotes.trim();
    const nextTitle = materialTitle.trim() || material.materialTitle || "교사 입력 질문 자료";
    const useReferenceOnly = shouldUseReferenceOnlyQuestionMaterial({
      title: nextTitle,
      text: fullText,
      forceReferenceOnly: isReferenceOnlyMaterial,
    });

    if (useReferenceOnly) {
      return createManualMaterial({
        title: nextTitle,
        notes: fullText,
        questionFocusMemo,
        referenceOnly: true,
      });
    }

    if (!fullText || fullText === material.visibleText.trim()) {
      return {
        ...material,
        materialTitle: nextTitle,
        questionFocusMemo: questionFocusMemo.trim(),
      };
    }

    return createManualMaterial({ title: nextTitle, notes: fullText, questionFocusMemo });
  }, [isReferenceOnlyMaterial, material, materialTitle, questionFocusMemo, teacherNotes]);
  const prdText = useMemo(
    () =>
      buildPrdText({
        targetGrade,
        subjectUnit,
        standard: standardText,
        assessmentAnalysis,
        material: configuredMaterial,
        rubric,
        behavior,
      }),
    [assessmentAnalysis, behavior, configuredMaterial, rubric, standardText, subjectUnit, targetGrade],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(QUESTIONING_AI_SETTINGS_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as unknown;
          if (isQuestioningAiSettings(parsed)) {
            setAiApiKey(parsed.apiKey);
            setAiModel(parsed.model || defaultAiModel);
            setIsAiKeySaved(Boolean(parsed.apiKey.trim()));
          }
        } catch {
          window.localStorage.removeItem(QUESTIONING_AI_SETTINGS_KEY);
        }
      }

      const storedConfig = window.localStorage.getItem(QUESTIONING_CHATBOT_CONFIG_KEY);
      if (storedConfig) {
        try {
          const parsedConfig = JSON.parse(storedConfig) as { behavior?: unknown; material?: Partial<MaterialAnalysis> };
          setBehavior(normalizeQuestioningChatbotBehavior(parsedConfig.behavior));
          if (typeof parsedConfig.material?.questionFocusMemo === "string") {
            setQuestionFocusMemo(parsedConfig.material.questionFocusMemo);
          }
        } catch {
          setBehavior(createDefaultQuestioningChatbotBehavior());
        }
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function getAiRequestPayload() {
    const apiKey = aiApiKey.trim();
    return {
      model: aiModel,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  function handleSaveAiSettings() {
    const apiKey = aiApiKey.trim();
    if (!apiKey) {
      window.localStorage.removeItem(QUESTIONING_AI_SETTINGS_KEY);
      setIsAiKeySaved(false);
      setNotice("API 키 없이 서버 기본 설정 또는 로컬 예비 모드로 사용합니다.");
      return;
    }

    const settings: QuestioningAiSettings = {
      provider: "gemini",
      apiKey,
      model: aiModel,
    };
    window.localStorage.setItem(QUESTIONING_AI_SETTINGS_KEY, JSON.stringify(settings));
    setAiApiKey(apiKey);
    setIsAiKeySaved(true);
    setNotice("Gemini API 키를 이 브라우저에 저장했습니다.");
  }

  function handleClearAiSettings() {
    window.localStorage.removeItem(QUESTIONING_AI_SETTINGS_KEY);
    setAiApiKey("");
    setAiModel(defaultAiModel);
    setIsAiKeySaved(false);
    setNotice("Gemini API 키를 이 브라우저에서 삭제했습니다.");
  }

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
        const nextMaterialTitle = file.name.replace(/\.[^.]+$/, "");
        setMaterialTitle(nextMaterialTitle);
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
          ...getAiRequestPayload(),
        }),
      });
      const payload = (await response.json()) as Partial<MaterialAnalysis> & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "이미지 분석에 실패했습니다.");
      }

      const nextMaterialTitle = payload.materialTitle || materialTitle;
      const extractedVisibleText = payload.visibleText || teacherNotes;
      const shouldReferenceOnly = shouldUseReferenceOnlyQuestionMaterial({
        title: nextMaterialTitle,
        text: extractedVisibleText,
        forceReferenceOnly: isReferenceOnlyMaterial,
      });
      const analyzedMaterial: MaterialAnalysis = {
        materialTitle: nextMaterialTitle,
        summary: shouldReferenceOnly
          ? payload.summary ||
            "긴 지문 또는 교과서 자료입니다. 학생은 원문을 직접 살펴보며 질문하고 근거를 확인합니다."
          : payload.summary || teacherNotes,
        visibleText: shouldReferenceOnly ? REFERENCE_ONLY_QUESTION_MATERIAL_TEXT : extractedVisibleText,
        questionFocusMemo: questionFocusMemo.trim(),
        keyConcepts: payload.keyConcepts || [],
        possibleMisconceptions: payload.possibleMisconceptions || [],
        questionSeeds: payload.questionSeeds || quickQuestions,
        sourceLimit: shouldReferenceOnly
          ? "긴 지문 또는 교과서 원문은 학생이 직접 확인하도록 안내하고, 교사가 지정한 수업 범위 안에서만 답합니다."
          : payload.sourceLimit || "분석된 수업 자료 범위 안에서만 답합니다.",
        safetyNotice: payload.safetyNotice || "학생 개인정보는 입력하지 않습니다.",
      };
      setMaterial(analyzedMaterial);
      setMaterialTitle(analyzedMaterial.materialTitle);
      setIsReferenceOnlyMaterial(shouldReferenceOnly);
      setTeacherNotes(extractedVisibleText);
      setNotice(
        shouldReferenceOnly
          ? "긴 지문 또는 교과서 자료로 판단해 학생 화면에는 교과서 확인 안내만 반영했습니다."
          : "이미지에서 추출한 질문 자료 전체 내용을 학생용 챗봇에 반영할 준비를 마쳤습니다.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지 분석에 실패했습니다.";
      setNotice(`${message} 질문 자료 전체 내용을 직접 입력해도 보드를 사용할 수 있습니다.`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleUseManualMaterial() {
    const appliedQuestionFocusMemo = questionFocusMemo.trim();
    const nextMaterial = createManualMaterial({
      title: materialTitle,
      notes: teacherNotes,
      questionFocusMemo: appliedQuestionFocusMemo,
      referenceOnly: isReferenceOnlyMaterial,
    });
    setMaterial(nextMaterial);
    setQuestionFocusMemo(appliedQuestionFocusMemo);
    setIsReferenceOnlyMaterial(nextMaterial.visibleText === REFERENCE_ONLY_QUESTION_MATERIAL_TEXT);
    setNotice(
      nextMaterial.visibleText === REFERENCE_ONLY_QUESTION_MATERIAL_TEXT
        ? "긴 지문 또는 교과서 자료는 학생 화면에 교과서 확인 안내만 반영했고, 질문 성격 메모도 PRD에 함께 반영했습니다."
        : "교사가 입력한 질문 자료 전체 내용과 질문 성격 메모를 학생용 챗봇 PRD에 함께 반영했습니다.",
    );
  }

  function handleClassifierKeywordsChange(key: keyof QuestionClassifierKeywords, value: string) {
    setBehavior((current) => ({
      ...current,
      classifierKeywords: {
        ...current.classifierKeywords,
        [key]: splitLines(value),
      },
    }));
  }

  function handleBehaviorTextChange(
    key: "offTopicResponse" | "insufficientQuestionResponse" | "additionalInstructions",
    value: string,
  ) {
    setBehavior((current) => ({ ...current, [key]: value }));
  }

  function buildCurrentChatbotConfig() {
    if (!configuredMaterial.visibleText.trim() && !configuredMaterial.summary.trim()) {
      setNotice("학생용 챗봇을 열기 전에 질문 자료 전체 내용을 입력해 주세요.");
      return null;
    }

    const normalizedBehavior = normalizeQuestioningChatbotBehavior(behavior);
    const normalizedPrdText = buildPrdText({
      targetGrade,
      subjectUnit,
      standard: standardText,
      assessmentAnalysis,
      material: configuredMaterial,
      rubric,
      behavior: normalizedBehavior,
    });
    const config: QuestioningChatbotConfig = {
      targetGrade,
      subjectUnit,
      standard: standardText,
      assessmentAnalysis,
      material: configuredMaterial,
      rubric,
      behavior: normalizedBehavior,
      prdText: normalizedPrdText,
      updatedAt: new Date().toISOString(),
    };

    return config;
  }

  function saveStudentChatbotConfig(successNotice = "현재 설정을 학생용 질문 도우미 챗봇에 연결했습니다.") {
    const config = buildCurrentChatbotConfig();
    if (!config) {
      return false;
    }

    window.localStorage.setItem(QUESTIONING_CHATBOT_CONFIG_KEY, JSON.stringify(config));
    setMaterial(configuredMaterial);
    setBehavior(config.behavior);
    setNotice(successNotice);
    return true;
  }

  function handleOpenStudentChatbot() {
    if (savedStudentChatbotUrl) {
      window.open(savedStudentChatbotUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (saveStudentChatbotConfig("현재 설정을 학생용 챗봇에 적용하고 열었습니다.")) {
      window.open(studentChatbotPath, "_blank", "noopener,noreferrer");
    }
  }

  async function handleSavePreparationToNotion() {
    const config = buildCurrentChatbotConfig();
    if (!config) {
      return;
    }

    if (!notionApiKey.trim()) {
      setNotice("Notion API 토큰을 입력하고, Notion 템플릿 페이지에 Integration을 연결해 주세요.");
      return;
    }

    setIsSavingPreparationToNotion(true);
    setNotice("");

    try {
      const response = await fetch("/api/questioning-board/notion/preparation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          studentChatbotUrl: studentChatbotPath,
          notionApiKey,
          notionPrepDatabaseId,
          notionResultDatabaseId,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        skipped?: boolean;
        pageUrl?: string;
        warning?: string;
        error?: string;
        notionPrepDatabaseId?: string;
        notionResultDatabaseId?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || payload.warning || "Notion 준비 DB 저장에 실패했습니다.");
      }

      setMaterial(config.material);
      setBehavior(config.behavior);
      setNotionPrepDatabaseId(payload.notionPrepDatabaseId || notionPrepDatabaseId);
      setNotionResultDatabaseId(payload.notionResultDatabaseId || notionResultDatabaseId);
      setNotice(
        payload.pageUrl
          ? `챗봇 수업 준비 DB에 저장했습니다. ${payload.pageUrl}`
          : "챗봇 수업 준비 DB에 저장했습니다.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Notion 준비 DB 저장에 실패했습니다.";
      setNotice(message);
    } finally {
      setIsSavingPreparationToNotion(false);
    }
  }

  async function handleSaveLessonConnection() {
    const config = buildCurrentChatbotConfig();
    if (!config) {
      return;
    }

    if (!aiApiKey.trim()) {
      setNotice("교사 개인 Gemini API 키를 먼저 입력해 주세요.");
      return;
    }

    if (!notionApiKey.trim()) {
      setNotice("Notion API 토큰을 입력하고, Notion 템플릿 페이지에 Integration을 연결해 주세요.");
      return;
    }

    setIsSavingLessonConnection(true);
    setNotice("");

    try {
      const response = await fetch("/api/questioning-board/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          lessonCode: connectionLessonCode,
          teacherLabel: connectionTeacherLabel,
          setupToken: connectionSetupToken,
          geminiApiKey: aiApiKey,
          geminiModel: aiModel,
          notionApiKey,
          notionPrepDatabaseId,
          notionResultDatabaseId,
          studentChatbotPath,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        lessonCode?: string;
        studentChatbotUrl?: string;
        notionPreparationPageUrl?: string;
        notionPreparationWarning?: string;
        notionPrepDatabaseId?: string;
        notionResultDatabaseId?: string;
      };

      if (!response.ok || !payload.ok || !payload.lessonCode || !payload.studentChatbotUrl) {
        throw new Error(payload.error || "수업 연결 저장에 실패했습니다.");
      }

      const absoluteStudentUrl = `${window.location.origin}${payload.studentChatbotUrl}`;
      setConnectionLessonCode(payload.lessonCode);
      setSavedStudentChatbotUrl(absoluteStudentUrl);
      setNotionPrepDatabaseId(payload.notionPrepDatabaseId || notionPrepDatabaseId);
      setNotionResultDatabaseId(payload.notionResultDatabaseId || notionResultDatabaseId);
      setMaterial(config.material);
      setBehavior(config.behavior);
      setNotice(
        payload.notionPreparationWarning
          ? `수업 코드 ${payload.lessonCode}를 저장했습니다. 다만 Notion 준비 DB 기록은 확인이 필요합니다: ${payload.notionPreparationWarning}`
          : payload.notionPreparationPageUrl
            ? `수업 코드 ${payload.lessonCode}를 저장했고 Notion 준비 DB에도 기록했습니다.`
            : `수업 코드 ${payload.lessonCode}를 저장했습니다.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "수업 연결 저장에 실패했습니다.";
      setNotice(message);
    } finally {
      setIsSavingLessonConnection(false);
    }
  }


  async function handleCopyStudentUrl() {
    if (!savedStudentChatbotUrl) {
      setNotice("먼저 수업 연결을 저장해 학생용 링크를 만들어 주세요.");
      return;
    }

    try {
      await navigator.clipboard.writeText(savedStudentChatbotUrl);
      setNotice("학생용 챗봇 링크를 복사했습니다.");
    } catch {
      setNotice(savedStudentChatbotUrl);
    }
  }

  function handleDownloadEvaluationWorkbook() {
    const workbookXml = buildEvaluationWorkbookXml({
      targetGrade,
      subjectUnit,
      standard: standardText,
      assessmentAnalysis,
      materialTitle: configuredMaterial.materialTitle || materialTitle,
      rubric,
    });
    const filename = `${sanitizeFilename(subjectUnit || materialTitle)}_교사용_평가기록.xls`;
    downloadExcelWorkbook(workbookXml, filename);
    setNotice("5번 교사용 평가 기록 엑셀 파일을 내려받았습니다.");
  }

  return (
    <div className="min-h-screen overflow-x-auto bg-background text-foreground [word-break:keep-all]">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 xl:min-w-[1680px]">
          <div className="rounded-md border border-border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              <p className="font-semibold">API·Notion 연결</p>
              <p className="text-muted-foreground">Gemini 키와 Notion 토큰만 입력합니다.</p>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_160px_minmax(280px,1.2fr)]">
              <div className="space-y-2">
                <Label htmlFor="ai-api-key">Gemini API 키</Label>
                <Input
                  id="ai-api-key"
                  type="password"
                  value={aiApiKey}
                  onChange={(event) => {
                    setAiApiKey(event.target.value);
                    setIsAiKeySaved(false);
                  }}
                  placeholder="Gemini API 키 입력"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-model">Gemini 모델</Label>
                <Select id="ai-model" value={aiModel} onChange={(event) => setAiModel(event.target.value)}>
                  {questioningAiModelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:col-span-1 lg:self-end xl:col-span-1">
                <Button type="button" variant="outline" className="whitespace-nowrap" onClick={handleSaveAiSettings}>
                  저장
                </Button>
                <Button type="button" variant="outline" className="whitespace-nowrap" onClick={handleClearAiSettings}>
                  지우기
                </Button>
              </div>
              <div className="space-y-2 lg:col-span-2 xl:col-span-1">
                <Label htmlFor="notion-api-key">Notion API 토큰</Label>
                <Input
                  id="notion-api-key"
                  type="password"
                  value={notionApiKey}
                  onChange={(event) => setNotionApiKey(event.target.value)}
                  placeholder="ntn_... 또는 secret_..."
                  autoComplete="off"
                />
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Notion 템플릿 페이지에 Integration을 연결하면 준비 DB와 결과 DB는 자동으로 찾습니다. 키와 토큰은 코드나 문서에 포함하지 않습니다.{" "}
              <span className="font-medium text-foreground">
                {isAiKeySaved ? "Gemini 키 브라우저 저장됨" : "Gemini 키는 저장 전입니다."}
              </span>
            </p>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Cloud className="size-4 text-primary" aria-hidden="true" />
                <p className="font-semibold">수업 연결 저장</p>
                <p className="text-muted-foreground">
                  Supabase에 수업 코드를 만들고, 가능하면 Notion 준비 DB에도 기록합니다.
                </p>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_minmax(240px,auto)]">
                <div className="space-y-2">
                  <Label htmlFor="connection-teacher-label">교사/수업 표시명</Label>
                  <Input
                    id="connection-teacher-label"
                    value={connectionTeacherLabel}
                    onChange={(event) => setConnectionTeacherLabel(event.target.value)}
                    placeholder="예: 4학년 질문 수업"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connection-lesson-code">수업 코드</Label>
                  <Input
                    id="connection-lesson-code"
                    value={connectionLessonCode}
                    onChange={(event) => setConnectionLessonCode(event.target.value)}
                    placeholder="비워 두면 자동 생성"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connection-setup-token">연결 저장 암호</Label>
                  <Input
                    id="connection-setup-token"
                    type="password"
                    value={connectionSetupToken}
                    onChange={(event) => setConnectionSetupToken(event.target.value)}
                    placeholder="설정한 경우만"
                    autoComplete="off"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleSaveLessonConnection}
                    disabled={isSavingLessonConnection}
                  >
                    {isSavingLessonConnection ? (
                      <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Database className="size-4" aria-hidden="true" />
                    )}
                    수업 연결 저장
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCopyStudentUrl}>
                    <Copy className="size-4" aria-hidden="true" />
                    링크 복사
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                학생용 링크:{" "}
                <span className="font-medium text-foreground">
                  {savedStudentChatbotUrl || "수업 연결 저장 후 생성됩니다."}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">
                질문 챗봇 제작보드(교사용)
              </h1>
            </div>
            <Button type="button" className="w-full sm:w-auto" onClick={handleOpenStudentChatbot}>
              <ExternalLink className="size-4" aria-hidden="true" />
              학생용 챗봇 열기
            </Button>
          </div>
          {notice ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{notice}</p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1800px] items-start gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:px-8 xl:min-w-[1680px] xl:grid-cols-[300px_340px_560px_420px] 2xl:grid-cols-[320px_380px_minmax(0,1fr)_460px]">
        <>
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
                      {option.gradeBand} · {option.subject} · {option.title}
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
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                aria-expanded={isStandardDetailsOpen}
                onClick={() => setIsStandardDetailsOpen((current) => !current)}
              >
                성취기준 상세 분석 {isStandardDetailsOpen ? "접기" : "펼쳐보기"}
                {isStandardDetailsOpen ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </Button>
              {isStandardDetailsOpen ? (
                <div className="space-y-4">
                  {selectedStandardId === "custom" ? null : (
                    <div className="rounded-md border border-border bg-background p-3 text-sm leading-6">
                      <p className="font-medium">{selectedStandard.gradeBand}</p>
                      <p className="mt-1 text-muted-foreground">{selectedStandard.standard}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{selectedStandard.classroomGoal}</p>
                    </div>
                  )}
                  <div className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                      <h3 className="text-sm font-semibold">성취기준 분석</h3>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      핵심 성취: {assessmentAnalysis.coreAchievement}
                    </p>
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">내용 요소</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assessmentAnalysis.contentTargets.map((target) => (
                            <span key={target} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {target}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">수행 행동</p>
                        <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                          {assessmentAnalysis.performanceBehaviors.slice(0, 4).map((behavior) => (
                            <li key={behavior}>- {behavior}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">평가 요소</p>
                        <div className="mt-2 grid gap-2">
                          {assessmentAnalysis.evaluationElements.map((element) => (
                            <div key={element.key} className="rounded-md border border-border bg-card p-2">
                              <p className="text-xs font-semibold">{element.label}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{element.focus}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
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
                      성취기준 기반 루브릭으로 학생 산출물에서 보이는 증거와 다음 피드백을 함께 확인합니다.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
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
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <FileImage className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">3. 질문 자료 입력</h2>
              </div>
            </div>
            <div className="grid gap-3 p-4">
              <div className="space-y-3">
                <Label htmlFor="material-title">자료 이름</Label>
                <Input
                  id="material-title"
                  value={materialTitle}
                  onChange={(event) => setMaterialTitle(event.target.value)}
                  placeholder="예: 신문기사 사진, 교과서 지문"
                />
                <label className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isReferenceOnlyMaterial}
                    onChange={(event) => setIsReferenceOnlyMaterial(event.target.checked)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span>
                    <b className="font-medium text-foreground">긴 지문·교과서는 종이 자료로 보기</b>
                    <span className="ml-2 text-xs">체크하면 학생 화면에는 원문 대신 확인 안내만 표시</span>
                  </span>
                </label>
                <div className="space-y-2">
                  <Label htmlFor="teacher-notes">질문 자료 전체 내용</Label>
                  <Textarea
                    id="teacher-notes"
                    value={teacherNotes}
                    onChange={(event) => setTeacherNotes(event.target.value)}
                    className="min-h-72"
                    placeholder="짧은 기사나 교사 제작 자료는 원문 전체를 입력하세요."
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    원문은 교사용 보드에 남기고, 체크하면 학생 화면에는 종이 자료 확인 안내만 보여 줍니다.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="question-focus-memo">챗봇 질문 성격 메모</Label>
                  <Textarea
                    id="question-focus-memo"
                    value={questionFocusMemo}
                    onChange={(event) => setQuestionFocusMemo(event.target.value)}
                    className="min-h-24"
                    placeholder="예: 학생 질문에 먼저 답하고, 자료 속 원인-결과와 우리 학교에서 실천할 방법으로 질문을 넓히게 돕습니다."
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    챗봇이 학생 질문에 응답할 때 우선 살릴 관점, 질문 방향, 피드백 톤을 적어 둡니다.
                  </p>
                </div>
                <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
                  <Upload className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex flex-col leading-5">
                    <span className="font-medium text-foreground">이미지 업로드</span>
                    <span>JPG, PNG</span>
                  </span>
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
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleAnalyzeImage} disabled={isAnalyzing || !imageDataUrl}>
                  {isAnalyzing ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : <Wand2 className="size-4" aria-hidden="true" />}
                  AI 전체 텍스트 추출
                </Button>
                <Button type="button" variant="outline" onClick={handleUseManualMaterial}>
                  전체 내용·메모 반영
                </Button>
              </div>
            </div>
          </div>

        </>

        <>
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">4. 챗봇 제작 PRD</h2>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between text-left"
                aria-expanded={isBehaviorSettingsOpen}
                onClick={() => setIsBehaviorSettingsOpen((current) => !current)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">챗봇 동작 설정 {isBehaviorSettingsOpen ? "접기" : "펼쳐보기"}</span>
                </span>
                {isBehaviorSettingsOpen ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </Button>
              {isBehaviorSettingsOpen ? (
                <div className="space-y-4 border-b border-border pb-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">로컬 질문 분류 기준</h3>
                    {classifierKeywordFields.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`classifier-${field.key}`}>{field.label}</Label>
                        <Textarea
                          id={`classifier-${field.key}`}
                          value={behavior.classifierKeywords[field.key].join(", ")}
                          onChange={(event) => handleClassifierKeywordsChange(field.key, event.target.value)}
                          placeholder={field.placeholder}
                          className="min-h-16"
                        />
                      </div>
                    ))}
                    <p className="text-xs leading-5 text-muted-foreground">
                      위 판별 표현에 해당하지 않으면 사실 질문으로 분류합니다.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">학생 응답 문구</h3>
                    <div className="space-y-2">
                      <Label htmlFor="off-topic-response">범위 밖 질문 응답</Label>
                      <Textarea
                        id="off-topic-response"
                        value={behavior.offTopicResponse}
                        onChange={(event) => handleBehaviorTextChange("offTopicResponse", event.target.value)}
                        className="min-h-24"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="insufficient-question-response">짧거나 막연한 발화 이어가기</Label>
                      <Textarea
                        id="insufficient-question-response"
                        value={behavior.insufficientQuestionResponse}
                        onChange={(event) =>
                          handleBehaviorTextChange("insufficientQuestionResponse", event.target.value)
                        }
                        className="min-h-24"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="additional-chatbot-instructions">추가 챗봇 지시</Label>
                      <Textarea
                        id="additional-chatbot-instructions"
                        value={behavior.additionalInstructions}
                        onChange={(event) => handleBehaviorTextChange("additionalInstructions", event.target.value)}
                        className="min-h-28"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              <Textarea value={prdText} readOnly className="min-h-[520px] font-mono text-xs leading-5" />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleSavePreparationToNotion}
                disabled={isSavingPreparationToNotion}
              >
                {isSavingPreparationToNotion ? (
                  <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Database className="size-4" aria-hidden="true" />
                )}
                노션에 적용하기
              </Button>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card sm:col-span-2 xl:col-span-4">
            <div className="border-b border-border p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <ClipboardList className="size-5 text-primary" aria-hidden="true" />
                  <h2 className="text-base font-semibold">5. 교사용 평가 기록</h2>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={handleDownloadEvaluationWorkbook}>
                  <Download className="size-4" aria-hidden="true" />
                  엑셀 다운로드
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1360px] text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                  <tr>
                    {evaluationRecordColumns.map((column) => (
                      <th key={column.label} className="px-4 py-3 font-semibold">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 4 }, (_, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border align-top">
                      {evaluationRecordColumns.map((column) => (
                        <td key={column.label} className="px-4 py-3 text-muted-foreground">
                          {rowIndex === 0 ? column.placeholder : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      </main>
    </div>
  );
}
