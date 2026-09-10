import { createHash } from "node:crypto";

import {
  type ChatEvaluation,
  type ChatResult,
  buildCurriculumCompass,
  buildRubric,
  createDefaultQuestioningChatbotBehavior,
  normalizeQuestioningChatbotConfig,
  type MaterialAnalysis,
  type QuestioningChatbotConfig,
  type QuestioningConversationEntry,
  type RubricCriterion,
} from "@/lib/questioning-board";
import {
  QUESTIONING_ENGINE_FAMILY,
  runQuestioningLocalEngine,
} from "@/lib/questioning-engine-core";
import {
  getQuestioningTurnMetadata,
  type QuestioningManagedKind,
} from "@/lib/questioning-conversation-phase";

export const LITE_ENGINE_SCHEMA_VERSION = 1;
export const LITE_ENGINE_POLICY_VERSION = "questioning-dialogue-v2-lite-adapter-v4";

export type LiteMode = "evaluation" | "exploration";

export type LiteLessonInput = {
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
  sourceHash: string;
  lessonRevision: number;
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

export type NormalizedLiteEnginePlanInput = Omit<LiteEnginePlanInput, "history"> & {
  history: QuestioningConversationEntry[];
};

type LiteEngineDescriptor = {
  family: typeof QUESTIONING_ENGINE_FAMILY;
  sharedCore: true;
  providerAdapter: "teacher_openai";
  persistenceAdapter: "teacher_google_sheet";
};

export type LiteEngineObservation = {
  conversationPhase: 1 | 2;
  primaryMove: ChatResult["primaryMove"];
  engagementState: ChatResult["engagementState"];
  curriculumRelation: ChatResult["curriculumRelation"];
  supportLevel: ChatResult["supportLevel"];
  sourceStatus: ChatResult["sourceStatus"];
  sourceCue: string;
  questionType: ChatResult["questionType"];
  safetyFlag: boolean;
  isClosing: boolean;
  rubricScores: ChatEvaluation[];
  reachedDifficulty?: ChatResult["reachedDifficulty"];
  moreToExploreQuestions: string[];
  managedKind: QuestioningManagedKind;
  relatedQuestion: boolean;
  responseScore: number | null;
  evidenceIds: string[];
};

export type LiteEnginePlan = {
  schemaVersion: 1;
  requestId: string;
  policyVersion: string;
  planDigest: string;
  engine: LiteEngineDescriptor;
  skipModel: boolean;
  fallbackReply: string;
  modelRequest: {
    model: string;
    reasoningEffort: "low";
    maxOutputTokens: number;
    outputContract: "lead_evidence_quote_v1";
    instructions: string;
    input: string;
  };
  enforcement: {
    allowQuestion: boolean;
    managedQuestion: string;
    maximumQuestionCount: 0 | 1;
  };
  observation: LiteEngineObservation;
};

export type LiteEngineFinalizedResponse = {
  schemaVersion: 2;
  requestId: string;
  policyVersion: string;
  planDigest: string;
  engine: LiteEngineDescriptor;
  studentReply: string;
  expectsStudentReply: boolean;
  isClosing: boolean;
  localFallback: boolean;
  observation: LiteEngineObservation;
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

function designText(value: unknown, label: string, max: number, activityMode: LiteMode) {
  if (activityMode === "evaluation") return requiredText(value, label, max);
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new Error(`${label}은(는) ${max}자 이내여야 합니다.`);
  return text;
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

function summarizeMaterial(text: string) {
  const sentences = text
    .replace(/(\d)\.(\d)/g, "$1<decimal>$2")
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.replace(/<decimal>/g, ".").trim())
    .filter(Boolean);
  return (sentences.slice(0, 4).join(" ") || text).slice(0, 900);
}

export function normalizeLiteEngineInput(value: unknown): NormalizedLiteEnginePlanInput {
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
      lessonGoal: designText(lesson.lessonGoal, "수업 목표", 500, activityMode),
      achievementStandard: designText(lesson.achievementStandard, "성취기준", 1_000, activityMode),
      assessmentCriteria: designText(lesson.assessmentCriteria, "평가기준", 1_500, activityMode),
      rubricHigh: designText(lesson.rubricHigh, "도달 수준", 1_000, activityMode),
      rubricMeet: designText(lesson.rubricMeet, "성장 중 수준", 1_000, activityMode),
      rubricDeveloping: designText(lesson.rubricDeveloping, "도움 필요 수준", 1_000, activityMode),
      evidenceDescription: designText(lesson.evidenceDescription, "평가 근거", 1_000, activityMode),
      materialTitle: requiredText(lesson.materialTitle, "자료 제목", 120),
      materialText,
      startQuestion: requiredText(lesson.startQuestion, "시작 질문", 500),
      version: optionalText(lesson.version, 30) || "v1",
      sourceHash: requiredText(lesson.sourceHash, "수업 설정 해시", 80),
      lessonRevision: Math.max(1, Math.min(10_000, Math.floor(Number(lesson.lessonRevision) || 1))),
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

function descriptorForLiteScore(lesson: LiteLessonInput, score: number) {
  if (score >= 4) return lesson.rubricHigh;
  if (score >= 2) return lesson.rubricMeet;
  return lesson.rubricDeveloping;
}

function buildLiteRubric(lesson: LiteLessonInput): RubricCriterion[] {
  return buildRubric(lesson.achievementStandard).map((criterion) => ({
    ...criterion,
    ...(criterion.key === "achievement_standard"
      ? {
          description: lesson.assessmentCriteria,
          observableEvidence: lesson.evidenceDescription,
          feedbackForward: `다음 활동에서는 ${lesson.rubricHigh}`,
        }
      : {}),
    levels: criterion.levels.map((level) => ({
      ...level,
      descriptor: `${level.descriptor} 교사 수준 기준: ${descriptorForLiteScore(lesson, level.score)}`,
    })),
  }));
}

export function createLiteQuestioningConfig(
  lesson: LiteLessonInput,
  activityMode: LiteMode,
): QuestioningChatbotConfig {
  const backwardDesignEnabled = activityMode === "evaluation";
  // 꺼 둔 설계는 요청 식별값에는 남기되 대화 정책과 개인 API 입력에는 적용하지 않는다.
  const standard = backwardDesignEnabled ? lesson.achievementStandard : "";
  const material: MaterialAnalysis = {
    materialTitle: lesson.materialTitle,
    summary: summarizeMaterial(lesson.materialText),
    visibleText: lesson.materialText,
    questionFocusMemo: backwardDesignEnabled ? [
      `수업 목표: ${lesson.lessonGoal}`,
      `평가기준: ${lesson.assessmentCriteria}`,
      `수집할 평가 근거: ${lesson.evidenceDescription}`,
    ].join(" ") : "",
    keyConcepts: extractKeyConcepts(lesson.materialText),
    vocabulary: [],
    possibleMisconceptions: [],
    questionSeeds: [lesson.startQuestion],
    sourceLimit: "교사가 입력한 수업자료의 범위를 구분해 답합니다.",
    safetyNotice: "학생 이름, 연락처, 주소 등 개인정보를 답에 반복하지 않습니다.",
  };
  const behavior = createDefaultQuestioningChatbotBehavior();
  const config: QuestioningChatbotConfig = {
    standard,
    targetGrade: lesson.grade,
    subjectUnit: `${lesson.subject} · ${lesson.lessonTitle}`,
    material,
    rubric: backwardDesignEnabled ? buildLiteRubric(lesson) : buildRubric(""),
    behavior,
    curriculumCompass: buildCurriculumCompass(standard),
    prdText: backwardDesignEnabled ? [
      `수업 목표: ${lesson.lessonGoal}`,
      `평가기준: ${lesson.assessmentCriteria}`,
      `수준 기준: 도달=${lesson.rubricHigh}; 성장 중=${lesson.rubricMeet}; 도움 필요=${lesson.rubricDeveloping}`,
    ].join("\n") : "",
    liveResearchEnabled: activityMode === "exploration",
    updatedAt: new Date().toISOString(),
  };
  return normalizeQuestioningChatbotConfig(config);
}

function liteEngineDescriptor(): LiteEngineDescriptor {
  return {
    family: QUESTIONING_ENGINE_FAMILY,
    sharedCore: true,
    providerAdapter: "teacher_openai",
    persistenceAdapter: "teacher_google_sheet",
  };
}

function litePlanDigest(input: NormalizedLiteEnginePlanInput) {
  return createHash("sha256")
    .update(JSON.stringify({ policyVersion: LITE_ENGINE_POLICY_VERSION, input }))
    .digest("base64url")
    .slice(0, 43);
}

function buildLiteObservation(
  result: ChatResult,
  input: NormalizedLiteEnginePlanInput,
  config: QuestioningChatbotConfig,
): LiteEngineObservation {
  const phaseMetadata = getQuestioningTurnMetadata({
    result,
    currentTurn: input.studentMessage,
    conversation: input.history,
    material: config.material,
    standard: config.standard,
    teacherMemo: config.material.questionFocusMemo,
  });
  const evidenceIds =
    result.sourceStatus === "supported" &&
    (phaseMetadata.relatedQuestion || phaseMetadata.responseScore !== null)
      ? [`lesson-material:${input.lesson.lessonId}:r${input.lesson.lessonRevision}:${input.lesson.sourceHash}`]
      : [];

  return {
    conversationPhase: result.conversationPhase || 1,
    primaryMove: result.primaryMove,
    engagementState: result.engagementState,
    curriculumRelation: result.curriculumRelation,
    supportLevel: result.supportLevel,
    sourceStatus: result.sourceStatus,
    sourceCue: result.sourceCue,
    questionType: result.questionType,
    safetyFlag: result.safetyFlag,
    isClosing: result.isClosing,
    rubricScores: result.rubricScores,
    ...(result.reachedDifficulty ? { reachedDifficulty: result.reachedDifficulty } : {}),
    moreToExploreQuestions: result.moreToExploreQuestions || [],
    managedKind: phaseMetadata.managedKind,
    relatedQuestion: phaseMetadata.relatedQuestion,
    responseScore: phaseMetadata.responseScore,
    evidenceIds,
  };
}

function liteReplyAdmitsMissingSource(reply: string) {
  return /(?:자료|글|기사).{0,40}(?:안\s*나오|나오지\s*않|없어요|없습니다|확인하기\s*어렵|알기\s*어렵|말하기\s*어렵|직접\s*답해\s*주지\s*않)/.test(reply);
}

function liteQuestionRequestsMissingDimension(question: string, materialText: string) {
  const compactMaterial = materialText.replace(/\s+/g, "").toLowerCase();
  const dimension = /(?:무슨|어떤)\s*(재료|성분|원료|가격|비용|장소|지역|나라|기관|날짜|시기|기간|수치|종류|색|크기|무게)/i
    .exec(question)?.[1]?.toLowerCase();
  if (dimension && !compactMaterial.includes(dimension)) return true;
  if (/무엇(?:으로|로)\s*만들/i.test(question)) {
    return !/(재료|성분|원료|만들)/.test(compactMaterial);
  }
  return false;
}

function liteMaterialDefinesVocabulary(reply: string, materialText: string) {
  const term = /‘([^’]{1,40})’/.exec(reply)?.[1]?.trim();
  if (!term) return false;
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const definition = new RegExp(
    `["'“”‘’]?${escapedTerm}["'“”‘’]?(?:은|는|이란|란)?[^.!?。？！\\n]{0,200}` +
    `(?:뜻(?:한다|합니다|하는|이다|입니다|이에요)|의미(?:한다|합니다|하는|이다|입니다|예요)|` +
    `말(?:한다|합니다|해요)|가리(?:킨다|킵니다|켜요))`,
  );
  const glossary = new RegExp(`["'“”‘’]?${escapedTerm}["'“”‘’]?\\s*[:：]\\s*[^\\n]{3,200}`);
  return definition.test(materialText) || glossary.test(materialText);
}

export function createLiteEnginePlan(value: unknown): LiteEnginePlan {
  const input = normalizeLiteEngineInput(value);
  const lesson = input.lesson;
  const config = createLiteQuestioningConfig(lesson, input.activityMode);
  const { result: planned } = runQuestioningLocalEngine({
    config,
    question: input.studentMessage,
    conversation: input.history,
  });
  const rawObservation = buildLiteObservation(planned, input, config);
  const replyAdmitsMissingSource =
    liteReplyAdmitsMissingSource(planned.studentReply) ||
    liteQuestionRequestsMissingDimension(input.studentMessage, lesson.materialText) ||
    rawObservation.sourceStatus === "source_insufficient";
  const unsupportedVocabulary =
    rawObservation.questionType === "vocabulary" &&
    rawObservation.sourceStatus === "supported" &&
    !liteMaterialDefinesVocabulary(planned.studentReply, lesson.materialText);
  const sourceCannotSupportAnswer = replyAdmitsMissingSource || unsupportedVocabulary;
  const observation: LiteEngineObservation = sourceCannotSupportAnswer
    ? {
        ...rawObservation,
        sourceStatus: replyAdmitsMissingSource ? "source_insufficient" : "reasonable_inference",
        sourceCue: "",
        evidenceIds: [],
      }
    : rawObservation;
  const managedQuestion = planned.expectsStudentReply ? lastQuestionFrom(planned.studentReply) : "";
  const verifiedSourceCue = observation.sourceCue?.trim() || "";
  const skipModel = Boolean(
    planned.safetyFlag || planned.isClosing || planned.primaryMove === "repair" ||
    observation.sourceStatus !== "supported" || !verifiedSourceCue ||
    (!observation.relatedQuestion && observation.responseScore === null)
  );
  const source = verifiedSourceCue || config.material.summary;
  const modeRule = input.activityMode === "evaluation"
    ? "평가모드입니다. 제공된 근거 문장만 고르고 자료 밖 사실은 만들지 마세요."
    : "탐색모드이지만 이 경량판의 개인 API는 제공된 근거 문장 선택에만 사용합니다.";
  const questionRule = managedQuestion
    ? `관리 질문은 중앙 엔진이 별도로 붙입니다. 참고할 질문: ${managedQuestion}`
    : "학생에게 새 질문을 만들지 마세요.";

  return {
    schemaVersion: LITE_ENGINE_SCHEMA_VERSION,
    requestId: input.requestId,
    policyVersion: LITE_ENGINE_POLICY_VERSION,
    planDigest: litePlanDigest(input),
    engine: liteEngineDescriptor(),
    skipModel,
    fallbackReply: planned.studentReply,
    modelRequest: {
      model: process.env.LITE_ENGINE_MODEL?.trim() || "gpt-5.6-terra",
      reasoningEffort: "low",
      maxOutputTokens: 220,
      outputContract: "lead_evidence_quote_v1",
      instructions: [
        `당신은 ${lesson.grade} 학생의 질문을 돕는 교실 챗봇입니다.`,
        "학생에게 보일 짧은 연결 문구 하나를 고르고, 답의 근거가 되는 문장을 관련 자료에서 글자 그대로 인용하세요.",
        "근거 문장은 새로 쓰거나 바꾸지 말고, 관련 자료에 연속해서 있는 문장 일부만 사용하세요.",
        modeRule,
        questionRule,
        "lead와 evidenceQuote 필드만 가진 JSON을 반환하세요.",
      ].join(" "),
      input: [
        `[수업명] ${lesson.lessonTitle}`,
        ...(input.activityMode === "evaluation" ? [`[수업 목표] ${lesson.lessonGoal}`] : []),
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
    observation,
  };
}

function enforceLiteQuestionContract(candidate: string, plan: LiteEnginePlan) {
  const fallback = plan.fallbackReply.trim();
  const managedQuestion = plan.enforcement.managedQuestion.trim();
  const answerOnly = withoutQuestionSentences(candidate) || withoutQuestionSentences(fallback);
  if (managedQuestion) return [answerOnly, managedQuestion].filter(Boolean).join(" ").trim();
  if (plan.enforcement.maximumQuestionCount === 0) {
    return answerOnly || fallback.replace(/[?？]/g, ".").trim();
  }
  let seen = false;
  return candidate.replace(/[?？]/g, () => {
    if (seen) return ".";
    seen = true;
    return "?";
  }).trim();
}

const LITE_ALLOWED_LEADS = [
  "좋은 질문이에요.",
  "궁금한 점을 잘 짚었어요.",
  "자료에서 함께 확인해 볼게요.",
  "차근차근 살펴볼게요.",
] as const;

function normalizeLiteQuote(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function supportedLiteEvidenceQuote(
  evidenceQuote: string,
  input: NormalizedLiteEnginePlanInput,
  plan: LiteEnginePlan,
) {
  const quote = normalizeLiteQuote(evidenceQuote);
  if (quote.length < 8 || quote.length > 500) return "";
  const material = normalizeLiteQuote(input.lesson.materialText);
  const plannedSource = normalizeLiteQuote(plan.observation.sourceCue);
  if (!plannedSource) return "";
  if (!material.includes(quote) || !plannedSource.includes(quote)) return "";
  return quote;
}

function candidateNeedsSafeFallback(candidate: string, input: NormalizedLiteEnginePlanInput) {
  const privateOrSecret = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}|\b\d{6}[-\s]?\d{7}\b|\bsk-[A-Za-z0-9_-]{16,})/i;
  const internalPolicy = /(?:\b(?:primaryMove|rubricScores|criterionKey|conversationPhase|managedKind|sourceStatus|safetyFlag)\b|평가\s*기준|성취\s*기준|루브릭\s*(?:점수|기준)|(?:^|\s)도달(?:입니다|이다|했|함|\s|[.!?,]|$)|성장\s*중|도움\s*필요)/i;
  if (privateOrSecret.test(candidate) || internalPolicy.test(candidate)) return true;
  if (!LITE_ALLOWED_LEADS.includes(candidate.trim() as (typeof LITE_ALLOWED_LEADS)[number])) return true;

  // 학생 발화나 이전 모델 답은 사실 근거로 승격하지 않고 교사 제공 본문만 대조한다.
  const source = input.lesson.materialText;
  const compactSource = source.replace(/\s+/g, "").toLowerCase();
  const numericClaims = candidate.match(/\d+(?:[.,]\d+)*(?:%|퍼센트|명|개|년|월|일|도)?/g) || [];
  if (numericClaims.some((claim) => !source.includes(claim))) return true;

  // 의료·법률·금전·위험 주장은 모드와 무관하게 본문에 같은 근거가 없으면 폐기한다.
  const highRiskTerms = candidate.match(
    /암|치료|완치|질병|약물|복용|사망|폭발|중독|범죄|불법|벌금|소송|투자|수익|손실|대출|이자/g,
  ) || [];
  if (highRiskTerms.some((term) => !compactSource.includes(term.toLowerCase()))) return true;

  return false;
}

/**
 * 교사 개인 API가 만든 문장을 다시 공통 엔진에 통과시킵니다.
 * API 키는 이 함수나 중앙 서버로 오지 않고, 생성된 문장만 검수합니다.
 */
export function finalizeLiteEngineReply(value: unknown): LiteEngineFinalizedResponse {
  if (typeof value !== "object" || value === null) throw new Error("최종 확인 요청 형식을 확인해 주세요.");
  const candidateReply = requiredText(
    (value as Record<string, unknown>).candidateReply,
    "개인 API 답변",
    3_000,
  );
  const candidateEvidenceQuote = optionalText(
    (value as Record<string, unknown>).candidateEvidenceQuote,
    500,
  );
  const input = normalizeLiteEngineInput(value);
  const plan = createLiteEnginePlan(value);
  const submittedPolicyVersion = requiredText(
    (value as Record<string, unknown>).policyVersion,
    "계획 정책 버전",
    120,
  );
  const submittedPlanDigest = requiredText(
    (value as Record<string, unknown>).planDigest,
    "계획 식별값",
    100,
  );
  if (submittedPolicyVersion !== plan.policyVersion || submittedPlanDigest !== plan.planDigest) {
    throw new Error("대화 계획이 바뀌었습니다. 최신 계획으로 다시 시도해 주세요.");
  }
  const evidenceQuote = supportedLiteEvidenceQuote(candidateEvidenceQuote, input, plan);
  if (plan.skipModel || !evidenceQuote || candidateNeedsSafeFallback(candidateReply, input)) {
    const studentReply = enforceLiteQuestionContract(plan.fallbackReply, plan);
    return {
      schemaVersion: 2,
      requestId: input.requestId,
      policyVersion: LITE_ENGINE_POLICY_VERSION,
      planDigest: plan.planDigest,
      engine: liteEngineDescriptor(),
      studentReply,
      expectsStudentReply: !plan.observation.isClosing && /[?？]/.test(studentReply),
      isClosing: plan.observation.isClosing,
      localFallback: true,
      observation: plan.observation,
    };
  }
  const safeQuote = evidenceQuote.replace(/[?？]/g, ".");
  const centralAnswer = withoutQuestionSentences(plan.fallbackReply);
  const groundedReply = [
    candidateReply.trim(),
    centralAnswer,
    `자료 근거는 “${safeQuote}”예요.`,
  ].filter(Boolean).join(" ");
  const studentReply = enforceLiteQuestionContract(groundedReply, plan);
  const finalizedObservation: LiteEngineObservation = {
    ...plan.observation,
    sourceStatus: "supported",
    sourceCue: evidenceQuote,
    evidenceIds: [
      `lesson-material:${input.lesson.lessonId}:r${input.lesson.lessonRevision}:${input.lesson.sourceHash}`,
    ],
  };

  return {
    schemaVersion: 2,
    requestId: input.requestId,
    policyVersion: LITE_ENGINE_POLICY_VERSION,
    planDigest: plan.planDigest,
    engine: liteEngineDescriptor(),
    studentReply,
    expectsStudentReply: !finalizedObservation.isClosing && /[?？]/.test(studentReply),
    isClosing: finalizedObservation.isClosing,
    localFallback: false,
    observation: finalizedObservation,
  };
}
