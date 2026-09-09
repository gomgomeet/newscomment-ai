import {
  buildCurriculumCompass,
  buildRubric,
  createLocalQuestionResult,
  type MaterialAnalysis,
  type QuestioningConversationEntry,
} from "@/lib/questioning-board";
import { applyQuestioningConversationPhase } from "@/lib/questioning-conversation-phase";

export const LITE_ENGINE_SCHEMA_VERSION = 1;
export const LITE_ENGINE_POLICY_VERSION = "questioning-lite-plan-v1";

type LiteMode = "evaluation" | "exploration";

type LiteLessonInput = {
  lessonId: string;
  subject: string;
  grade: string;
  lessonTitle: string;
  lessonGoal: string;
  achievementStandard: string;
  assessmentCriteria: string;
  rubricHigh: string;
  rubricMeet: string;
  rubricDeveloping: string;
  evidenceDescription: string;
  materialTitle: string;
  materialText: string;
  startQuestion: string;
  version: string;
};

export type LiteEnginePlanInput = {
  schemaVersion: 1;
  requestId: string;
  sessionKey: string;
  activityMode: LiteMode;
  studentMessage: string;
  history: Array<{ speaker: "student" | "bot"; text: string }>;
  lesson: LiteLessonInput;
};

type NormalizedLiteEnginePlanInput = Omit<LiteEnginePlanInput, "history"> & {
  history: QuestioningConversationEntry[];
};

export type LiteEnginePlan = {
  schemaVersion: 1;
  requestId: string;
  policyVersion: string;
  skipModel: boolean;
  fallbackReply: string;
  modelRequest: {
    model: string;
    reasoningEffort: "low";
    maxOutputTokens: number;
    instructions: string;
    input: string;
  };
  enforcement: {
    allowQuestion: boolean;
    managedQuestion: string;
    maximumQuestionCount: 0 | 1;
  };
  observation: {
    conversationPhase: 1 | 2;
    primaryMove: string;
    sourceStatus: string;
    safetyFlag: boolean;
    isClosing: boolean;
    rubricScores: Array<{ criterionKey: string; score: number; rationale: string }>;
  };
};

