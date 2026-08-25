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
import { buildThinkingCard, type ThinkingCard } from "@/lib/questioning-thinking-card";
import {
  formatAttendanceSummary,
  parseParticipatedNumbers,
  summarizeAttendance,
} from "@/lib/questioning-attendance";
import {
  QUESTIONING_AI_SETTINGS_KEY,
  QUESTIONING_CHATBOT_CONFIG_KEY,
  QUESTIONING_CHATBOT_CREATION_PROFILE_VERSION,
  DEFAULT_QUESTION_FOCUS_MEMO,
  REFERENCE_ONLY_QUESTION_MATERIAL_TEXT,
  buildCurriculumCompass,
  buildRubric,
  buildStandardAssessmentAnalysis,
  createDefaultQuestioningChatbotBehavior,
  createDefaultQuestioningLessonMaterial,
  isQuestioningAiSettings,
  normalizeQuestioningChatbotBehavior,
  normalizeQuestioningClassInfo,
  questioningAiModelOptions,
  shouldUseReferenceOnlyQuestionMaterial,
  standardOptions,
  standardSource,
  type QuestioningAiSettings,
  type MaterialAnalysis,
  type MaterialVocabularyEntry,
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

/** 본문 첫 줄을 자료 이름 후보로 다듬는다. 너무 길면 이름이 아니라 문장이다. */
function firstLineTitle(text: string): string {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "";
  return firstLine.length <= 60 ? firstLine : "";
}

const defaultChatbotBehavior = createDefaultQuestioningChatbotBehavior();

const classifierKeywordFields: {
  key: keyof QuestionClassifierKeywords;
  label: string;
  placeholder: string;
}[] = [
  { key: "vocabulary", label: "어휘·문맥 질문 판별 표현", placeholder: "뜻, 무슨 말, 의미, 낱말, 용어" },
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

/**
 * 교사에게 한 번 물어야 하는 카드. 서버가 만든 카드 중 **메모 해석과 웹 리서치**만
 * 여기 담긴다. 낱말·사실·추론·예상 질문은 지문에서 기계적으로 나오므로 묻지 않는다.
 */
type CardConfirmationItem = {
  id: string;
  cardType: string;
  title: string;
  content: string;
  dialoguePrompt: string | null;
  dialogueTrigger: string | null;
  dialogueGoal: string | null;
  externalSourceUrl: string | null;
  externalSourceTitle: string | null;
  externalSourceOrganization: string | null;
  sourceReliability: string | null;
  defaultEnabled: boolean;
};

type CardBuildResult = {
  documentId: string;
  total: number;
  usable: number;
  weakCardCount: number;
  warning: string;
  needsConfirmation: CardConfirmationItem[];
};

/** 카드로 답하지 못해 교사에게 돌아온 학생 질문. */
type UnansweredQuestion = {
  question: string;
  askedCount: number;
  questionIntent: string;
  lastAskedAt: string;
};

const CARD_CHOICE_MEMORY_KEY = "questioning-card-choices-v1";
// 노션 토큰도 Gemini 키처럼 이 브라우저에만 저장한다. 서버·노션·코드에는 남기지 않는다.
const NOTION_TOKEN_STORAGE_KEY = "questioning-notion-token-v1";
// 매번 다시 적기 귀찮은 학급 정보도 브라우저에 기억해 둔다.
const CLASS_INFO_STORAGE_KEY = "questioning-class-info-v1";
// 수업 코드와 학생용 주소도 기억한다. 새로고침 뒤 ⑧이 "갱신할 연결이 없다"고
// 착각해 학생이 옛 자료를 계속 보는 일을 막는다.
const CONNECTION_STORAGE_KEY = "questioning-connection-v1";

/**
 * 같은 카드를 두 번 묻지 않기 위한 열쇠. id는 저장할 때마다 새로 생기므로 쓸 수 없고,
 * 종류와 제목으로 짝짓는다.
 */
function cardChoiceKey(item: CardConfirmationItem) {
  return `${item.cardType}|${item.title}`;
}

function readCardChoiceMemory(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(CARD_CHOICE_MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeCardChoiceMemory(memory: Record<string, boolean>) {
  try {
    window.localStorage.setItem(CARD_CHOICE_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // 저장에 실패해도 이번 확인은 그대로 진행한다.
  }
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
      vocabulary: [],
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
    vocabulary: [],
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

## 2-1. 대화 모델과 Notion DB 역할 분리
- 학생 대화는 기본적으로 자료 범위를 지키는 로컬 정책으로 처리한다. 외부 생성형 AI는 학교·기관이 대상 연령, 약관, 개인정보 처리를 승인하고 서버 설정에서 명시적으로 활성화한 경우에만 사용한다.
- 교사 개인 Gemini 키는 교사용 자료 분석과 승인된 미리보기에서 사용할 수 있으며 학생 브라우저로 전달하지 않는다.
- Notion API도 교사 개인 Integration과 교사 개인 Notion 템플릿 DB를 사용한다.
- Gemini API가 Notion에 직접 접근하거나 기록하지 않는다.
- Notion API 접근과 기록은 웹앱 서버 API가 담당한다.
- 운영형에서는 교사별 Gemini 키, Notion 토큰, 자동 탐색된 준비 DB/결과 DB 연결값, 현재 챗봇 설정을 Supabase 연결정보 테이블에 암호화해 저장하고 수업 코드로 불러온다.
- 교사는 Notion API 토큰만 입력하고, 웹앱 서버는 Integration이 연결된 Notion 템플릿에서 챗봇 수업 준비 DB와 챗봇 수업 결과 DB를 자동으로 찾는다.
- Supabase는 학생 활동 기록 저장소가 아니라 교사별 수업 연결정보를 찾는 작은 금고 역할만 한다.
- Gemini 키, Notion 토큰, 자동 탐색된 DB 연결값의 실제 값은 학생 브라우저, Gemini 프롬프트, PRD 본문, 공개 저장소에 포함하지 않는다.
- 교사용 보드 상단에서 ‘Supabase에 저장하고 수업 코드 만들기’를 누르면 웹앱 서버가 연결정보를 Supabase에 저장하고, 성취기준, 질문 자료, 루브릭, PRD를 교사 개인 챗봇 수업 준비 DB에 기록한다.
- 학생이 챗봇에 질문하면 웹앱 서버가 수업 코드로 수업 설정을 찾고, 승인된 대화 경로로 응답한 뒤 질문, 학생이 본 답변, 내부 평가 분석을 교사 개인 챗봇 수업 결과 DB의 학교_반_번호 페이지에 누적 저장한다.

## 3. 학생 챗봇 역할
학생이 실제로 꺼낸 질문·대답·생각·감정·경험을 먼저 구체적으로 이어 받고 질문 자료와 연결해 대화한다. 성취기준은 매 턴 도달시킬 목표가 아니라 대화 전체를 비추는 보이지 않는 나침반으로 사용한다. 한 턴에는 중심 교수 동작 하나만 사용하고, 질문은 학생의 생각을 실제로 열 때만 최대 하나 제시한다. 학생이 충분히 말했거나 끝내고 싶어 하면 질문 없이 자연스럽게 마친다. 활동지 정답 전체 작성이나 수행평가 대필은 하지 않는다.

### 3-0. 성취기준 나침반과 교사 메모
- 성취기준과 교사 메모는 대화 전체의 방향을 살피는 내부 참고 정보이며 학생의 현재 관심보다 앞세우지 않는다.
- 학생 질문에 답할 때 먼저 학생 발화를 받아 주고, 답변의 초점·예시 선택은 학생 관심과 자료 범위 안에서 조정한다.
- 학생의 예상 밖 질문이 자료의 감정·윤리·생활 적용과 의미 있게 연결되면 생산적 확장으로 허용한다.
- 단, 교사 메모 원문을 학생에게 그대로 읽어 주거나 “교사 메모에 따르면”처럼 노출하지 않는다.

### 3-1. 챗봇 질문 성격 메모
- 교사 입력 메모 원문: ${questionFocusMemo}
- 챗봇 반영 방식: 위 메모를 학생에게 그대로 설명하지 않고, 모든 답변의 방향·격려 방식·피드백 톤에 지속적으로 반영한다.

### 3-2. 질문 응답 역할 상세
1. 학생이 ‘채팅 시작’을 누르면 챗봇이 먼저 인사하고 질문 자료에서 눈에 들어온 내용이나 궁금한 점을 묻는다.
2. 학생 발화가 질문이면 질문 자료의 구체적인 사실과 표현을 근거로 답한다.
3. 낱말·단어·용어·표현의 뜻을 묻는 질문은 먼저 짧은 사전적 기본 뜻을 설명하고, 그 낱말이 쓰인 문장과 앞뒤 단서를 근거로 이 글에서 선택된 문맥적 뜻을 구분해 알려 준다. 다의어의 모든 뜻을 늘어놓거나 문장만 되풀이하지 않는다.
4. 제목을 보고 내용을 예측하는 질문에는 제목을 그대로 다시 읽어 주지 않고, 학생의 예측을 받아 준 뒤 자료에서 확인할 점을 자연스럽게 안내한다.
5. 학생 발화가 이전 대화에 이어지는 대답이나 생각이면 그 내용을 먼저 구체적으로 받아 주고 앞선 대화와 연결한다.
6. 답변과 격려, 필요한 질문을 별도 블록으로 붙이지 않고 자연스러운 한 말차례로 작성한다.
7. 어휘·사실·추론·적용·확장·성찰 등의 질문 분류와 루브릭 분석은 교사용 내부 평가 정보로만 저장하고 학생 화면에는 표시하지 않는다.
8. 자료에 직접 없는 내용은 질문 종류를 말하지 않고 수업 주제와 연결되는 범위와 추가 확인이 필요함을 자연스럽게 설명한다.
9. 실시간 검색이나 교사가 제공한 추가 자료가 없으면 출처를 지어내지 않고, 확인할 검색어·출처 유형·점검 질문을 제안한다.
10. 수업 내용과 상관없는 질문에는 “수업 내용과 관련된 질문에 대해서만 응답할 수 있어요.”라고 답하고, 학생이 다시 수업 자료로 돌아오도록 부드럽게 격려한다.
11. 학생 발화가 짧거나 막연하면 가능한 의미를 먼저 받아 주고, 첫 막힘에는 자료 단서 하나와 최대 두 선택지만 제공한다.
12. 최근 챗봇 두 턴이 질문으로 끝났다면 다음 턴에는 질문하지 않는다.
13. 학생이 대화 방식에 부담을 표현하면 변명하지 않고 관계를 회복하며, 종료 의사를 보이면 새 과제를 주지 않는다.
14. ‘모르겠어요’가 반복되면 질문을 더 붙이지 않고 설명·선택지·예시 중 하나를 먼저 제공한다.
15. 두 결과가 함께 변했다는 사실과 하나가 다른 하나의 원인이라는 주장을 구분하며, 비교 조건이 다르면 원인을 확정하지 않는다.
16. 학생이 다른 조건을 발견하거나 자기 생각을 고쳤으면 다시 시험하듯 묻지 않고 무엇을 새로 보았는지 인정한다.
17. 학생이 한쪽 입장·감정·개인 경험을 분명히 말했으면 양쪽 의견을 자동으로 되풀이하지 않고 학생이 중요하게 본 기준을 이어 받는다.
18. 개인정보 입력과 정답·문단 대필을 구분한다. 개인정보에는 삭제·비식별화를, 대필에는 자기 생각에서 시작할 작은 단계를 안내한다.
19. 대필을 거절한 뒤 학생이 자기 생각을 제시하면 이전 거절을 반복하지 않고 그 생각을 글의 출발점으로 받아 준다.
20. ‘알겠음 그만’, ‘ㅇㅋ 이제 끝’, ‘여기까지만 할게요’ 같은 구어체 종료도 실제 종료 의미로 판단해 질문 없이 마친다.
21. ‘끝’, ‘됐’, ‘모르’ 같은 글자 일부만 보고 종료나 막힘으로 판정하지 않고 발화 전체와 최근 대화를 함께 본다.

### 3-3. 자연스러운 말차례 예시
- 학생: 여기서 ‘공회전’이 무슨 뜻이에요? / 챗봇: ‘공회전’의 사전적 뜻은 차가 움직이지 않는 상태에서 엔진만 돌아가는 일이에요. 이 글에서는 등굣길에 자동차가 서 있는 동안 시동을 켜 둔 상황을 뜻해요.
- 학생: 그러니까 차는 안 가는데 시동은 켜 둔 거죠? / 챗봇: 네, 이 글에서는 그렇게 이해하면 돼요. 사전의 넓은 뜻 가운데 앞뒤 문장에 맞는 뜻을 골라 읽은 거예요.
- 학생: 잘 모르겠어요. / 챗봇: 괜찮아요. 바로 답을 정하지 않아도 돼요. 자료에 나온 방법과 결과 중 어느 쪽이 더 눈에 들어와요?
- 학생: 그래도 모르겠어요. / 챗봇: 질문을 더 보태지 않을게요. 이번에는 자료에서 바뀐 숫자와 그대로인 조건 하나만 같이 볼게요.
- 학생: 두 숫자가 같이 줄었으니까 이 방법이 원인이 확실해요. / 챗봇: 두 변화가 함께 나타난 것은 자료에서 확인돼요. 다만 비교한 날의 조건도 달라서 한 가지 원인으로 확정할 수는 없어요.
- 학생: 아, 조명의 방향도 달랐네요. 제 생각을 고쳐야겠어요. / 챗봇: 조명 방향이라는 다른 조건을 새로 발견했군요. 처음 생각을 버린 것이 아니라 근거를 더 보고 단정을 줄인 거예요.
- 학생: 저는 벌이 무서워서 꽃을 심는 게 싫어요. / 챗봇: 벌이 무섭다는 네 기준도 중요한 조건이에요. 꽃의 좋은 점을 말할 때 그 걱정을 없는 것처럼 다루지는 않을게요.
- 학생: 왜 자꾸 확인하라고 해요? / 챗봇: 맞아요. 제가 계속 확인하라고 해서 부담스러웠겠어요. 이번에는 질문하지 않을게요.
- 학생: 소개문 전체를 대신 써 주세요. / 챗봇: 완성된 문단을 대신 쓰지는 않을게요. 네가 소개하고 싶은 내용 한 가지를 먼저 말하면 시작할 작은 단계를 도울 수 있어요.
- 학생: 저는 할머니와 축구한 일을 쓰고 싶어요. / 챗봇: 그 생각이 이미 글의 시작점이에요. 먼저 그 일을 네가 아는 말로 짧게 적고, 막히는 표현만 골라 도움받으면 돼요.
- 학생: 알겠음 그만. / 챗봇: 알겠어요. 오늘 떠올린 생각만으로도 충분해요. 더 이야기하고 싶은 때 다시 이어가면 돼요.

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

## 13. 30회기 기반 생성 프로파일
- 프로파일 버전: ${QUESTIONING_CHATBOT_CREATION_PROFILE_VERSION}
- 학생 상태 축: 참여도, 자신감, 읽기·근거 사용, 정서, 현재 필요한 도움
- 학생 상태는 고정 성격이나 점수가 아니라 현재 턴의 지원 수준을 고르는 임시 판단으로만 사용한다.
- 판단 우선순위: 위험·개인정보 → 대필 → 종료 → 관계 회복 → 명시적 질문 → 어휘·문맥 질문 → 반복 막힘 → 첫 막힘 → 자기 수정 → 인과 과장 → 감정·입장 → 자료 연결 → 허용 확장 → 범위 밖
- 최근 학생 발화 3개와 최근 챗봇 응답 2개를 함께 보고, 같은 응답과 같은 시작 문구를 반복하지 않는다.
- 이 프로파일은 개발 세트 30회기 120턴과 새 자료·새 표현의 홀드아웃 10회기 40턴에서 검증한 공통 정책을 기본값으로 사용한다.
- 필수 검사: 빈 응답 없음, 물음표 최대 1개, 종료 시 응답 기대 없음, 관계 회복·반복 막힘에서 새 질문 없음, 내부 용어 비노출, 320자·5문장 이하, 어휘 질문에서 사전적 뜻·문장 단서·문맥적 뜻 구분, 인과 과장 방지, 자기 수정 존중, 대필 후 자기 생각 복귀.
- 합성 평가 통과는 실제 학생의 자연스러움이나 학습 효과를 증명하지 않으므로 교사 블라인드 검토를 거친다.

## 14. 응답 제한
${material.sourceLimit || "교사가 제공한 수업 자료 범위 안에서만 답한다."}

## 15. 안전 규칙
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
  // 처음 열면 빈칸으로 시작한다. 예시 자료를 미리 채워 두면 교사가 자기 자료를
  // 적기 전에 ⑧을 눌렀을 때 예시가 학생에게 그대로 나간다 — 실제로 벌어졌던 일이다.
  // 같은 브라우저라면 아래 복원 로직이 마지막으로 적용한 자료를 되살린다.
  const [materialTitle, setMaterialTitle] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [questionFocusMemo, setQuestionFocusMemo] = useState("");
  // ⑧에서 만든 카드 중 교사에게 물을 것이 있으면 여기 담기고 확인 창이 열린다.
  const [cardConfirmation, setCardConfirmation] = useState<CardBuildResult | null>(null);
  const [cardSelections, setCardSelections] = useState<Record<string, boolean>>({});
  const [cardPrompts, setCardPrompts] = useState<Record<string, string>>({});
  const [isBuildingCards, setIsBuildingCards] = useState(false);
  // 카드로 답하지 못한 질문. 교사가 답을 적으면 그것이 다시 카드가 된다.
  const [unansweredQuestions, setUnansweredQuestions] = useState<UnansweredQuestion[]>([]);
  const [unansweredDocumentId, setUnansweredDocumentId] = useState("");
  const [teacherAnswers, setTeacherAnswers] = useState<Record<string, string>>({});
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  // 어휘표 직접 입력 화면은 걷어냈다. 낱말은 이미지 분석과 AI 리서치가 채운다.
  const [teacherVocabulary] = useState<MaterialVocabularyEntry[]>([]);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [material, setMaterial] = useState<MaterialAnalysis>(() => ({
    ...defaultLessonMaterial,
    materialTitle: "",
    summary: "",
    visibleText: "",
    keyConcepts: [],
    vocabulary: [],
    possibleMisconceptions: [],
    questionSeeds: [],
  }));
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
  const [isNotionTokenSaved, setIsNotionTokenSaved] = useState(false);
  const [notionPrepDatabaseId, setNotionPrepDatabaseId] = useState("");
  const [notionResultDatabaseId, setNotionResultDatabaseId] = useState("");
  const [savedStudentChatbotUrl, setSavedStudentChatbotUrl] = useState("");
  const [isSavingLessonConnection, setIsSavingLessonConnection] = useState(false);
  const [notice, setNotice] = useState("");
  // 학생 화면에서 대신 채워 줄 학급 정보. 아이가 학교 이름을 타이핑하다 오타를 내면
  // 결과 DB에 다른 학생으로 쌓이고 참여 현황에서 미제출로 뜬다.
  const [schoolName, setSchoolName] = useState("");
  const [classroomName, setClassroomName] = useState("");
  const [classSize, setClassSize] = useState("");
  const [participationInput, setParticipationInput] = useState("");
  const [isPrdOpen, setIsPrdOpen] = useState(false);

  const selectedStandard = standardOptions.find((option) => option.id === selectedStandardId) || standardOptions[0];
  const standardText = selectedStandardId === "custom" ? customStandard : selectedStandard.standard;
  const assessmentAnalysis = useMemo(() => buildStandardAssessmentAnalysis(standardText), [standardText]);
  const rubric = useMemo(() => buildRubric(standardText), [standardText]);
  const totalScore = rubric.length * 5;
  const configuredMaterial = useMemo(() => {
    const fullText = teacherNotes.trim();
    // 자료 이름이 비어 있으면 본문 첫 줄(대개 기사 제목)을 이름으로 쓴다.
    const derivedTitle = firstLineTitle(fullText);
    const nextTitle = materialTitle.trim() || derivedTitle || material.materialTitle || "교사 입력 질문 자료";
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
  const configuredMaterialWithVocabulary = useMemo<MaterialAnalysis>(() => {
    const curated = teacherVocabulary
      .map((entry) => ({
        term: entry.term.trim(),
        dictionaryMeaning: entry.dictionaryMeaning.trim(),
        contextualMeaning: entry.contextualMeaning.trim(),
        contextSentence: entry.contextSentence?.trim() || "",
      }))
      .filter((entry) => entry.term && entry.dictionaryMeaning);
    if (curated.length === 0) return configuredMaterial;
    const analyzed = (configuredMaterial.vocabulary || []).filter(
      (entry) => !curated.some((item) => item.term.replace(/\s+/g, "") === entry.term.replace(/\s+/g, "")),
    );
    return { ...configuredMaterial, vocabulary: [...curated, ...analyzed] };
  }, [configuredMaterial, teacherVocabulary]);
  // 반 이름과 인원은 ③에서 받아 쓴다. 같은 것을 두 번 적게 하지 않는다.
  const attendanceClassLabel = [schoolName.trim(), classroomName.trim()].filter(Boolean).join(" ");
  const attendanceSummary = useMemo(
    () => summarizeAttendance(Number.parseInt(classSize, 10), parseParticipatedNumbers(participationInput)),
    [classSize, participationInput],
  );
  const prdText = useMemo(
    () =>
      buildPrdText({
        targetGrade,
        subjectUnit,
        standard: standardText,
        assessmentAnalysis,
        material: configuredMaterialWithVocabulary,
        rubric,
        behavior,
      }),
    [assessmentAnalysis, behavior, configuredMaterialWithVocabulary, rubric, standardText, subjectUnit, targetGrade],
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

      const storedNotionToken = window.localStorage.getItem(NOTION_TOKEN_STORAGE_KEY);
      if (storedNotionToken) {
        setNotionApiKey(storedNotionToken);
        setIsNotionTokenSaved(true);
      }

      const storedConnection = window.localStorage.getItem(CONNECTION_STORAGE_KEY);
      let restoredLessonCode = "";
      if (storedConnection) {
        try {
          const parsed = JSON.parse(storedConnection) as { lessonCode?: string; studentUrl?: string };
          if (typeof parsed.lessonCode === "string" && parsed.lessonCode) {
            restoredLessonCode = parsed.lessonCode;
            setConnectionLessonCode(parsed.lessonCode);
          }
          if (typeof parsed.studentUrl === "string" && parsed.studentUrl) {
            setSavedStudentChatbotUrl(parsed.studentUrl);
          }
        } catch {
          window.localStorage.removeItem(CONNECTION_STORAGE_KEY);
        }
      }
      // 보드가 코드를 기억하기 전(예전 판)에 ④를 눌렀던 경우, 같은 브라우저에서
      // 학생 화면을 열어 봤다면 학생 쪽 저장소에 수업 코드가 남아 있다. 그걸 되찾아
      // 와야 ⑧이 그 연결을 새 자료로 갱신할 수 있다.
      if (!restoredLessonCode) {
        const studentStoredCode = window.localStorage.getItem("questioning-lesson-code");
        if (studentStoredCode && studentStoredCode.trim()) {
          setConnectionLessonCode(studentStoredCode.trim());
        }
      }

      const storedClassInfo = window.localStorage.getItem(CLASS_INFO_STORAGE_KEY);
      if (storedClassInfo) {
        try {
          const parsed = JSON.parse(storedClassInfo) as { school?: string; classroom?: string; classSize?: string };
          if (typeof parsed.school === "string") setSchoolName(parsed.school);
          if (typeof parsed.classroom === "string") setClassroomName(parsed.classroom);
          if (typeof parsed.classSize === "string") setClassSize(parsed.classSize);
        } catch {
          window.localStorage.removeItem(CLASS_INFO_STORAGE_KEY);
        }
      }

      const storedConfig = window.localStorage.getItem(QUESTIONING_CHATBOT_CONFIG_KEY);
      if (storedConfig) {
        try {
          const parsedConfig = JSON.parse(storedConfig) as { behavior?: unknown; material?: Partial<MaterialAnalysis> };
          setBehavior(normalizeQuestioningChatbotBehavior(parsedConfig.behavior));
          // 마지막으로 적용한 자료를 통째로 되살린다. 제목·본문·메모가 함께 돌아와야
          // 교사가 이어서 고칠 수 있다.
          const storedMaterial = parsedConfig.material;
          if (storedMaterial && typeof storedMaterial.materialTitle === "string") {
            if (storedMaterial.materialTitle.trim()) setMaterialTitle(storedMaterial.materialTitle);
            if (typeof storedMaterial.visibleText === "string" && storedMaterial.visibleText.trim()) {
              setTeacherNotes(storedMaterial.visibleText);
            }
            setMaterial((current) => ({ ...current, ...storedMaterial } as MaterialAnalysis));
          }
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

  function handleSaveNotionToken() {
    const token = notionApiKey.trim();
    if (!token) {
      window.localStorage.removeItem(NOTION_TOKEN_STORAGE_KEY);
      setIsNotionTokenSaved(false);
      setNotice("Notion API 토큰이 비어 있어 저장하지 않았습니다.");
      return;
    }
    window.localStorage.setItem(NOTION_TOKEN_STORAGE_KEY, token);
    setNotionApiKey(token);
    setIsNotionTokenSaved(true);
    setNotice("Notion API 토큰을 이 브라우저에 저장했습니다.");
  }

  function handleClearNotionToken() {
    window.localStorage.removeItem(NOTION_TOKEN_STORAGE_KEY);
    setNotionApiKey("");
    setIsNotionTokenSaved(false);
    setNotice("Notion API 토큰을 이 브라우저에서 삭제했습니다.");
  }

  /** 학급 정보를 브라우저에 기억해 둔다. 다음에 보드를 열면 그대로 채워진다. */
  function rememberClassInfo(school: string, classroom: string, size: string) {
    try {
      window.localStorage.setItem(
        CLASS_INFO_STORAGE_KEY,
        JSON.stringify({ school, classroom, classSize: size }),
      );
    } catch {
      // 저장 실패는 무시한다. 다음에 다시 적으면 된다.
    }
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
        vocabulary: payload.vocabulary || [],
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


  /**
   * 생각 카드를 만들어 챗봇 지시에 반영하고, 만든 카드를 돌려준다.
   * 교사가 따로 누르지 않아도 ⑧에서 자동으로 실행된다.
   */
  function buildAndApplyThinkingCard() {
    const card = buildThinkingCard(configuredMaterialWithVocabulary);
    const { applied, behavior: nextBehavior } = applyThinkingCardToBehavior(card);
    return { card, applied, nextBehavior };
  }

  /**
   * 생각 카드에서 답 가능한 질문만 챗봇 추가 지시로 넘기고, 반영한 개수를 돌려준다.
   * 지문 밖 질문은 교사가 확인해야 하므로 넘기지 않는다.
   */
  function applyThinkingCardToBehavior(card: ThinkingCard) {
    const answerable = card.simulatedQuestions.filter((item) => item.answerableFromText);
    if (answerable.length === 0) return { applied: 0, behavior };
    const lines = [
      "[예상 질문과 지문 근거]",
      ...answerable.map((item) => `- ${item.question} → 근거: "${item.evidenceSentence}"`),
    ];
    if (card.misconceptionWatch.length > 0) {
      lines.push("[오개념 주의]");
      card.misconceptionWatch.forEach((item) => lines.push(`- ${item}`));
    }
    const addition = lines.join("\n");
    const existing = behavior.additionalInstructions.trim();
    // 이미 반영한 블록이 있으면 갈아끼워 중복 누적을 막는다.
    const nextInstructions = existing.includes("[예상 질문과 지문 근거]")
      ? addition
      : existing
        ? `${existing}\n\n${addition}`
        : addition;
    const nextBehavior: QuestioningChatbotBehavior = {
      ...behavior,
      additionalInstructions: nextInstructions,
    };
    setBehavior(nextBehavior);
    return { applied: answerable.length, behavior: nextBehavior };
  }

  // 수업 코드가 있으면 묻지 않아도 자동으로 불러와 패널에 보여 준다.
  useEffect(() => {
    const lessonCode = connectionLessonCode.trim();
    if (!lessonCode) return;

    let cancelled = false;
    fetch(`/api/questioning-board/cards?lessonCode=${encodeURIComponent(lessonCode)}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { questions?: UnansweredQuestion[]; documentId?: string };
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        setUnansweredQuestions(payload.questions ?? []);
        setUnansweredDocumentId(payload.documentId ?? "");
      })
      .catch(() => {
        // 자동 조회 실패는 조용히 넘어간다. [새로 고침]으로 다시 시도할 수 있다.
      });
    return () => {
      cancelled = true;
    };
  }, [connectionLessonCode]);

  /** 수업 코드로 아이들이 물었는데 카드에 없던 질문을 불러온다. */
  async function handleLoadUnansweredQuestions() {
    if (!connectionLessonCode.trim()) {
      setNotice("먼저 수업 코드를 입력하거나 ④에서 수업 연결을 저장해 주세요.");
      return;
    }

    setIsLoadingQuestions(true);
    try {
      const response = await fetch(
        `/api/questioning-board/cards?lessonCode=${encodeURIComponent(connectionLessonCode.trim())}`,
      );
      const payload = (await response.json()) as {
        questions?: UnansweredQuestion[];
        documentId?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "학생 질문을 불러오지 못했습니다.");

      setUnansweredQuestions(payload.questions ?? []);
      setUnansweredDocumentId(payload.documentId ?? "");
      setNotice(
        payload.questions?.length
          ? `카드로 답하지 못한 질문 ${payload.questions.length}가지를 찾았습니다.`
          : "카드로 답하지 못한 질문이 없습니다.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "학생 질문을 불러오지 못했습니다.");
    } finally {
      setIsLoadingQuestions(false);
    }
  }

  /** 교사가 적은 답을 카드로 만든다. 그다음 질문부터 챗봇이 이 답을 쓴다. */
  async function handleSaveTeacherAnswers() {
    const answers = Object.entries(teacherAnswers)
      .map(([question, answer]) => ({ question, answer: answer.trim() }))
      .filter((entry) => entry.answer.length > 0);

    if (answers.length === 0) {
      setNotice("답을 적은 질문이 없습니다.");
      return;
    }
    if (!unansweredDocumentId) {
      setNotice("먼저 ⑧을 눌러 이 수업의 생각 카드를 만들어 주세요.");
      return;
    }

    setIsLoadingQuestions(true);
    try {
      const response = await fetch("/api/questioning-board/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: unansweredDocumentId,
          setupToken: connectionSetupToken,
          teacherAnswers: answers,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "답변을 저장하지 못했습니다.");

      setTeacherAnswers({});
      setNotice(
        `답 ${answers.length}개를 카드로 만들었습니다. 다음 질문부터 챗봇이 이 답을 씁니다.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "답변을 저장하지 못했습니다.");
    } finally {
      setIsLoadingQuestions(false);
    }
  }

  async function handleCopyAttendanceSummary() {
    try {
      await navigator.clipboard.writeText(formatAttendanceSummary(attendanceSummary, attendanceClassLabel));
      setNotice("참여 현황을 복사했습니다.");
    } catch {
      setNotice("복사에 실패했습니다. 내용을 직접 선택해 복사해 주세요.");
    }
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

  /**
   * 저장할 챗봇 설정을 만든다.
   * 방금 계산한 동작 설정을 넘기면 그것을 쓴다 — React 상태 반영을 기다리지 않기 위해서다.
   */
  function buildCurrentChatbotConfig(behaviorOverride?: QuestioningChatbotBehavior) {
    if (!configuredMaterialWithVocabulary.visibleText.trim() && !configuredMaterialWithVocabulary.summary.trim()) {
      setNotice("학생용 챗봇을 열기 전에 질문 자료 전체 내용을 입력해 주세요.");
      return null;
    }

    const normalizedBehavior = normalizeQuestioningChatbotBehavior(behaviorOverride ?? behavior);
    const normalizedPrdText = buildPrdText({
      targetGrade,
      subjectUnit,
      standard: standardText,
      assessmentAnalysis,
      material: configuredMaterialWithVocabulary,
      rubric,
      behavior: normalizedBehavior,
    });
    const config: QuestioningChatbotConfig = {
      targetGrade,
      subjectUnit,
      standard: standardText,
      assessmentAnalysis,
      curriculumCompass: buildCurriculumCompass(standardText, assessmentAnalysis),
      material: configuredMaterialWithVocabulary,
      rubric,
      behavior: normalizedBehavior,
      prdText: normalizedPrdText,
      classInfo: normalizeQuestioningClassInfo({
        school: schoolName,
        classroom: classroomName,
        classSize: Number(classSize),
      }),
      updatedAt: new Date().toISOString(),
    };

    return config;
  }

  function saveStudentChatbotConfig(
    successNotice = "현재 설정을 학생용 질문 도우미 챗봇에 연결했습니다.",
    behaviorOverride?: QuestioningChatbotBehavior,
  ) {
    const config = buildCurrentChatbotConfig(behaviorOverride);
    if (!config) {
      return false;
    }

    window.localStorage.setItem(QUESTIONING_CHATBOT_CONFIG_KEY, JSON.stringify(config));
    setMaterial(configuredMaterialWithVocabulary);
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

  /**
   * 생각 카드를 서버에 만들어 저장한다.
   *
   * 카드 저장소가 아직 준비되지 않았거나 서버가 실패해도 수업 준비를 막지 않는다.
   * 그때는 null을 돌려주고, ⑧은 지금까지처럼 프롬프트에 카드를 넣어 진행한다.
   */
  async function requestThinkingCards(): Promise<CardBuildResult | null> {
    try {
      const response = await fetch("/api/questioning-board/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: configuredMaterialWithVocabulary,
          lessonCode: connectionLessonCode,
          standard: standardText,
          targetGrade,
          subjectUnit,
          setupToken: connectionSetupToken,
          geminiApiKey: aiApiKey,
          geminiModel: aiModel,
        }),
      });
      if (!response.ok) return null;
      return (await response.json()) as CardBuildResult;
    } catch {
      return null;
    }
  }

  /**
   * ⑧ 한 번에 마무리: 학생용 챗봇에 설정을 적용하고, 노션 준비 DB에도 저장한다.
   * 노션 토큰이 없으면 챗봇 적용까지만 하고 그 사실을 알려 준다.
   *
   * 카드에 교사가 확인할 것(메모 해석·웹 리서치)이 있으면 여기서 한 번 멈춘다.
   * 확인할 것이 없으면 멈추지 않고 그대로 끝낸다 — 버튼을 하나로 합친 뜻이 이것이다.
   */
  async function handleApplyAndSave() {
    // 자료 이름이 비어 있으면 본문 첫 줄로 채워 화면에도 보여 준다.
    if (!materialTitle.trim()) {
      const derived = firstLineTitle(teacherNotes.trim());
      if (derived) setMaterialTitle(derived);
    }

    setIsBuildingCards(true);
    const cardResult = await requestThinkingCards();
    setIsBuildingCards(false);

    if (cardResult && cardResult.needsConfirmation.length > 0) {
      const memory = readCardChoiceMemory();
      const selections: Record<string, boolean> = {};
      const prompts: Record<string, string> = {};
      cardResult.needsConfirmation.forEach((item) => {
        const remembered = memory[cardChoiceKey(item)];
        selections[item.id] = typeof remembered === "boolean" ? remembered : item.defaultEnabled;
        prompts[item.id] = item.dialoguePrompt ?? "";
      });
      setCardSelections(selections);
      setCardPrompts(prompts);
      setCardConfirmation(cardResult);
      setNotice("확인할 내용이 있습니다. 아래 창에서 한 번만 확인해 주세요.");
      return;
    }

    await finishApplyAndSave(cardResult);
  }

  /** 확인 창에서 고른 결과를 서버에 반영하고, 이어서 저장을 마친다. */
  async function handleConfirmCards() {
    const pending = cardConfirmation;
    if (!pending) return;

    const enabledCardIds: string[] = [];
    const disabledCardIds: string[] = [];
    const dialogueEdits: Array<{ id: string; dialoguePrompt: string }> = [];
    const memory = readCardChoiceMemory();

    pending.needsConfirmation.forEach((item) => {
      const enabled = cardSelections[item.id] ?? item.defaultEnabled;
      (enabled ? enabledCardIds : disabledCardIds).push(item.id);
      memory[cardChoiceKey(item)] = enabled;

      const prompt = (cardPrompts[item.id] ?? "").trim();
      if (enabled && item.cardType === "dialogue_design" && prompt) {
        dialogueEdits.push({ id: item.id, dialoguePrompt: prompt });
      }
    });
    writeCardChoiceMemory(memory);

    setIsBuildingCards(true);
    try {
      await fetch("/api/questioning-board/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: pending.documentId,
          setupToken: connectionSetupToken,
          enabledCardIds,
          disabledCardIds,
          dialogueEdits,
        }),
      });
    } catch {
      // 반영에 실패해도 챗봇 적용과 노션 저장은 이어서 진행한다.
    }
    setIsBuildingCards(false);

    setCardConfirmation(null);
    await finishApplyAndSave(pending);
  }

  /** 확인 창을 닫고 이번에는 카드 없이 진행한다. */
  async function handleSkipCardConfirmation() {
    const pending = cardConfirmation;
    setCardConfirmation(null);
    await finishApplyAndSave(pending);
  }

  /** ⑧의 나머지 — 챗봇 적용과 노션 저장. 확인 창이 있든 없든 여기로 모인다. */
  async function finishApplyAndSave(cardResult: CardBuildResult | null) {
    // 카드 검색이 학생 응답에 붙기 전까지는 프롬프트에도 넣어 둔다.
    // 지금 빼면 챗봇이 카드를 전혀 쓰지 못한다.
    const { card, applied: questionCount, nextBehavior } = buildAndApplyThinkingCard();
    const cardNote =
      card.openQuestions.length > 0
        ? ` 예상 질문 ${questionCount}개를 반영했고, 지문으로 답할 수 없는 질문 ${card.openQuestions.length}개는 학생과 함께 확인하도록 두었습니다.`
        : ` 예상 질문 ${questionCount}개를 반영했습니다.`;
    const storedNote = cardResult ? ` 생각 카드 ${cardResult.total}장을 저장했습니다.` : "";

    const saved = saveStudentChatbotConfig(
      `학생용 챗봇에 적용했습니다.${cardNote}${storedNote}`,
      nextBehavior,
    );
    if (!saved) return;

    // 수업 코드로 들어오는 학생은 서버에 저장된 연결을 읽는다. 그걸 갱신하지 않으면
    // 교사가 자료를 바꿔도 학생은 ④를 눌렀을 때의 옛 자료를 계속 본다.
    const connectionNote = await refreshLessonConnection(nextBehavior);

    if (!notionApiKey.trim()) {
      setNotice(
        `학생용 챗봇에 적용했습니다.${cardNote}${storedNote}${connectionNote} 노션에도 저장하려면 위 ②에 Notion API 토큰을 입력해 주세요.`,
      );
      return;
    }

    await handleSavePreparationToNotion(
      `학생용 챗봇에 적용하고 노션 준비 DB에도 저장했습니다.${cardNote}${storedNote}${connectionNote}`,
      nextBehavior,
    );
  }

  /**
   * 저장된 수업 연결을 새 설정으로 갱신한다. 연결을 만든 적이 없으면 조용히 건너뛴다.
   * 갱신에 실패해도 ⑧의 나머지(챗봇 적용·노션 저장)는 그대로 진행한다.
   */
  async function refreshLessonConnection(behaviorOverride?: QuestioningChatbotBehavior): Promise<string> {
    // 수업 코드만 있으면 갱신을 시도한다. 학생용 주소 상태는 새로고침으로 비었을 수
    // 있고, 같은 코드로 upsert하는 것이라 이미 있는 연결이면 새 설정으로 덮인다.
    if (!connectionLessonCode.trim()) return "";

    const config = buildCurrentChatbotConfig(behaviorOverride);
    if (!config) return "";

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
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "수업 연결 갱신에 실패했습니다.");
      }
      return " 학생용 수업 연결도 새 자료로 갱신했습니다.";
    } catch (error) {
      const message = error instanceof Error ? error.message : "수업 연결 갱신에 실패했습니다.";
      return ` ⚠ 학생용 수업 연결 갱신은 실패했습니다(${message}). ④를 다시 눌러 주세요.`;
    }
  }

  async function handleSavePreparationToNotion(
    successNotice?: string,
    behaviorOverride?: QuestioningChatbotBehavior,
  ) {
    const config = buildCurrentChatbotConfig(behaviorOverride);
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
      const baseNotice = successNotice || "챗봇 수업 준비 DB에 저장했습니다.";
      setNotice(payload.pageUrl ? `${baseNotice} ${payload.pageUrl}` : baseNotice);
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
      try {
        window.localStorage.setItem(
          CONNECTION_STORAGE_KEY,
          JSON.stringify({ lessonCode: payload.lessonCode, studentUrl: absoluteStudentUrl }),
        );
      } catch {
        // 기억 실패는 무시한다.
      }
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
      materialTitle: configuredMaterialWithVocabulary.materialTitle || materialTitle,
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
                <Label htmlFor="ai-api-key">① Gemini API 키</Label>
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
                <Label htmlFor="notion-api-key">② Notion API 토큰</Label>
                <div className="flex gap-2">
                  <Input
                    id="notion-api-key"
                    type="password"
                    value={notionApiKey}
                    onChange={(event) => {
                      setNotionApiKey(event.target.value);
                      setIsNotionTokenSaved(false);
                    }}
                    placeholder="ntn_... 또는 secret_..."
                    autoComplete="off"
                  />
                  <Button type="button" variant="outline" className="whitespace-nowrap" onClick={handleSaveNotionToken}>
                    저장
                  </Button>
                  <Button type="button" variant="outline" className="whitespace-nowrap" onClick={handleClearNotionToken}>
                    삭제
                  </Button>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Notion 템플릿 페이지에 Integration을 연결하면 준비 DB와 결과 DB는 자동으로 찾습니다. 키와 토큰은 코드나 문서에 포함하지 않습니다.{" "}
              <span className="font-medium text-foreground">
                {isAiKeySaved ? "Gemini 키 브라우저 저장됨" : "Gemini 키는 저장 전입니다."}
                {" · "}
                {isNotionTokenSaved ? "Notion 토큰 브라우저 저장됨" : "Notion 토큰은 저장 전입니다."}
              </span>{" "}
              키와 토큰은 이 브라우저에만 저장됩니다. 다른 컴퓨터나 브라우저에서 열면 다시 입력해야 합니다.
            </p>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Cloud className="size-4 text-primary" aria-hidden="true" />
                <p className="font-semibold">수업 연결 저장</p>
                <p className="text-muted-foreground">
                  Supabase에 수업 코드를 만들고, 가능하면 Notion 준비 DB에도 기록합니다.
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(150px,1.1fr)_minmax(130px,1fr)_88px_88px_minmax(110px,0.9fr)_minmax(100px,0.8fr)_auto]">
                <div className="space-y-2">
                  <Label htmlFor="connection-teacher-label">③ 교사/수업 표시명</Label>
                  <Input
                    id="connection-teacher-label"
                    value={connectionTeacherLabel}
                    onChange={(event) => setConnectionTeacherLabel(event.target.value)}
                    placeholder="예: 4학년 질문 수업"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connection-school">③-1 학교</Label>
                  <Input
                    id="connection-school"
                    value={schoolName}
                    onChange={(event) => {
                      setSchoolName(event.target.value);
                      rememberClassInfo(event.target.value, classroomName, classSize);
                    }}
                    placeholder="예: 푸른초등학교"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connection-classroom" className="whitespace-nowrap">③-2 학년반</Label>
                  <Input
                    id="connection-classroom"
                    value={classroomName}
                    onChange={(event) => {
                      setClassroomName(event.target.value);
                      rememberClassInfo(schoolName, event.target.value, classSize);
                    }}
                    placeholder="4-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connection-class-size" className="whitespace-nowrap">③-3 인원</Label>
                  <Input
                    id="connection-class-size"
                    type="number"
                    min={1}
                    max={60}
                    value={classSize}
                    onChange={(event) => {
                      setClassSize(event.target.value);
                      rememberClassInfo(schoolName, classroomName, event.target.value);
                    }}
                    placeholder="24"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connection-lesson-code" className="whitespace-nowrap">수업 코드</Label>
                  <Input
                    id="connection-lesson-code"
                    value={connectionLessonCode}
                    onChange={(event) => setConnectionLessonCode(event.target.value)}
                    placeholder="비우면 자동 생성"
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
                    className="flex-1 whitespace-nowrap"
                    onClick={handleSaveLessonConnection}
                    disabled={isSavingLessonConnection}
                  >
                    {isSavingLessonConnection ? (
                      <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Database className="size-4" aria-hidden="true" />
                    )}
                    ④ 수업 연결 저장
                  </Button>
                  <Button type="button" variant="outline" className="whitespace-nowrap" onClick={handleCopyStudentUrl}>
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
                <h2 className="text-base font-semibold">⑤ 성취기준 선택</h2>
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
                <h2 className="text-base font-semibold">평가 루브릭 <span className="ml-1 text-xs font-normal text-muted-foreground">(성취기준에서 자동 생성)</span></h2>
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
                <h2 className="text-base font-semibold">⑥ 질문 자료 입력</h2>
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
                      <Upload className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="flex flex-col leading-5">
                        <span className="font-medium text-foreground">이미지로 넣기 (선택)</span>
                        <span>JPG, PNG</span>
                      </span>
                      <input type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
                    </label>
                    <button
                      type="button"
                      onClick={handleAnalyzeImage}
                      disabled={isAnalyzing || !imageDataUrl}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-xs hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <RefreshCw className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                      ) : (
                        <Wand2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      )}
                      <span className="flex flex-col leading-5 text-left">
                        <span className="font-medium text-foreground">AI 추출기</span>
                        <span className="text-muted-foreground">올린 이미지에서 전체 텍스트 추출</span>
                      </span>
                    </button>
                  </div>
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
                <div className="space-y-2">
                  <Label htmlFor="question-focus-memo">⑦ 챗봇 수업 메모</Label>
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
              </div>



            </div>
          </div>

        </>

        <>
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">챗봇 제작 PRD <span className="ml-1 text-xs font-normal text-muted-foreground">(자동 생성)</span></h2>
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
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-sm font-medium">챗봇에 들어갈 설정이 준비되었습니다.</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  아래 버튼 하나로 끝납니다. 학생이 물어볼 질문·어휘·오개념을 자동으로 정리해 챗봇에 넣고,
                  학생용 챗봇에 적용한 뒤 노션 준비 DB에도 저장합니다.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 px-0 text-xs"
                  onClick={() => setIsPrdOpen((current) => !current)}
                >
                  {isPrdOpen ? "지시문 전문 접기" : "지시문 전문 보기 (확인용)"}
                </Button>
                {isPrdOpen ? (
                  <Textarea value={prdText} readOnly className="mt-2 min-h-[360px] font-mono text-xs leading-5" />
                ) : null}
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={handleApplyAndSave}
                disabled={isSavingPreparationToNotion || isBuildingCards}
              >
                {isSavingPreparationToNotion || isBuildingCards ? (
                  <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Database className="size-4" aria-hidden="true" />
                )}
                {isBuildingCards ? "생각 카드를 만드는 중..." : "⑧ 모두 적용 및 노션 저장"}
              </Button>

              <Button
                type="button"
                className="mt-2 w-full bg-primary/90 py-6 text-base font-bold hover:bg-primary"
                onClick={handleOpenStudentChatbot}
              >
                <Bot className="size-5" aria-hidden="true" />
                학생 챗봇 시작
              </Button>

              {cardConfirmation ? (
                <div className="mt-3 space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
                  <div>
                    <h3 className="text-sm font-semibold">확인하시겠습니까?</h3>
                    <p className="text-xs leading-5 text-muted-foreground">
                      생각 카드 {cardConfirmation.total}장을 만들었습니다. 지문에서 뽑은 낱말·사실·추론 카드는
                      확인 없이 그대로 씁니다. 아래 두 가지만 한 번 봐 주세요.
                      {cardConfirmation.weakCardCount > 0
                        ? ` 근거가 모자라 답변에 쓰지 않는 카드가 ${cardConfirmation.weakCardCount}장 있습니다.`
                        : ""}
                    </p>
                    {cardConfirmation.warning ? (
                      <p className="mt-1 text-xs leading-5 text-amber-800">{cardConfirmation.warning}</p>
                    ) : null}
                  </div>

                  {cardConfirmation.needsConfirmation.map((item) => (
                    <div key={item.id} className="rounded-md border border-border bg-background p-3">
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={cardSelections[item.id] ?? item.defaultEnabled}
                          onChange={(event) =>
                            setCardSelections((current) => ({ ...current, [item.id]: event.target.checked }))
                          }
                        />
                        <span className="flex-1">
                          <b className="font-semibold">
                            {item.cardType === "dialogue_design" ? "교사 메모" : "웹에서 찾은 내용"}
                          </b>
                          <span className="ml-2 text-muted-foreground">{item.title}</span>
                        </span>
                      </label>

                      {item.cardType === "dialogue_design" ? (
                        <div className="mt-2 space-y-1 pl-6">
                          <p className="text-xs text-muted-foreground">
                            {item.dialogueTrigger} — {item.dialogueGoal}
                          </p>
                          <Input
                            value={cardPrompts[item.id] ?? ""}
                            placeholder="학생에게 이렇게 물어봅니다"
                            onChange={(event) =>
                              setCardPrompts((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            메모를 발문으로 옮긴 것입니다. 어색하면 문장을 고쳐 주세요.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1 pl-6 text-xs leading-5">
                          <p>{item.content}</p>
                          <p className="text-muted-foreground">
                            출처 {item.sourceReliability}등급 · {item.externalSourceOrganization}
                            {item.externalSourceUrl ? (
                              <>
                                {" · "}
                                <a
                                  href={item.externalSourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  원문 보기
                                </a>
                              </>
                            ) : null}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={handleConfirmCards} disabled={isBuildingCards}>
                      확인하고 저장
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleSkipCardConfirmation}
                      disabled={isBuildingCards}
                    >
                      이번에는 넘어가기
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    고르신 내용은 기억해 두었다가 다음에 다시 묻지 않습니다.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card sm:col-span-2 xl:col-span-4">
            <div className="border-b border-border p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <ClipboardList className="size-5 text-primary" aria-hidden="true" />
                  <h2 className="text-base font-semibold">교사용 평가 기록</h2>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={handleDownloadEvaluationWorkbook}>
                  <Download className="size-4" aria-hidden="true" />
                  엑셀 다운로드
                </Button>
              </div>

              <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3">
                <div>
                  <h3 className="text-sm font-semibold">참여 현황 — 아직 질문하지 않은 학생 찾기</h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    노션 결과 DB의 <code>학교_반_번호</code> 목록을 붙여넣으면 기록이 없는 번호를 찾아 줍니다.
                    번호만 쉼표로 나열해도 됩니다. 참여 여부만 보며, 질문 개수를 세지 않습니다.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="attendance-records">질문 기록 목록</Label>
                  <Textarea
                    id="attendance-records"
                    value={participationInput}
                    onChange={(event) => setParticipationInput(event.target.value)}
                    className="min-h-24 font-mono text-xs"
                    placeholder={"푸른초등학교_4-2_1\n푸른초등학교_4-2_3\n푸른초등학교_4-2_7"}
                  />
                </div>

                {attendanceSummary.total > 0 ? (
                  <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-muted px-2 py-1 font-medium">
                        참여 {attendanceSummary.participatedNumbers.length}/{attendanceSummary.total}명 (
                        {attendanceSummary.participationRate}%)
                      </span>
                      {attendanceSummary.missingNumbers.length > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-900">
                          미제출 {attendanceSummary.missingNumbers.length}명
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-900">
                          전원 참여
                        </span>
                      )}
                    </div>

                    {attendanceSummary.missingNumbers.length > 0 ? (
                      <p className="leading-6">
                        아직 질문하지 않은 학생:{" "}
                        <b>{attendanceSummary.missingNumbers.map((number) => `${number}번`).join(", ")}</b>
                      </p>
                    ) : (
                      <p className="leading-6">모든 학생에게 질문 기록이 있습니다.</p>
                    )}

                    {attendanceSummary.outOfRangeNumbers.length > 0 ? (
                      <p className="text-xs leading-5 text-amber-800">
                        학급 인원({attendanceSummary.total}명)을 넘는 번호가 있습니다:{" "}
                        {attendanceSummary.outOfRangeNumbers.join(", ")}. 다른 반 기록이거나 번호 오타일 수 있으니
                        확인해 주세요.
                      </p>
                    ) : null}

                    <Button type="button" size="sm" variant="outline" onClick={handleCopyAttendanceSummary}>
                      참여 현황 복사
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">위 ③-3에 학급 인원을 입력하면 미제출 학생을 찾아 드립니다.</p>
                )}
              </div>

              <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3">
                <div>
                  <h3 className="text-sm font-semibold">아이들이 물었는데 카드에 없던 질문</h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    챗봇이 지문과 카드로 답하지 못한 질문입니다. 여기에 답을 적으면 카드가 되어,
                    <b> 다음 질문부터 챗봇이 그 답을 씁니다.</b> 답을 적지 않은 질문은 학생과 함께 확인할 몫으로 남습니다.
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleLoadUnansweredQuestions}
                  disabled={isLoadingQuestions}
                >
                  {isLoadingQuestions ? (
                    <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  새로 고침
                </Button>
                {unansweredQuestions.length === 0 && !isLoadingQuestions ? (
                  <p className="text-xs text-muted-foreground">
                    {connectionLessonCode.trim()
                      ? "카드로 답하지 못한 질문이 아직 없습니다."
                      : "④에서 수업 연결을 저장하면 여기 자동으로 표시됩니다."}
                  </p>
                ) : null}

                {unansweredQuestions.length > 0 ? (
                  <div className="space-y-3">
                    {unansweredQuestions.map((item) => (
                      <div key={item.question} className="space-y-2 rounded-md border border-border p-3">
                        <p className="text-sm leading-6">
                          <b>{item.question}</b>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.askedCount > 1 ? `${item.askedCount}명이 물었어요` : "1명"}
                            {item.questionIntent ? ` · ${item.questionIntent}` : ""}
                          </span>
                        </p>
                        <Textarea
                          value={teacherAnswers[item.question] ?? ""}
                          placeholder="아이 눈높이로 답을 적어 주세요. 비워 두면 카드로 만들지 않습니다."
                          className="min-h-[64px] text-sm"
                          onChange={(event) =>
                            setTeacherAnswers((current) => ({ ...current, [item.question]: event.target.value }))
                          }
                        />
                      </div>
                    ))}
                    <Button type="button" size="sm" onClick={handleSaveTeacherAnswers} disabled={isLoadingQuestions}>
                      답을 카드로 만들기
                    </Button>
                  </div>
                ) : null}
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