const MAX_HISTORY_TURNS = 18;
const MAX_HISTORY_CHARS = 8_000;
const KEYWORD_STOPWORDS = new Set([
  "그리고", "그러나", "하지만", "그래서", "때문에", "통해서", "대한", "위해",
  "있습니다", "합니다", "했습니다", "하는", "되는", "있는", "없는", "학생", "수업",
  "자료", "기사", "내용", "질문", "생각", "우리", "그것", "이것",
]);

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}을(를) 입력해 주세요.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${label}은(는) ${max}자 이내여야 합니다.`);
  return text;
}

function optionalText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeHistory(value: unknown): QuestioningConversationEntry[] {
  if (!Array.isArray(value)) return [];
  const entries = value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => item.speaker === "student" || item.speaker === "bot")
    .map((item) => ({
      role: item.speaker === "student" ? ("student" as const) : ("assistant" as const),
      content: optionalText(item.text, 1_200),
    }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_TURNS);
  let total = 0;
  const kept: QuestioningConversationEntry[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (total + entry.content.length > MAX_HISTORY_CHARS) break;
    kept.unshift(entry);
    total += entry.content.length;
  }
  return kept;
}

function extractKeyConcepts(text: string) {
  const counts = new Map<string, number>();
  text
    .split(/[^가-힣A-Za-z0-9-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !KEYWORD_STOPWORDS.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 16)
    .map(([word]) => word);
}

function hasMaterialWord(studentMessage: string, materialText: string) {
  const material = materialText.replace(/\s+/g, "").toLowerCase();
  return studentMessage
    .split(/[^가-힣A-Za-z0-9-]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 2 && !KEYWORD_STOPWORDS.has(word))
    .some((word) => material.includes(word));
}

function isClearlyOffTopic(studentMessage: string, materialText: string) {
  const obvious = /(야구|축구|농구|게임|아이돌|유튜브|로또|드라마|영화|연예인|오늘\s*날씨|점심\s*메뉴|배고파|졸려|심심해)/i;
  return obvious.test(studentMessage) && !hasMaterialWord(studentMessage, materialText);
}

function summarizeMaterial(text: string) {
  const sentences = text
    .replace(/(\d)\.(\d)/g, "$1<decimal>$2")
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.replace(/<decimal>/g, ".").trim())
    .filter(Boolean);
  return (sentences.slice(0, 4).join(" ") || text).slice(0, 900);
}

function normalizeInput(value: unknown): NormalizedLiteEnginePlanInput {
  if (typeof value !== "object" || value === null) throw new Error("요청 형식을 확인해 주세요.");
  const raw = value as Record<string, unknown>;
  const lessonRaw = raw.lesson;
  if (typeof lessonRaw !== "object" || lessonRaw === null) throw new Error("수업 설정을 확인해 주세요.");
  const lesson = lessonRaw as Record<string, unknown>;
  const activityMode = raw.activityMode === "exploration" ? "exploration" : raw.activityMode === "evaluation" ? "evaluation" : null;
  if (!activityMode) throw new Error("운영 모드를 확인해 주세요.");
  const materialText = requiredText(lesson.materialText, "수업자료", 30_000);
  if (materialText.length < 30) throw new Error("수업자료는 30자 이상이어야 합니다.");

  return {
    schemaVersion: LITE_ENGINE_SCHEMA_VERSION,
    requestId: requiredText(raw.requestId, "요청 ID", 100),
    sessionKey: requiredText(raw.sessionKey, "세션 키", 100),
    activityMode,
    studentMessage: requiredText(raw.studentMessage, "학생 질문", 800),
    history: normalizeHistory(raw.history),
    lesson: {
      lessonId: requiredText(lesson.lessonId, "수업 ID", 80),
      subject: requiredText(lesson.subject, "교과", 40),
      grade: requiredText(lesson.grade, "학년", 40),
      lessonTitle: requiredText(lesson.lessonTitle, "수업명", 120),
      lessonGoal: requiredText(lesson.lessonGoal, "수업 목표", 500),
      achievementStandard: requiredText(lesson.achievementStandard, "성취기준", 1_000),
      assessmentCriteria: requiredText(lesson.assessmentCriteria, "평가기준", 1_500),
      rubricHigh: requiredText(lesson.rubricHigh, "도달 수준", 1_000),
      rubricMeet: requiredText(lesson.rubricMeet, "성장 중 수준", 1_000),
      rubricDeveloping: requiredText(lesson.rubricDeveloping, "도움 필요 수준", 1_000),
      evidenceDescription: requiredText(lesson.evidenceDescription, "평가 근거", 1_000),
      materialTitle: requiredText(lesson.materialTitle, "자료 제목", 120),
      materialText,
      startQuestion: requiredText(lesson.startQuestion, "시작 질문", 500),
      version: optionalText(lesson.version, 30) || "v1",
    },
  };
}

function lastQuestionFrom(reply: string) {
  const questions = reply.match(/[^.!?？]+[?？]/g) || [];
  return questions.at(-1)?.trim() || "";
}

function withoutQuestionSentences(reply: string) {
  return reply.replace(/[^.!?？]*[?？]/g, " ").replace(/\s+/g, " ").trim();
}

function historyForPrompt(history: QuestioningConversationEntry[]) {
  if (!history.length) return "(첫 대화)";
  return history
    .slice(-8)
    .map((entry) => `${entry.role === "student" ? "학생" : "챗봇"}: ${entry.content}`)
    .join("\n");
}

export function createLiteEnginePlan(value: unknown): LiteEnginePlan {
  const input = normalizeInput(value);
  const lesson = input.lesson;
  const material: MaterialAnalysis = {
    materialTitle: lesson.materialTitle,
    summary: summarizeMaterial(lesson.materialText),
    visibleText: lesson.materialText,
    questionFocusMemo: lesson.evidenceDescription,
    keyConcepts: extractKeyConcepts(lesson.materialText),
    vocabulary: [],
    possibleMisconceptions: [],
    questionSeeds: [lesson.startQuestion],
    sourceLimit: "교사가 입력한 수업자료의 범위를 구분해 답합니다.",
    safetyNotice: "학생 이름, 연락처, 주소 등 개인정보를 답에 반복하지 않습니다.",
  };
  const rubric = buildRubric(lesson.achievementStandard);
  const curriculumCompass = buildCurriculumCompass(lesson.achievementStandard);
  const base = createLocalQuestionResult({
    studentTurn: input.studentMessage,
    material,
    rubric,
    conversation: input.history,
    curriculumCompass,
    targetGrade: lesson.grade,
  });
  let planned = applyQuestioningConversationPhase({
    result: base,
    currentTurn: input.studentMessage,
    conversation: input.history,
    material,
    standard: lesson.achievementStandard,
    teacherMemo: lesson.evidenceDescription,
  });
  const clearlyOffTopic = isClearlyOffTopic(input.studentMessage, lesson.materialText);
  if (clearlyOffTopic && !planned.safetyFlag && !planned.isClosing) {
    const reply = "이 질문은 지금 수업자료와 관련이 적어요. 자료에서 궁금한 낱말이나 사실을 찾아 이야기해 주세요.";
    planned = {
      ...planned,
      studentReply: reply,
      answer: reply,
      followUpQuestion: "",
      expectsStudentReply: false,
      primaryMove: "receive",
      curriculumRelation: "disconnected",
      sourceStatus: "out_of_scope",
    };
  }
  const managedQuestion = planned.expectsStudentReply ? lastQuestionFrom(planned.studentReply) : "";
  const skipModel = Boolean(
    clearlyOffTopic || planned.safetyFlag || planned.isClosing || planned.primaryMove === "repair" ||
    (input.activityMode === "evaluation" &&
      (planned.sourceStatus === "source_insufficient" || planned.sourceStatus === "out_of_scope"))
  );
  const source = planned.sourceCue?.trim() || material.summary;
  const modeRule = input.activityMode === "evaluation"
    ? "평가모드입니다. 제공된 근거에 없는 사실은 만들지 말고, 자료에 없다고 짧게 밝히세요."
    : "탐색모드입니다. 수업 주제와 직접 관련된 확장 설명은 가능하지만, 자료 밖 정보는 ‘자료에는 없지만 일반적으로’라고 구분하세요.";
  const questionRule = managedQuestion
    ? `답변 마지막에는 다음 질문을 글자 그대로 한 번만 붙이세요: ${managedQuestion}`
    : "학생에게 새 질문을 하지 말고 물음표를 사용하지 마세요.";

  return {
    schemaVersion: LITE_ENGINE_SCHEMA_VERSION,
    requestId: input.requestId,
    policyVersion: LITE_ENGINE_POLICY_VERSION,
    skipModel,
    fallbackReply: planned.studentReply,
    modelRequest: {
      model: process.env.LITE_ENGINE_MODEL?.trim() || "gpt-5.6-terra",
      reasoningEffort: "low",
      maxOutputTokens: 700,
      instructions: [
        `당신은 ${lesson.grade} 학생의 질문을 돕는 교실 챗봇입니다.`,
        "먼저 학생 말에 자연스럽게 답하고, 정답이나 완성된 수행평가를 대신 써 주지 마세요.",
        "학생이 입력한 개인정보를 답변에서 반복하지 마세요.",
        "숫자와 사실은 제공된 근거와 다르게 바꾸지 마세요.",
        modeRule,
        questionRule,
        "reply 필드 하나를 가진 JSON만 반환하세요.",
      ].join(" "),
      input: [
        `[수업명] ${lesson.lessonTitle}`,
        `[수업 목표] ${lesson.lessonGoal}`,
        `[성취기준] ${lesson.achievementStandard}`,
        `[교사 평가기준] ${lesson.assessmentCriteria}`,
        `[수준별 기준] 도달: ${lesson.rubricHigh} / 성장 중: ${lesson.rubricMeet} / 도움 필요: ${lesson.rubricDeveloping}`,
        `[수집할 평가 근거] ${lesson.evidenceDescription}`,
        `[관련 자료 근거] ${source.slice(0, 2_500)}`,
        `[최근 대화]\n${historyForPrompt(input.history)}`,
        `[학생 말] ${input.studentMessage}`,
        `[중앙 정책 초안] ${withoutQuestionSentences(planned.studentReply) || planned.studentReply}`,
      ].join("\n\n"),
    },
    enforcement: {
      allowQuestion: Boolean(managedQuestion),
      managedQuestion,
      maximumQuestionCount: managedQuestion ? 1 : 0,
    },
    observation: {
      conversationPhase: planned.conversationPhase || 1,
      primaryMove: planned.primaryMove,
      sourceStatus: planned.sourceStatus,
      safetyFlag: planned.safetyFlag,
      isClosing: planned.isClosing,
      rubricScores: planned.rubricScores,
    },
  };
}
