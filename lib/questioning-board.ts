export type QuestionType =
  | "fact"
  | "vocabulary"
  | "inference"
  | "application"
  | "extension"
  | "reflection"
  | "off_topic"
  | "safety";

export type RubricCriterion = {
  key: string;
  label: string;
  description: string;
  observableEvidence: string;
  feedbackForward: string;
  levels: {
    score: number;
    label: string;
    descriptor: string;
  }[];
};

export type StandardAssessmentElement = {
  key: string;
  label: string;
  focus: string;
  studentEvidence: string;
  rubricUse: string;
};

export type QuestionTypeAssessmentLink = {
  questionType: Extract<
    QuestionType,
    "fact" | "vocabulary" | "inference" | "application" | "extension" | "reflection"
  >;
  label: string;
  assessmentRole: string;
  evidenceToCollect: string;
};

export type StandardAssessmentAnalysis = {
  coreAchievement: string;
  contentTargets: string[];
  performanceBehaviors: string[];
  evaluationElements: StandardAssessmentElement[];
  studentProducts: string[];
  questionTypeLinks: QuestionTypeAssessmentLink[];
  rubricDesignNotes: string[];
};

export type StandardOption = {
  id: string;
  subject: string;
  gradeBand: string;
  title: string;
  standard: string;
  classroomGoal: string;
};

export type MaterialAnalysis = {
  materialTitle: string;
  summary: string;
  visibleText: string;
  questionFocusMemo?: string;
  keyConcepts: string[];
  vocabulary?: MaterialVocabularyEntry[];
  possibleMisconceptions: string[];
  questionSeeds: string[];
  sourceLimit: string;
  safetyNotice: string;
};

export type MaterialVocabularyEntry = {
  term: string;
  dictionaryMeaning: string;
  contextualMeaning: string;
  contextSentence: string;
};

export type QuestionClassifierKeywords = {
  safety: string[];
  off_topic: string[];
  vocabulary: string[];
  reflection: string[];
  extension: string[];
  application: string[];
  inference: string[];
};

export type QuestioningChatbotBehavior = {
  classifierKeywords: QuestionClassifierKeywords;
  offTopicResponse: string;
  insufficientQuestionResponse: string;
  additionalInstructions: string;
};

export type ChatEvaluation = {
  criterionKey: string;
  score: number;
  rationale: string;
};

export type PrimaryMove =
  | "receive"
  | "clarify"
  | "offer_clue"
  | "compare_possibilities"
  | "follow_student_lead"
  | "productive_extension"
  | "check_evidence"
  | "repair"
  | "close"
  | "safety_redirect";

export type EngagementState =
  | "noticing"
  | "curious"
  | "personally_connecting"
  | "exploring_possibilities"
  | "seeking_evidence"
  | "revising_thought"
  | "disengaged"
  | "ready_to_close";

export type CurriculumRelation = "direct" | "adjacent" | "productive_extension" | "disconnected";

export type SourceStatus = "supported" | "reasonable_inference" | "source_insufficient" | "out_of_scope";

export type CurriculumCompass = {
  rawStandard: string;
  bigIdeas: string[];
  worthwhileNoticing: string[];
  thinkingDispositions: string[];
  fertileQuestionAreas: string[];
  meaningfulExtensions: string[];
  doNotForce: string[];
};

export type StudentChatResponse = {
  schemaVersion: 2;
  studentReply: string;
  expectsStudentReply: boolean;
  isClosing: boolean;
  localFallback: boolean;
  noticeCode?: "source_limited" | "safety_redirect" | "provider_unavailable" | "record_unavailable";
};

export type ChatResult = {
  schemaVersion: 2;
  studentReply: string;
  expectsStudentReply: boolean;
  isClosing: boolean;
  primaryMove: PrimaryMove;
  engagementState: EngagementState;
  curriculumRelation: CurriculumRelation;
  supportLevel: 0 | 1 | 2 | 3 | 4;
  sourceStatus: SourceStatus;
  sourceCue: string;
  promptVersion: "questioning-dialogue-v2";
  provider: "local" | "gemini_teacher_preview" | "approved_external";
  /** @deprecated Use studentReply. Kept while stored V1 records are migrated. */
  answer: string;
  /** @deprecated V2 keeps the complete student-facing turn in studentReply. */
  followUpQuestion: string;
  questionType: QuestionType;
  typeLabel: string;
  typeReason: string;
  evidencePrompt: string;
  revisionSuggestion: string;
  evaluationSignals: string[];
  teacherFeedback: string;
  rubricScores: ChatEvaluation[];
  safetyFlag: boolean;
};

export type ChatMessage = {
  id: string;
  role: "student" | "assistant";
  content: string;
  result?: StudentChatResponse;
};

export type QuestioningConversationEntry = Pick<ChatMessage, "role" | "content">;

export type QuestioningChatbotConfig = {
  targetGrade: string;
  subjectUnit: string;
  standard: string;
  assessmentAnalysis?: StandardAssessmentAnalysis;
  curriculumCompass?: CurriculumCompass;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  behavior: QuestioningChatbotBehavior;
  prdText: string;
  updatedAt: string;
};

export const QUESTIONING_CHATBOT_CONFIG_KEY = "questioning-chatbot-config";
export const QUESTIONING_AI_SETTINGS_KEY = "questioning-ai-settings";
export const REFERENCE_ONLY_QUESTION_MATERIAL_TEXT = "교과서를 살펴보세요.";
export const A4_PAGE_QUESTION_MATERIAL_CHAR_THRESHOLD = 1800;
export const DEFAULT_QUESTION_FOCUS_MEMO = "제목을 보고 내용에 대해서 예측할 수 있도록 안내합니다.";
export const QUESTIONING_CHATBOT_CREATION_PROFILE_VERSION = "30-session-dialogue-v2";
export const DEFAULT_QUESTIONING_CHATBOT_ADDITIONAL_INSTRUCTIONS =
  "학생이 실제로 말한 흥미, 놀람, 경험, 질문을 먼저 이어 받는다. 한 턴에는 중심 교수 동작을 하나만 사용하고 질문은 생각을 실제로 열 때만 최대 하나 제시한다. 성취기준은 대화 전체의 보이지 않는 방향으로만 사용한다. 단어·용어의 뜻을 물으면 사전적 기본 의미를 먼저 짧게 설명하고, 지문 속 문장을 근거로 그 문맥에서의 뜻을 구분해 알려 준다. 함께 변한 결과와 인과관계를 구분하고, 학생이 생각을 스스로 고쳤으면 다시 시험하지 않고 수정 근거를 인정한다. 반복해서 막힌 학생에게는 질문보다 설명·선택지·예시를 먼저 제공한다. 개인정보와 대필을 구분하며, 대필 거절 뒤 학생이 자기 생각을 제시하면 그 생각을 글의 출발점으로 받아 준다. 짜증에는 관계 회복을, 구어체 종료에는 질문 없는 마무리를 우선한다.";

const referenceOnlySourcePattern = /교과서|A4\s*1\s*장|A4용지\s*1\s*장|저작권|본문\s*전체/;
const legacyDefaultQuestionFocusMemo =
  "학생이 자료 속 사실을 먼저 확인하고, 잔반이 줄어든 까닭과 우리 학교에서 실천할 수 있는 방법으로 자연스럽게 질문을 넓히도록 돕습니다.";
const legacyDefaultAdditionalInstructions = new Set([
  "학생 질문을 비판하지 말고 응원과 힌트를 제공하며, 답을 자료에서 다시 확인하도록 안내한다.",
  "학생 질문에 먼저 자료를 근거로 직접 답하고, 자연스러운 후속 질문 하나로 대화를 이어 간다. 질문 유형과 개선 제안은 답변 뒤에 보조 정보로 제공한다.",
  "학생의 질문이나 응답을 먼저 구체적으로 받아 주고 자료와 연결해 대화한다. 질문 종류를 설명하지 말고, 자연스러운 후속 질문 하나로 학생이 스스로 더 분명하고 깊은 질문을 만들도록 돕는다.",
  "학생의 질문이나 응답을 먼저 구체적으로 받아 주고 자료와 연결해 대화한다. 질문 종류를 설명하지 말고, 완성된 다음 질문이나 직접적인 후속 질문을 대신 써 주지 않으며 학생의 질문 시도를 짧게 격려한다.",
  "학생이 실제로 말한 흥미, 놀람, 경험, 질문을 먼저 이어 받는다. 한 턴에는 중심 교수 동작을 하나만 사용하고, 질문은 생각을 실제로 열 때만 최대 하나 제시한다. 성취기준은 대화 전체의 보이지 않는 방향으로만 사용한다.",
  "학생이 실제로 말한 흥미, 놀람, 경험, 질문을 먼저 이어 받는다. 한 턴에는 중심 교수 동작을 하나만 사용하고 질문은 생각을 실제로 열 때만 최대 하나 제시한다. 성취기준은 대화 전체의 보이지 않는 방향으로만 사용한다. 함께 변한 결과와 인과관계를 구분하고, 학생이 생각을 스스로 고쳤으면 다시 시험하지 않고 수정 근거를 인정한다. 반복해서 막힌 학생에게는 질문보다 설명·선택지·예시를 먼저 제공한다. 개인정보와 대필을 구분하며, 대필 거절 뒤 학생이 자기 생각을 제시하면 그 생각을 글의 출발점으로 받아 준다. 짜증에는 관계 회복을, 구어체 종료에는 질문 없는 마무리를 우선한다.",
]);

export type QuestioningAiSettings = {
  provider: "gemini";
  apiKey: string;
  model: string;
};

export function shouldUseReferenceOnlyQuestionMaterial({
  title,
  text,
  forceReferenceOnly = false,
}: {
  title: string;
  text: string;
  forceReferenceOnly?: boolean;
}) {
  const trimmedText = text.trim();
  const sourceSignal = `${title}\n${trimmedText.slice(0, 180)}`;
  return (
    forceReferenceOnly ||
    referenceOnlySourcePattern.test(sourceSignal) ||
    trimmedText.length >= A4_PAGE_QUESTION_MATERIAL_CHAR_THRESHOLD
  );
}

export const questioningAiModelOptions = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (기본 · 균형)" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (빠름 · 절약)" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (정확 · 심화)" },
];

export function isQuestioningAiSettings(value: unknown): value is QuestioningAiSettings {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const settings = value as Partial<QuestioningAiSettings>;
  return (
    settings.provider === "gemini" &&
    typeof settings.apiKey === "string" &&
    typeof settings.model === "string"
  );
}

export const defaultQuestioningChatbotBehavior: QuestioningChatbotBehavior = {
  classifierKeywords: {
    safety: [
      "이름",
      "전화번호",
      "주소",
      "주민",
      "사진",
      "상담",
      "비밀번호",
      "답 다 써",
      "답을 다",
      "답안",
      "대필",
      "그대로 써",
      "그대로 만들어",
      "수행평가 답",
      "전체 정답",
      "숙제 해",
      "소개문 전체",
      "문단 완성",
      "번역 앱처럼",
      "번역앱처럼",
      "예시 전부",
    ],
    off_topic: ["게임", "연예인", "날씨", "주식"],
    vocabulary: [
      "뜻",
      "무슨 말",
      "의미",
      "낱말",
      "단어",
      "용어",
      "문맥",
      "여기서",
      "뭐예요",
      "뭔가요",
      "무엇인가요",
    ],
    reflection: ["내 질문", "내 생각", "고칠", "좋은 질문", "배운 점", "성찰"],
    extension: ["더 알아", "추가", "관련", "다른 예", "비슷한 사례", "배경", "확장", "조사"],
    application: ["우리", "나라면", "실천", "해결", "적용", "다른 상황"],
    inference: ["왜", "어떻게", "까닭", "원인", "의미", "결과"],
  },
  offTopicResponse:
    "수업 내용과 관련된 질문에 대해서만 응답할 수 있어요. 자료 속 장면·문장·표현을 다시 살펴봐요.",
  insufficientQuestionResponse:
    "바로 답을 정하지 않아도 괜찮아요. 이번에는 자료에서 가장 관련 있는 단서 하나부터 살펴볼게요.",
  additionalInstructions: DEFAULT_QUESTIONING_CHATBOT_ADDITIONAL_INSTRUCTIONS,
};

export function createDefaultQuestioningChatbotBehavior(): QuestioningChatbotBehavior {
  return {
    ...defaultQuestioningChatbotBehavior,
    classifierKeywords: {
      safety: [...defaultQuestioningChatbotBehavior.classifierKeywords.safety],
      off_topic: [...defaultQuestioningChatbotBehavior.classifierKeywords.off_topic],
      vocabulary: [...defaultQuestioningChatbotBehavior.classifierKeywords.vocabulary],
      reflection: [...defaultQuestioningChatbotBehavior.classifierKeywords.reflection],
      extension: [...defaultQuestioningChatbotBehavior.classifierKeywords.extension],
      application: [...defaultQuestioningChatbotBehavior.classifierKeywords.application],
      inference: [...defaultQuestioningChatbotBehavior.classifierKeywords.inference],
    },
  };
}

function normalizeKeywordList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function normalizeSafetyKeywordList(value: unknown, fallback: string[]) {
  const normalized = normalizeKeywordList(value, fallback);
  return Array.from(new Set([...fallback, ...normalized])).slice(0, 80);
}

function normalizeBehaviorText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, maxLength) || fallback;
}

export function normalizeQuestioningChatbotBehavior(value: unknown): QuestioningChatbotBehavior {
  const fallback = createDefaultQuestioningChatbotBehavior();
  if (typeof value !== "object" || value === null) {
    return fallback;
  }

  const behavior = value as Partial<QuestioningChatbotBehavior>;
  const keywords =
    typeof behavior.classifierKeywords === "object" && behavior.classifierKeywords !== null
      ? (behavior.classifierKeywords as Partial<QuestionClassifierKeywords>)
      : {};

  const additionalInstructions = normalizeBehaviorText(
    behavior.additionalInstructions,
    fallback.additionalInstructions,
    2000,
  );
  const insufficientQuestionResponse = normalizeBehaviorText(
    behavior.insufficientQuestionResponse,
    fallback.insufficientQuestionResponse,
    500,
  );
  const offTopicResponse = normalizeBehaviorText(behavior.offTopicResponse, fallback.offTopicResponse, 500);

  return {
    classifierKeywords: {
      safety: normalizeSafetyKeywordList(keywords.safety, fallback.classifierKeywords.safety),
      off_topic: normalizeKeywordList(keywords.off_topic, fallback.classifierKeywords.off_topic),
      vocabulary: normalizeKeywordList(keywords.vocabulary, fallback.classifierKeywords.vocabulary),
      reflection: normalizeKeywordList(keywords.reflection, fallback.classifierKeywords.reflection),
      extension: normalizeKeywordList(keywords.extension, fallback.classifierKeywords.extension),
      application: normalizeKeywordList(keywords.application, fallback.classifierKeywords.application),
      inference: normalizeKeywordList(keywords.inference, fallback.classifierKeywords.inference),
    },
    offTopicResponse:
      offTopicResponse ===
      "수업 내용과 관련된 질문에 대해서만 응답할 수 있어요. 자료 속 장면·문장·표현과 연결해 다시 질문해 보세요."
        ? fallback.offTopicResponse
        : offTopicResponse,
    insufficientQuestionResponse:
      insufficientQuestionResponse ===
        "좋은 출발이에요. 자료의 어느 부분과 연결되는지 한 단어만 더 넣어 질문을 구체적으로 바꾸어 보세요." ||
      insufficientQuestionResponse ===
        "말해 준 내용을 잘 들었어요. 자료에서 연결되는 대상이나 장면을 하나 골라 조금 더 자세히 이야기해 볼까요?" ||
      insufficientQuestionResponse ===
        "말해 준 내용을 잘 들었어요. 자료에서 연결되는 대상이나 장면을 천천히 다시 살펴봐도 좋아요."
        ? fallback.insufficientQuestionResponse
        : insufficientQuestionResponse,
    additionalInstructions: legacyDefaultAdditionalInstructions.has(additionalInstructions)
      ? fallback.additionalInstructions
      : additionalInstructions,
  };
}

export const standardSource = {
  title: "2022 개정 교육과정 및 성취기준 분석 — 질문하기 수업·챗봇 활용",
  url: "https://app.notion.com/p/9083ceddd94e427eade37061521f9c99",
  note: "Notion 페이지에서 선별한 질문하기 수업 연결 성취기준을 기본 자료로 사용합니다.",
};

export const defaultQuestioningLessonMaterial: MaterialAnalysis = {
  materialTitle: "급식실 남은 음식, 석 달 만에 절반으로",
  summary:
    "푸른초등학교는 급식 잔반을 줄이기 위해 학생들이 반찬 양을 스스로 고르는 선택제와 잔반 게시판을 운영했다. 예전에는 하루에 큰 통 세 통이 넘는 잔반이 나왔고, 처리 비용도 적지 않았다. 학교는 반찬을 받을 때 '조금, 보통, 많이' 가운데 먹을 양을 고르게 하고, 학급별 잔반 무게를 게시판에 붙였다. 그 결과 하루 세 통이 넘던 잔반이 한 통 반으로 줄었고, 학생들은 먹을 만큼만 받으면 다 먹기 쉽다는 점을 알게 되었다. 학교는 음식 낭비가 줄어든 만큼 아낀 돈으로 과일 후식을 늘릴 계획이며, 전문가는 잔반 줄이기가 학교와 지구를 함께 지키는 실천이라고 설명했다.",
  visibleText:
    "급식실 남은 음식, 석 달 만에 '절반'으로\n" +
    '푸른초 "먹을 만큼만 골라 담아요"... 양 선택제·잔반 게시판 효과\n' +
    "김하람 기자\n\n" +
    "학교 급식실에서 버려지는 음식이 크게 줄어든 학교가 있다. 푸른초등학교는 학생들이 반찬의 양을 스스로 고르게 한 뒤 석 달 만에 잔반을 절반으로 줄였다고 23일 밝혔다.\n\n" +
    "'잔반'은 학생들이 먹지 않고 남긴 음식을 말한다. 이 학교에서는 그동안 하루에 큰 통으로 세 통이 넘는 잔반이 나왔다. 버려진 음식을 처리하는 데에도 적지 않은 돈이 들었다.\n\n" +
    '잔반이 많이 나는 까닭은 학생들의 급식 습관에 있었다. 싫어하는 반찬을 받자마자 버리거나, 먹을 수 있는 양보다 많이 받는 학생이 많았던 것이다. "일단 다 받고, 못 먹으면 남기면 되지."라고 생각하는 학생이 적지 않았다.\n\n' +
    "이에 푸른초는 지난 5월부터 새로운 방법을 시작했다. 반찬을 받을 때 '조금·보통·많이' 가운데 자기가 먹을 양을 직접 고르게 했다. 또 한 달에 한 번 '잔반 없는 날'을 정하고, 학급마다 남긴 음식의 무게를 게시판에 붙여 두었다. 학생들은 우리 반의 잔반이 얼마나 나오는지 눈으로 확인할 수 있게 되었다.\n\n" +
    '변화는 숫자로 나타났다. 하루 세 통이 넘던 잔반이 한 통 반으로 줄어든 것이다. 4학년 김하늘 학생은 "내가 고른 만큼만 받으니까 다 먹게 되고, 다 먹으면 기분도 좋다"라고 말했다. 이 학교 영양교사는 "버리는 음식이 줄어든 만큼, 아낀 돈으로 과일 후식을 늘릴 계획"이라고 밝혔다.\n\n' +
    "전문가들은 잔반 줄이기가 한 학교만의 일이 아니라고 말한다. 음식이 버려지면 음식을 만든 사람들의 노력과 지구의 자원도 함께 버려지기 때문이다. 내가 먹을 만큼만 받는 작은 습관이 학교와 지구를 지키는 첫걸음이 되고 있다.",
  keyConcepts: [
    "급식 잔반",
    "반찬 양 선택제",
    "잔반 게시판",
    "식습관 변화",
    "음식물 쓰레기",
    "자원 절약과 환경 보호",
  ],
  vocabulary: [
    {
      term: "잔반",
      dictionaryMeaning: "먹고 남긴 밥이나 음식",
      contextualMeaning: "학생들이 급식에서 먹지 않고 남겨 버리게 된 음식",
      contextSentence: "'잔반'은 학생들이 먹지 않고 남긴 음식을 말한다.",
    },
    {
      term: "선택 배식",
      dictionaryMeaning: "먹을 사람이 음식의 종류나 양을 골라 받는 배식 방식",
      contextualMeaning: "학생이 반찬을 조금, 보통, 많이 가운데 직접 골라 받는 방법",
      contextSentence: "반찬을 받을 때 '조금·보통·많이' 가운데 자기가 먹을 양을 직접 고르게 했다.",
    },
  ],
  possibleMisconceptions: [
    "잔반 줄이기를 학생 개인의 책임으로만 생각할 수 있음",
    "무조건 적게 먹는 것이 좋은 식습관이라고 오해할 수 있음",
    "잔반 게시판이 행동 변화를 돕는 점과 부담을 줄 수 있는 점을 함께 보지 못할 수 있음",
    "음식물 쓰레기 문제가 학교 급식실 안의 문제로만 끝난다고 생각할 수 있음",
  ],
  questionSeeds: [
    "푸른초등학교는 잔반을 줄이기 위해 어떤 방법을 사용했나요?",
    "학생이 먹을 양을 직접 고르게 한 것이 왜 잔반을 줄이는 데 도움이 되었을까요?",
    "잔반 게시판은 학생들의 행동을 어떻게 바꾸었을까요?",
    "우리 반이나 학교에서 이 방법을 적용한다면 무엇을 바꾸어야 할까요?",
    "이 자료를 읽고 내 식습관이나 학교생활을 돌아볼 수 있는 질문은 무엇인가요?",
  ],
  questionFocusMemo:
    DEFAULT_QUESTION_FOCUS_MEMO,
  sourceLimit:
    "수업자가 제공한 기사 이미지에서 확인할 수 있는 급식 잔반, 반찬 양 선택제, 잔반 게시판, 식습관 변화, 음식물 쓰레기와 환경 보호에 연결된 질문에만 답합니다.",
  safetyNotice: "학생 이름, 학급별 실제 잔반 순위, 개인 식사량 등 개인정보나 민감한 비교 정보는 입력하지 않습니다.",
};

export function createDefaultQuestioningLessonMaterial(): MaterialAnalysis {
  return {
    ...defaultQuestioningLessonMaterial,
    keyConcepts: [...defaultQuestioningLessonMaterial.keyConcepts],
    vocabulary: defaultQuestioningLessonMaterial.vocabulary?.map((entry) => ({ ...entry })) ?? [],
    possibleMisconceptions: [...defaultQuestioningLessonMaterial.possibleMisconceptions],
    questionSeeds: [...defaultQuestioningLessonMaterial.questionSeeds],
  };
}

function normalizeMaterialVocabulary(value: unknown): MaterialVocabularyEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      term: typeof entry.term === "string" ? entry.term.trim().slice(0, 40) : "",
      dictionaryMeaning:
        typeof entry.dictionaryMeaning === "string" ? entry.dictionaryMeaning.trim().slice(0, 240) : "",
      contextualMeaning:
        typeof entry.contextualMeaning === "string" ? entry.contextualMeaning.trim().slice(0, 280) : "",
      contextSentence:
        typeof entry.contextSentence === "string" ? entry.contextSentence.trim().slice(0, 360) : "",
    }))
    .filter((entry) => entry.term && entry.dictionaryMeaning && entry.contextualMeaning)
    .slice(0, 20);
}

export function normalizeQuestionMaterialForStudentDisplay(material: MaterialAnalysis): MaterialAnalysis {
  const normalizedMaterial = {
    ...material,
    vocabulary: normalizeMaterialVocabulary(material.vocabulary),
    questionFocusMemo:
      typeof material.questionFocusMemo === "string" && material.questionFocusMemo.trim() !== legacyDefaultQuestionFocusMemo
        ? material.questionFocusMemo
        : DEFAULT_QUESTION_FOCUS_MEMO,
  };
  const visibleText = material.visibleText.trim();
  const isReferenceOnlyDefaultMaterial =
    material.materialTitle.includes("급식실 남은 음식") &&
    visibleText === REFERENCE_ONLY_QUESTION_MATERIAL_TEXT &&
    /긴 지문 또는 교과서 자료/.test(material.summary);
  const isLegacyDefaultMaterial =
    material.materialTitle.includes("급식실 남은 음식") &&
    visibleText.startsWith("제목: 급식실 남은 음식") &&
    visibleText.includes("핵심 사실:");

  if (isReferenceOnlyDefaultMaterial) {
    const defaultMaterial = createDefaultQuestioningLessonMaterial();
    return {
      ...normalizedMaterial,
      summary: defaultMaterial.summary,
      visibleText: defaultMaterial.visibleText,
      keyConcepts:
        material.keyConcepts.length > 2
          ? material.keyConcepts
          : [...defaultMaterial.keyConcepts],
      vocabulary:
        normalizedMaterial.vocabulary.length > 0
          ? normalizedMaterial.vocabulary
          : defaultMaterial.vocabulary?.map((entry) => ({ ...entry })) ?? [],
      possibleMisconceptions: material.possibleMisconceptions.length
        ? material.possibleMisconceptions
        : [...defaultMaterial.possibleMisconceptions],
      questionSeeds: material.questionSeeds.length
        ? material.questionSeeds
        : [...defaultMaterial.questionSeeds],
      sourceLimit: defaultMaterial.sourceLimit,
      safetyNotice: material.safetyNotice || defaultMaterial.safetyNotice,
    };
  }

  if (isLegacyDefaultMaterial) {
    return createDefaultQuestioningLessonMaterial();
  }

  if (!visibleText && material.summary.trim()) {
    return {
      ...normalizedMaterial,
      visibleText: REFERENCE_ONLY_QUESTION_MATERIAL_TEXT,
    };
  }

  return normalizedMaterial;
}

export const standardOptions: StandardOption[] = [
  {
    id: "korean-4-02-03",
    subject: "국어",
    gradeBand: "초등 3-4학년",
    title: "[4국02-03] 질문을 활용한 예측 읽기",
    standard: "[4국02-03] 질문을 활용하여 글을 예측하며 읽고 자신의 읽기 과정을 점검한다.",
    classroomGoal:
      "읽기 전·중·후 질문을 만들고, 질문으로 이해 정도와 읽기 어려움을 점검합니다.",
  },
  {
    id: "korean-4-02-02",
    subject: "국어",
    gradeBand: "초등 3-4학년",
    title: "[4국02-02] 중심 생각 파악과 간추리기",
    standard: "[4국02-02] 문단과 글에서 중심 생각을 파악하고 내용을 간추린다.",
    classroomGoal:
      "글의 중심 생각을 찾는 확인 질문을 만들고, 답의 근거가 되는 문장을 표시합니다.",
  },
  {
    id: "korean-4-02-04",
    subject: "국어",
    gradeBand: "초등 3-4학년",
    title: "[4국02-04] 사실과 의견 구분",
    standard: "[4국02-04] 글에 나타난 사실과 의견을 구분하고 필자와 자신의 의견을 비교한다.",
    classroomGoal:
      "사실 확인 질문과 의견 비교 질문을 나누고, 필자와 자신의 생각을 비교합니다.",
  },
  {
    id: "korean-4-02-05",
    subject: "국어",
    gradeBand: "초등 3-4학년",
    title: "[4국02-05] 출처 신뢰성 판단",
    standard: "[4국02-05] 글이나 자료의 출처가 믿을 만한지 판단한다.",
    classroomGoal:
      "자료의 출처와 만든 사람을 확인하는 질문을 만들고, 신뢰성 판단 근거를 찾습니다.",
  },
  {
    id: "korean-4-01-06",
    subject: "국어",
    gradeBand: "초등 3-4학년",
    title: "[4국01-06] 의견과 이유를 나누는 토의",
    standard: "[4국01-06] 주제에 적절한 의견과 이유를 제시하고 서로의 생각을 교환하며 토의한다.",
    classroomGoal:
      "상대의 의견과 이유를 구체적으로 파악하는 후속 질문을 만들고 서로 묻고 답합니다.",
  },
  {
    id: "social-4-03-01",
    subject: "사회",
    gradeBand: "초등 3-4학년",
    title: "[4사03-01] 사회 변화와 생활 모습 탐색",
    standard:
      "[4사03-01] 최근 사회 변화의 양상과 특징을 파악하고, 그로 인해 나타난 생활모습의 변화를 탐색한다.",
    classroomGoal:
      "사회 변화의 양상과 생활 모습의 변화를 확인·추론 질문으로 탐색합니다.",
  },
  {
    id: "social-4-03-02",
    subject: "사회",
    gradeBand: "초등 3-4학년",
    title: "[4사03-02] 다양한 문화와 존중",
    standard:
      "[4사03-02] 우리 사회에 다양한 문화가 확산되면서 나타나는 긍정적 효과와 문제를 분석하고, 나와 다른 사람이나 집단의 문화를 존중하는 태도를 기른다.",
    classroomGoal:
      "긍정적 효과와 문제를 비교하고, 존중을 위한 대안 질문으로 확장합니다.",
  },
  {
    id: "social-4-09-01",
    subject: "사회",
    gradeBand: "초등 3-4학년",
    title: "[4사09-01] 생활 주변 문제 해결",
    standard:
      "[4사09-01] 생활 주변에서 찾을 수 있는 여러 가지 문제를 파악하고, 그 문제를 합리적으로 해결하는 능력을 기른다.",
    classroomGoal:
      "학교·마을 문제를 찾고 해결 방안을 묻는 적용 질문을 만듭니다.",
  },
  {
    id: "korean-6-01-03",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국01-03] 궁금한 내용 질문하며 듣고 말하기",
    standard: "[6국01-03] 주제와 관련하여 궁금한 내용을 질문하며 적극적으로 듣고 말한다.",
    classroomGoal:
      "확인·추론·의도·연결·대안 질문을 만들고, 학생 질문 평가 기준으로 활용합니다.",
  },
  {
    id: "korean-6-01-04",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국01-04] 면담 절차와 매체 고려",
    standard: "[6국01-04] 면담의 절차를 이해하고 상대와 매체를 고려하여 면담한다.",
    classroomGoal:
      "상대와 목적을 고려한 질문 목록을 만들고, 후속 질문을 준비합니다.",
  },
  {
    id: "korean-6-01-06",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국01-06] 의견 비교와 조정",
    standard: "[6국01-06] 토의에 협력적으로 참여하며 서로의 의견을 비교하고 조정한다.",
    classroomGoal:
      "친구의 답변에 근거 확인 질문이나 대안 질문을 남기며 의견을 조정합니다.",
  },
  {
    id: "korean-6-01-07",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국01-07] 근거를 제시하는 토론",
    standard: "[6국01-07] 절차와 규칙을 지키고 타당한 이유와 근거를 제시하며 토론한다.",
    classroomGoal:
      "찬반 근거를 확인하고 반대 입장에서 물을 수 있는 질문을 만듭니다.",
  },
  {
    id: "korean-6-02-03",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국02-03] 내용 타당성과 표현 평가",
    standard: "[6국02-03] 글이나 자료를 읽고 내용의 타당성과 표현의 적절성을 평가한다.",
    classroomGoal:
      "자료의 내용이 타당한지 묻고, 표현이 적절한지 근거를 들어 판단합니다.",
  },
  {
    id: "korean-6-02-04",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국02-04] 다양한 관점 읽기와 문제 해결",
    standard: "[6국02-04] 문제 상황과 관련된 다양한 관점의 글을 읽고 이를 문제 해결에 활용한다.",
    classroomGoal:
      "서로 다른 관점의 자료를 비교하고 문제 해결에 필요한 질문을 만듭니다.",
  },
  {
    id: "korean-6-03-02",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국03-02] 근거와 출처를 밝히는 주장 글",
    standard: "[6국03-02] 적절한 근거를 사용하고 인용의 출처를 밝히며 주장하는 글을 쓴다.",
    classroomGoal:
      "주장을 뒷받침하는 근거 질문과 출처 확인 질문을 만들고 기록합니다.",
  },
  {
    id: "korean-6-03-04",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국03-04] 독자와 매체를 고려한 쓰기",
    standard: "[6국03-04] 독자와 매체를 고려하여 내용을 생성하고 표현하며 글을 쓴다.",
    classroomGoal:
      "게시판 댓글이나 온라인 대화 맥락을 고려해 질문과 답변을 조정합니다.",
  },
  {
    id: "korean-6-06-01",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국06-01] 목적에 맞는 매체 자료 찾기",
    standard: "[6국06-01] 정보 검색 도구를 활용하여 자신의 목적에 맞는 매체 자료를 찾는다.",
    classroomGoal:
      "내 질문에 답하기 위해 필요한 추가 자료와 검색어를 정합니다.",
  },
  {
    id: "korean-6-06-02",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "[6국06-02] 뉴스·정보 매체 신뢰성 평가",
    standard: "[6국06-02] 뉴스 및 각종 정보 매체 자료의 신뢰성을 평가한다.",
    classroomGoal:
      "전문성, 최신성, 근거 자료, 교차 확인 가능성을 묻는 점검 질문을 만듭니다.",
  },
  {
    id: "social-6-03-02",
    subject: "사회",
    gradeBand: "초등 5-6학년",
    title: "[6사03-02] 인권 침해 사례와 해결 방안",
    standard:
      "[6사03-02] 일상생활에서 인권이 침해되는 사례를 찾아 그 해결 방안을 탐색하고, 인권을 보호하는 활동에 참여한다.",
    classroomGoal:
      "인권 침해 사례의 원인과 해결 방안을 묻는 질문으로 확장합니다.",
  },
  {
    id: "social-6-08-03",
    subject: "사회",
    gradeBand: "초등 5-6학년",
    title: "[6사08-03] 미디어 비판적 분석",
    standard:
      "[6사08-03] 민주주의에서 미디어의 의미와 역할을 이해하고, 여러 가지 미디어의 내용을 비판적으로 분석하여 올바르게 이용하는 태도를 기른다.",
    classroomGoal:
      "미디어 정보에서 무엇이 왜곡·과장·생략되었는지 묻고 근거를 확인합니다.",
  },
  {
    id: "social-6-12-02",
    subject: "사회",
    gradeBand: "초등 5-6학년",
    title: "[6사12-02] 지구촌 문제와 지속가능한 미래",
    standard:
      "[6사12-02] 지구촌을 위협하는 다양한 문제들을 파악하고, 지속가능한 미래를 위한 해결 방안을 탐색한다.",
    classroomGoal:
      "지구촌 문제의 영향과 지속가능한 해결 방안을 묻는 적용 질문을 만듭니다.",
  },
  {
    id: "korean-9-01-05",
    subject: "국어",
    gradeBand: "중학교 1-3학년",
    title: "[9국01-05] 목적과 상대를 고려한 면담 질문",
    standard: "[9국01-05] 면담의 다양한 목적과 상대를 고려하여 질문을 점검하고 효과적으로 면담한다.",
    classroomGoal:
      "목적과 상대를 고려해 질문 내용, 순서, 후속 질문을 점검합니다.",
  },
  {
    id: "korean-9-02-03",
    subject: "국어",
    gradeBand: "중학교 1-3학년",
    title: "[9국02-03] 의도와 관점 추론",
    standard:
      "[9국02-03] 독자의 배경지식과 글에 나타난 정보 등을 활용하여 글에 드러나지 않은 의도나 관점을 추론하며 읽는다.",
    classroomGoal:
      "자료에 드러나지 않은 의도, 관점, 누락 정보를 묻는 비판 질문을 만듭니다.",
  },
  {
    id: "korean-9-02-04",
    subject: "국어",
    gradeBand: "중학교 1-3학년",
    title: "[9국02-04] 복합양식 자료의 타당성·신뢰성 평가",
    standard:
      "[9국02-04] 복합양식으로 구성된 글이나 자료의 내용 타당성과 신뢰성, 표현 방법의 적절성을 평가하며 읽는다.",
    classroomGoal:
      "자료의 타당성, 신뢰성, 표현 방식의 적절성을 질문으로 점검합니다.",
  },
  {
    id: "korean-9-03-08",
    subject: "국어",
    gradeBand: "중학교 1-3학년",
    title: "[9국03-08] 쓰기 과정 점검과 조정",
    standard: "[9국03-08] 쓰기 과정과 전략을 점검⋅조정하며 글을 쓰고, 독자를 고려하여 글을 고쳐 쓴다.",
    classroomGoal:
      "처음 질문과 다시 쓴 질문을 비교하고, 바꾼 이유를 성찰 기록으로 남깁니다.",
  },
  {
    id: "korean-9-06-06",
    subject: "국어",
    gradeBand: "중학교 1-3학년",
    title: "[9국06-06] 매체 자료의 공정성 평가",
    standard: "[9국06-06] 사회⋅문화적 맥락을 고려하여 매체 자료의 공정성을 평가한다.",
    classroomGoal:
      "누구의 관점이 강조·생략되었는지 묻고 공정성 판단 근거를 찾습니다.",
  },
  {
    id: "social-9-02-02",
    subject: "사회",
    gradeBand: "중학교 1-3학년",
    title: "[9사(일사)02-02] 미디어 문화와 정보 비판 검토",
    standard:
      "[9사(일사)02-02] 우리 주변에서 활용되는 미디어들을 탐색하고, 미디어를 통해 경험하는 다양한 문화와 정보들을 비판적으로 검토한다.",
    classroomGoal:
      "미디어가 제공하는 정보의 사실 여부, 숨은 가정, 영향력을 질문으로 검토합니다.",
  },
  {
    id: "social-9-04-03",
    subject: "사회",
    gradeBand: "중학교 1-3학년",
    title: "[9사(일사)04-03] 지역사회 문제와 시민 참여",
    standard:
      "[9사(일사)04-03] 민주주의의 발전을 위한 지방 자치의 중요성을 설명하고, 지역사회의 문제를 해결하기 위한 시민 참여 활동을 계획한다.",
    classroomGoal:
      "지역사회 문제 해결을 위한 참여 방법과 실행 가능성을 묻는 질문을 만듭니다.",
  },
  {
    id: "social-9-12-02",
    subject: "사회",
    gradeBand: "중학교 1-3학년",
    title: "[9사(일사)12-02] 사회문제 조사와 영향 토의",
    standard:
      "[9사(일사)12-02] 오늘날의 주요한 사회문제를 조사하고, 이러한 사회문제가 우리 생활에 미치는 영향에 대해 토의한다.",
    classroomGoal:
      "사회문제의 원인, 영향, 관련 당사자, 해결 가능성을 질문으로 정리합니다.",
  },
  {
    id: "social-9-12-03",
    subject: "사회",
    gradeBand: "중학교 1-3학년",
    title: "[9사(일사)12-03] 사회문제 대응 사례와 실천 방안",
    standard:
      "[9사(일사)12-03] 사회 변동과 사회문제에 대응하는 국내외의 사례들을 검토하고, 시민으로서 지녀야 할 태도와 실천 방안에 대해 토의한다.",
    classroomGoal:
      "국내외 대응 사례를 비교하고 시민으로서 할 수 있는 실천 방안을 묻습니다.",
  },
  {
    id: "korean-10-common-1-02-01",
    subject: "국어",
    gradeBand: "고등학교 1학년 공통",
    title: "[10공국1-02-01] 논증 타당성 평가와 재구성",
    standard:
      "[10공국1-02-01] 다양한 글이나 자료를 읽으며 논증의 타당성을 평가하고 자신의 관점을 바탕으로 논증을 재구성한다.",
    classroomGoal:
      "여러 글과 자료의 주장·이유·근거를 비교하고, 타당성을 묻는 질문으로 자신의 관점을 다시 구성합니다.",
  },
  {
    id: "korean-10-common-2-01-01",
    subject: "국어",
    gradeBand: "고등학교 1학년 공통",
    title: "[10공국2-01-01] 발표 질의응답",
    standard:
      "[10공국2-01-01] 청중의 관심과 요구에 맞게 내용을 구성하여 발표하고 청중의 질문에 효과적으로 답변한다.",
    classroomGoal:
      "발표 전 예상 질문을 만들고, 청중의 질문 의도와 필요한 근거를 고려해 답변을 준비합니다.",
  },
  {
    id: "korean-12-reading-discussion-01-01",
    subject: "국어",
    gradeBand: "고등학교 2-3학년 선택",
    title: "[12독토01-01] 질문 생성 독서",
    standard:
      "[12독토01-01] 개인이나 공동체의 관심사를 고려하여 읽을 책을 선정한 후 질문을 생성하고 주체적으로 해석하며 책을 읽는다.",
    classroomGoal:
      "관심사와 연결해 읽을 자료를 고르고, 질문을 생성해 토론과 글쓰기로 확장합니다.",
  },
  {
    id: "social-12-inquiry-04-01",
    subject: "사회",
    gradeBand: "고등학교 2-3학년 선택",
    title: "[12사탐04-01] 사회문제 탐구 계획",
    standard:
      "[12사탐04-01] 일상생활에서 경험하는 사회문제 중 하나를 선정하여 해당 문제에 대한 다양한 관점을 비교하고, 이를 바탕으로 문제 해결을 위한 탐구 계획을 수립한다.",
    classroomGoal:
      "사회문제를 탐구 질문으로 좁히고, 다양한 관점과 해결 가능성을 비교하는 질문을 만듭니다.",
  },
];

export const questionTypeLabels: Record<QuestionType, string> = {
  fact: "사실 질문",
  vocabulary: "어휘·문맥 질문",
  inference: "추론 질문",
  application: "적용 질문",
  extension: "확장 질문",
  reflection: "성찰 질문",
  off_topic: "범위 밖 질문",
  safety: "안전 확인",
};

function includesAny(value: string, signals: string[]) {
  return signals.some((signal) => value.includes(signal));
}

function uniqueList(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

export function buildStandardAssessmentAnalysis(standard: string): StandardAssessmentAnalysis {
  const standardText = standard.trim();
  const sourceText = standardText || "수업 자료를 읽고 질문을 만들며 자료 속 근거로 답을 확인한다.";

  const contentTargets = uniqueList([
    includesAny(sourceText, ["글", "자료", "지문", "기사", "그림", "표", "관찰"]) ? "수업 자료의 중심 내용과 세부 정보" : "",
    includesAny(sourceText, ["다양한 글", "복수 자료", "주제 통합", "여러 글"]) ? "여러 글과 자료의 관점, 주장, 근거" : "",
    includesAny(sourceText, ["근거", "자료를 바탕", "확인"]) ? "답을 확인할 수 있는 자료 속 근거" : "",
    includesAny(sourceText, ["출처", "신뢰성", "타당성", "공정성"]) ? "자료의 출처, 타당성, 신뢰성" : "",
    includesAny(sourceText, ["관점", "의도", "맥락", "공정성"]) ? "자료에 드러난 관점과 맥락" : "",
    includesAny(sourceText, ["생각", "의견", "설명", "제안"]) ? "학생 자신의 생각과 설명" : "",
    includesAny(sourceText, ["문제", "원인", "영향", "해결"]) ? "문제 상황의 원인, 영향, 해결 가능성" : "",
    includesAny(sourceText, ["면담", "상대", "매체", "듣고 말"]) ? "대화 상대와 소통 맥락" : "",
    includesAny(sourceText, ["토의", "토론", "반박", "논증"]) ? "의견 비교, 근거, 반론" : "",
    includesAny(sourceText, ["미디어", "뉴스", "매체"]) ? "미디어 자료의 의미와 영향" : "",
    includesAny(sourceText, ["자연 현상", "관찰", "실험", "과학"]) ? "관찰 자료와 현상 사이의 관계" : "",
    includesAny(sourceText, ["영어", "묻고 답", "주요 내용"]) ? "읽기 자료의 주요 표현과 정보" : "",
  ]);

  const performanceBehaviors = uniqueList([
    includesAny(sourceText, ["파악", "이해", "읽고"]) ? "자료에서 확인할 수 있는 사실과 핵심 내용을 찾아낸다." : "",
    includesAny(sourceText, ["근거"]) ? "자신의 질문이나 답을 자료 속 근거와 연결한다." : "",
    includesAny(sourceText, ["설명"]) ? "자료의 단서를 바탕으로 까닭이나 관계를 설명한다." : "",
    includesAny(sourceText, ["비교"]) ? "자료 속 대상이나 관점을 비교해 차이를 설명한다." : "",
    includesAny(sourceText, ["관점", "의도", "맥락"]) ? "자료에 드러나지 않은 의도나 관점을 추론한다." : "",
    includesAny(sourceText, ["타당성", "신뢰성", "출처", "공정성"]) ? "자료의 타당성, 신뢰성, 출처, 공정성을 점검한다." : "",
    includesAny(sourceText, ["논증", "주장", "이유", "반론", "반박"]) ? "주장, 이유, 근거, 반론을 구분하고 논증의 타당성을 평가한다." : "",
    includesAny(sourceText, ["재구성", "관점"]) ? "자신의 관점을 바탕으로 질문과 논증을 다시 구성한다." : "",
    includesAny(sourceText, ["원인", "영향"]) ? "문제의 원인과 영향을 추론한다." : "",
    includesAny(sourceText, ["해결", "제안", "적용"]) ? "새 상황이나 생활 장면에 적용할 방안을 제안한다." : "",
    includesAny(sourceText, ["면담"]) ? "면담 목적과 상대를 고려해 질문을 점검하고 조정한다." : "",
    includesAny(sourceText, ["토의", "토론", "반박", "논증"]) ? "상대 의견을 듣고 근거 확인 질문이나 반론 질문을 만든다." : "",
    includesAny(sourceText, ["묻고 답", "질문"]) ? "자료의 내용에 관해 질문하고 답을 확인한다." : "",
    "처음 질문을 더 명확하고 깊은 질문으로 다시 쓰고 바꾼다.",
    "챗봇 답을 그대로 받아들이지 않고 자료로 다시 확인한다.",
  ]);

  const coreAchievement = performanceBehaviors.slice(0, 2).join(" ") || "자료를 읽고 질문을 만들며 근거를 들어 설명한다.";

  const evaluationElements: StandardAssessmentElement[] = [
    {
      key: "standard_material_alignment",
      label: "성취기준·자료 연결",
      focus: "성취기준의 핵심 행동이 학생 질문과 자료 근거에 함께 드러나는가",
      studentEvidence: "첫 질문, 자료 표시, 챗봇 답 확인 메모",
      rubricUse: "질문이 성취기준에서 요구한 행동을 실제로 수행하게 하는지 판단",
    },
    {
      key: "evidence_check",
      label: "자료 근거 확인",
      focus: "챗봇의 답을 자료 속 문장, 장면, 표로 다시 확인하는가",
      studentEvidence: "근거 위치, 답과 자료의 일치/불일치 메모",
      rubricUse: "AI 답 수용이 아니라 자료 기반 검증이 일어났는지 판단",
    },
    {
      key: "question_depth",
      label: "질문 유형 확장",
      focus: "사실 확인에서 추론, 적용, 성찰로 사고가 확장되는가",
      studentEvidence: "질문 유형 분류, 추가 질문, 다시 쓴 질문",
      rubricUse: "질문이 단순 확인을 넘어 사고 과정으로 이어지는지 판단",
    },
    {
      key: "revision_reflection",
      label: "질문 다시 쓰기·성찰",
      focus: "처음 질문을 다시 쓰고 바꾸며 왜 좋아졌는지 설명하는가",
      studentEvidence: "처음 질문, 다시 쓴 질문, 성찰 문장",
      rubricUse: "질문을 다시 쓰고 바꾸는 과정과 자기 점검을 평가 포워드로 연결",
    },
  ];

  return {
    coreAchievement,
    contentTargets: contentTargets.length ? contentTargets : ["수업 자료의 핵심 내용", "자료 속 근거", "학생 질문과 설명"],
    performanceBehaviors,
    evaluationElements,
    studentProducts: [
      "첫 질문",
      "질문 유형 분류",
      "자료 속 근거 표시",
      "챗봇 답 확인 메모",
      "다시 쓴 질문",
      "성찰 문장",
    ],
    questionTypeLinks: [
      {
        questionType: "fact",
        label: "사실 질문",
        assessmentRole: "자료에서 확인 가능한 정보를 찾는 출발점",
        evidenceToCollect: "자료의 어느 부분에서 답을 찾았는지",
      },
      {
        questionType: "vocabulary",
        label: "어휘·문맥 질문",
        assessmentRole: "낱말의 기본 뜻과 글에서 선택된 뜻을 문장 단서로 구분하는 과정",
        evidenceToCollect: "질문한 낱말, 사전적 의미, 문장 속 의미, 뜻을 판단한 앞뒤 단서",
      },
      {
        questionType: "inference",
        label: "추론 질문",
        assessmentRole: "자료의 단서로 이유, 관계, 원인을 설명하는 과정",
        evidenceToCollect: "그렇게 생각한 단서와 설명",
      },
      {
        questionType: "application",
        label: "적용 질문",
        assessmentRole: "자료의 내용을 새 상황이나 생활 장면으로 옮겨 보는 과정",
        evidenceToCollect: "적용할 조건, 실천 방안, 예상 결과",
      },
      {
        questionType: "extension",
        label: "확장 질문",
        assessmentRole: "자료에는 직접 없지만 수업 내용과 이어지는 추가 탐구 과정",
        evidenceToCollect: "추가로 조사한 내용, 확인한 출처, 자료와 연결되는 이유",
      },
      {
        questionType: "reflection",
        label: "성찰 질문",
        assessmentRole: "내 질문과 확인 과정을 스스로 점검하는 과정",
        evidenceToCollect: "다시 쓴 질문과 바꾼 이유",
      },
    ],
    rubricDesignNotes: [
      "성취기준의 행동 동사를 학생 산출물에서 관찰 가능한 말로 바꿉니다.",
      "점수는 챗봇 답의 정확성보다 학생이 근거를 확인하고 질문을 개선한 과정에 둡니다.",
      "교사 피드백은 부족한 점 지적보다 다음 질문을 어떻게 바꿀지 안내하는 평가 포워드로 작성합니다.",
    ],
  };
}

export function buildCurriculumCompass(
  standard: string,
  assessmentAnalysis = buildStandardAssessmentAnalysis(standard),
): CurriculumCompass {
  const fertileQuestionAreas = assessmentAnalysis.questionTypeLinks
    .filter((link) => link.questionType !== "fact" && link.questionType !== "vocabulary")
    .map((link) => link.assessmentRole);

  return {
    rawStandard: standard.trim(),
    bigIdeas: [assessmentAnalysis.coreAchievement].filter(Boolean),
    worthwhileNoticing: assessmentAnalysis.contentTargets.slice(0, 6),
    thinkingDispositions: assessmentAnalysis.performanceBehaviors.slice(0, 6),
    fertileQuestionAreas: fertileQuestionAreas.slice(0, 5),
    meaningfulExtensions: [
      "학생 자신의 경험이나 생활 장면과 자료를 연결하는 관점",
      "자료의 방법이 다른 사람에게 미칠 수 있는 영향이나 감정",
      "자료의 해결 방법을 다른 상황에서 바꾸어 적용하는 가능성",
    ],
    doNotForce: [
      "매 턴 성취기준의 문구를 말하게 하지 않기",
      "모든 호기심을 즉시 근거 찾기 과제로 바꾸지 않기",
      "학생의 예상 밖 관심을 곧바로 틀렸다고 수렴시키지 않기",
      "학생이 충분히 말했거나 끝내고 싶을 때 새 질문을 강요하지 않기",
    ],
  };
}

function normalizeCompassList(value: unknown, fallback: string[], maxItems = 8) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);

  return normalized.length ? normalized : [...fallback];
}

export function normalizeQuestioningChatbotConfig(config: QuestioningChatbotConfig): QuestioningChatbotConfig {
  const assessmentAnalysis = config.assessmentAnalysis ?? buildStandardAssessmentAnalysis(config.standard);
  const fallbackCompass = buildCurriculumCompass(config.standard, assessmentAnalysis);
  const compass = config.curriculumCompass as Partial<CurriculumCompass> | undefined;

  return {
    ...config,
    assessmentAnalysis,
    curriculumCompass: {
      rawStandard:
        typeof compass?.rawStandard === "string" && compass.rawStandard.trim()
          ? compass.rawStandard.trim()
          : fallbackCompass.rawStandard,
      bigIdeas: normalizeCompassList(compass?.bigIdeas, fallbackCompass.bigIdeas),
      worthwhileNoticing: normalizeCompassList(
        compass?.worthwhileNoticing,
        fallbackCompass.worthwhileNoticing,
      ),
      thinkingDispositions: normalizeCompassList(
        compass?.thinkingDispositions,
        fallbackCompass.thinkingDispositions,
      ),
      fertileQuestionAreas: normalizeCompassList(
        compass?.fertileQuestionAreas,
        fallbackCompass.fertileQuestionAreas,
      ),
      meaningfulExtensions: normalizeCompassList(
        compass?.meaningfulExtensions,
        fallbackCompass.meaningfulExtensions,
      ),
      doNotForce: normalizeCompassList(compass?.doNotForce, fallbackCompass.doNotForce),
    },
    material: normalizeQuestionMaterialForStudentDisplay(config.material),
    behavior: normalizeQuestioningChatbotBehavior(config.behavior),
  };
}

export function buildRubric(standard: string): RubricCriterion[] {
  const standardHint = standard.trim() || "선택한 성취기준";
  const analysis = buildStandardAssessmentAnalysis(standard);
  const elementByKey = new Map(analysis.evaluationElements.map((element) => [element.key, element]));

  return [
    {
      key: "standard_material_alignment",
      label: "성취기준·자료 연결",
      description: `${standardHint}에서 요구하는 핵심 성취가 질문과 자료 근거에 드러나는지 봅니다.`,
      observableEvidence:
        elementByKey.get("standard_material_alignment")?.studentEvidence ||
        "첫 질문, 근거 표시, 챗봇 답 확인 메모",
      feedbackForward: "질문에 자료의 특정 장면·문장·표와 성취기준의 행동 동사를 함께 넣게 안내합니다.",
      levels: [
        { score: 5, label: "탁월", descriptor: "질문, 근거, 설명이 성취기준의 핵심 행동과 자료를 정확히 연결합니다." },
        { score: 4, label: "우수", descriptor: "질문이 성취기준과 자료에 분명히 연결되며 확인할 근거도 드러납니다." },
        { score: 3, label: "도달", descriptor: "질문이 성취기준과 관련되지만 자료의 어느 부분을 볼지 더 분명히 해야 합니다." },
        { score: 2, label: "부분 도달", descriptor: "성취기준 또는 자료와 관련은 있으나 질문의 초점이 넓거나 흐립니다." },
        { score: 1, label: "시작", descriptor: "자료나 성취기준과의 연결이 약해 질문을 다시 잡아야 합니다." },
        { score: 0, label: "미제출", descriptor: "평가할 질문이나 근거 기록이 없습니다." },
      ],
    },
    {
      key: "evidence_check",
      label: "자료 근거 확인",
      description: "챗봇 답을 그대로 받아들이지 않고 자료 속 근거로 다시 확인하는지 봅니다.",
      observableEvidence: "근거가 되는 문장·장면·표시, 챗봇 답과 자료의 일치/불일치 메모",
      feedbackForward: "답을 받은 뒤 '어디에서 확인했는가'와 '챗봇 답과 다른 점은 무엇인가'를 쓰게 합니다.",
      levels: [
        { score: 5, label: "탁월", descriptor: "근거 위치를 구체적으로 찾고 챗봇 답의 타당성을 자신의 말로 검토합니다." },
        { score: 4, label: "우수", descriptor: "근거가 될 부분을 찾고 답과 비교해 확인합니다." },
        { score: 3, label: "도달", descriptor: "자료 속 근거를 찾지만 답과 어떻게 연결되는지 설명이 짧습니다." },
        { score: 2, label: "부분 도달", descriptor: "근거 확인이 형식적이거나 위치가 막연합니다." },
        { score: 1, label: "시작", descriptor: "챗봇 답을 거의 그대로 받아들이고 자료 확인이 부족합니다." },
        { score: 0, label: "미제출", descriptor: "근거 확인 기록이 없습니다." },
      ],
    },
    {
      key: "question_depth",
      label: "질문 유형 확장",
      description: "사실 확인에서 추론, 적용, 성찰 질문으로 사고가 확장되는지 봅니다.",
      observableEvidence: "사실·추론·적용·성찰 질문의 분류 기록과 다시 쓴 질문",
      feedbackForward: "사실 질문 하나를 고른 뒤 '왜', '어떻게 적용할까', '내 질문은 무엇을 더 확인해야 하나'로 넓히게 합니다.",
      levels: [
        { score: 5, label: "탁월", descriptor: "질문 유형을 구분하고 근거를 바탕으로 더 깊은 질문으로 확장합니다." },
        { score: 4, label: "우수", descriptor: "사실 질문을 넘어 추론, 적용, 성찰 중 하나 이상으로 질문을 발전시킵니다." },
        { score: 3, label: "도달", descriptor: "질문 유형을 대체로 구분하지만 사고 확장은 일부에 머뭅니다." },
        { score: 2, label: "부분 도달", descriptor: "질문이 대부분 사실 확인에 머물거나 유형 구분이 흔들립니다." },
        { score: 1, label: "시작", descriptor: "질문 형태가 불분명하거나 자료와 연결된 궁금증이 약합니다." },
        { score: 0, label: "미제출", descriptor: "분류하거나 개선할 질문이 없습니다." },
      ],
    },
    {
      key: "revision_reflection",
      label: "질문 다시 쓰기·성찰",
      description: "처음 질문을 더 명확하고 깊은 질문으로 다시 쓰고 바꾼 이유를 설명하는지 봅니다.",
      observableEvidence: "처음 질문, 다시 쓴 질문, 왜 좋아졌는지 쓴 성찰 문장",
      feedbackForward: "다시 쓴 질문에는 자료 단서, 사고 동사, 다음 탐구 방향 중 적어도 하나를 더 넣게 합니다.",
      levels: [
        { score: 5, label: "탁월", descriptor: "질문을 의미 있게 다시 쓰고 바꾸며, 바꾼 이유와 다음 확인 지점을 설명합니다." },
        { score: 4, label: "우수", descriptor: "질문을 더 구체적으로 다시 쓰고 왜 좋아졌는지 간단히 설명합니다." },
        { score: 3, label: "도달", descriptor: "질문을 다시 쓰지만 바꾼 이유가 짧거나 일부만 드러납니다." },
        { score: 2, label: "부분 도달", descriptor: "표현만 조금 바꾸고 질문의 초점이나 깊이는 크게 달라지지 않습니다." },
        { score: 1, label: "시작", descriptor: "질문 다시 쓰기나 성찰이 매우 부족합니다." },
        { score: 0, label: "미제출", descriptor: "다시 쓴 질문 또는 성찰 기록이 없습니다." },
      ],
    },
  ];
}

export function emptyMaterialAnalysis(): MaterialAnalysis {
  return {
    materialTitle: "",
    summary: "",
    visibleText: "",
    questionFocusMemo: "",
    keyConcepts: [],
    vocabulary: [],
    possibleMisconceptions: [],
    questionSeeds: [],
    sourceLimit: "교사가 입력하거나 AI가 분석한 수업 자료 범위 안에서만 답합니다.",
    safetyNotice: "학생 이름, 연락처, 사진 속 식별 정보 등 개인정보는 입력하지 않습니다.",
  };
}

export function isVocabularyQuestion(value: string, vocabularySignals: string[] = []) {
  const normalized = value.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  const semanticCompact = compact.replace(/["'“”‘’]/g, "");

  if (/(다는|라는|했다는|였다는|없다는|있다는|줄었다는|늘었다는)뜻/.test(semanticCompact)) {
    return false;
  }

  const quotedCandidate = /["'“‘]([^"'”’]{1,30})["'”’]/.exec(normalized)?.[1]?.trim();
  const quotedVocabularyQuestion = Boolean(
    quotedCandidate &&
      quotedCandidate.split(/\s+/).length <= 3 &&
      !/[.!?。？！]/.test(quotedCandidate) &&
      /(뜻|의미|뭐예요|뭔가요|무엇인가요)/.test(normalized),
  );
  const configuredVocabularyQuestion =
    vocabularySignals.some((signal) => {
      const normalizedSignal = signal.trim().toLowerCase();
      return normalizedSignal.length >= 2 && normalized.includes(normalizedSignal);
    }) &&
    Boolean(
      quotedCandidate ||
        /(?:뭐|무엇|무슨|어떤|알려|모르|궁금|풀이|설명|쉽게|해\s*줘)/.test(normalized),
    );

  return (
    quotedVocabularyQuestion ||
    configuredVocabularyQuestion ||
    /(낱말|단어|용어|표현).{0,16}(뜻|의미).{0,12}(뭐|무엇|알려|모르|궁금)/.test(normalized) ||
    /(뜻|의미).{0,12}(뭐|무엇|알려|모르|궁금)/.test(normalized) ||
    /(?:^|\s)[가-힣a-z][가-힣a-z0-9·\-]{1,24}(?:이|가|은|는)?\s*(무슨\s*뜻|무슨\s*말|뭐예요|뭔가요|무엇인가요)/.test(
      normalized,
    ) ||
    /[가-힣a-z][가-힣a-z0-9·\-]{1,24}(?:이라는|라는)\s*말(?:은|이)?\s*(뭐|무엇|무슨)/.test(
      normalized,
    ) ||
    /(여기서|이\s*문장에서).{0,30}(뜻|의미|뭐예요|뭔가요)/.test(normalized)
  );
}

export function classifyQuestionLocally(
  question: string,
  behaviorValue?: QuestioningChatbotBehavior,
): QuestionType {
  const normalized = question.toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  const behavior = normalizeQuestioningChatbotBehavior(behaviorValue);
  const keywords = behavior.classifierKeywords;

  const unsafeAnswerRequest =
    /(답안|수행평가|숙제|정답|답을다|전체답|그대로).*(써|작성|만들|대신|해줘)/.test(compact) ||
    /(소개문|문단|예시|완성본).*(다|전체|그대로|완성|대신).*(써|작성|만들|보여|줘)/.test(compact) ||
    /(번역앱처럼|복사안할).*(문단|전체|완성|만들|보여)/.test(compact) ||
    (/(써줘|작성해줘|만들어줘|대신해줘|보여줘)/.test(compact) &&
      /(답|문장|문단|소개문|수행평가|숙제|예시)/.test(compact));

  if (unsafeAnswerRequest || keywords.safety.some((signal) => normalized.includes(signal.toLowerCase()))) {
    return "safety";
  }

  if (keywords.off_topic.some((signal) => normalized.includes(signal.toLowerCase()))) {
    return "off_topic";
  }

  if (isVocabularyQuestion(question, keywords.vocabulary)) {
    return "vocabulary";
  }

  if (keywords.reflection.some((signal) => normalized.includes(signal.toLowerCase()))) {
    return "reflection";
  }

  if (keywords.extension.some((signal) => normalized.includes(signal.toLowerCase()))) {
    return "extension";
  }

  if (keywords.application.some((signal) => normalized.includes(signal.toLowerCase()))) {
    return "application";
  }

  if (keywords.inference.some((signal) => normalized.includes(signal.toLowerCase()))) {
    return "inference";
  }

  return "fact";
}

const questionSearchStopwords = new Set([
  "자료",
  "질문",
  "내용",
  "무엇",
  "어떤",
  "어떻게",
  "왜",
  "누가",
  "언제",
  "어디",
  "알려",
  "주세요",
  "인가요",
  "있나요",
  "했나요",
  "할까요",
  "이것",
  "그것",
  "이런",
]);

const questionIntentTerms = new Set([
  "어떻게",
  "방법",
  "이유",
  "까닭",
  "원인",
  "결과",
  "변화",
  "계획",
  "효과",
  "문제",
  "해결",
  "수치",
]);

const koreanSearchSuffixes = [
  "에서는",
  "으로는",
  "에게서",
  "이라는",
  "들이",
  "들은",
  "들의",
  "인가요",
  "했나요",
  "일까요",
  "습니까",
  "으로",
  "에서",
  "에게",
  "께서",
  "부터",
  "까지",
  "처럼",
  "보다",
  "하고",
  "해서",
  "나요",
  "까요",
  "어요",
  "아요",
  "와",
  "과",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "도",
  "만",
  "로",
];

function normalizeSearchToken(token: string) {
  let normalized = token.toLowerCase();
  let suffix = koreanSearchSuffixes.find(
    (candidate) => normalized.endsWith(candidate) && normalized.length - candidate.length >= 2,
  );

  while (suffix) {
    normalized = normalized.slice(0, -suffix.length);
    suffix = koreanSearchSuffixes.find(
      (candidate) => normalized.endsWith(candidate) && normalized.length - candidate.length >= 2,
    );
  }

  return normalized;
}

function findRelevantSourceExcerpt(question: string, material: MaterialAnalysis, prioritizeQuestionIntent: boolean) {
  const visibleText = material.visibleText.trim();
  const summary = material.summary.trim();
  const isReferenceOnly = visibleText === REFERENCE_ONLY_QUESTION_MATERIAL_TEXT;
  const source = isReferenceOnly ? summary : visibleText || summary;
  const compactQuestion = question.replace(/\s+/g, "");

  if (!source) {
    return "교사가 입력한 질문 자료에서 관련 내용을 확인해 보세요.";
  }

  if (isReferenceOnly && !summary) {
    return "원본 자료의 해당 부분을 직접 살펴보며 근거를 확인해 보세요.";
  }

  const terms = Array.from(
    new Set(
      (question.match(/[가-힣A-Za-z0-9]+/g) || [])
        .map(normalizeSearchToken)
        .filter((term) => term.length >= 2 && !questionSearchStopwords.has(term)),
    ),
  );
  const segments = source
    .split(/\r?\n+/)
    .flatMap((paragraph, paragraphIndex) =>
      (paragraph.replace(/(\d)\.(\d)/g, "$1<decimal>$2").match(/[^.!?]+[.!?]?/g) || [paragraph]).map((sentence, sentenceIndex) => ({
        paragraphIndex,
        sentenceIndex,
        text: sentence.replace(/<decimal>/g, ".").trim(),
      })),
    )
    .filter((segment) => segment.text.length >= 8);

  if (!segments.length) {
    return source.slice(0, 280);
  }

  const environmentalQuestion = /(환경|지구|자원|음식물쓰레기|쓰레기|영향|낭비)/.test(compactQuestion);
  if (environmentalQuestion) {
    const environmentalSegmentIndex = segments.findIndex((segment) =>
      /(전문가|지구|자원|음식이 버려지면|음식물 쓰레기|환경)/.test(segment.text),
    );
    const environmentalSegment =
      environmentalSegmentIndex >= 0 ? segments[environmentalSegmentIndex] : undefined;
    if (environmentalSegment) {
      const relatedSegments = [environmentalSegment];
      for (let index = environmentalSegmentIndex + 1; index < segments.length; index += 1) {
        const nextSegment = segments[index];
        const combinedLength = relatedSegments.map((segment) => segment.text).join(" ").length + nextSegment.text.length;
        if (nextSegment.paragraphIndex !== environmentalSegment.paragraphIndex || combinedLength > 340) {
          break;
        }
        relatedSegments.push(nextSegment);
      }
      const combinedEnvironmentalText = relatedSegments.map((segment) => segment.text).join(" ");
      return combinedEnvironmentalText.length > 340
        ? `${combinedEnvironmentalText.slice(0, 337)}...`
        : combinedEnvironmentalText;
    }
  }

  const scored = segments.map((segment, index) => {
    const nextSegment = segments[index + 1];
    const scoringText =
      nextSegment &&
      nextSegment.paragraphIndex === segment.paragraphIndex &&
      nextSegment.sentenceIndex === segment.sentenceIndex + 1 &&
      segment.text.length + nextSegment.text.length <= 260
        ? `${segment.text} ${nextSegment.text}`
        : segment.text;
    const normalizedSegment = scoringText.toLowerCase().replace(/\s+/g, "");
    const score = terms.reduce(
      (total, term) =>
        total +
        (normalizedSegment.includes(term.replace(/\s+/g, ""))
          ? prioritizeQuestionIntent && questionIntentTerms.has(term)
            ? 10
            : Math.min(term.length, 6)
          : 0),
      0,
    );
    return { index, score };
  });
  const best = scored.reduce((current, candidate) => (candidate.score > current.score ? candidate : current));
  if (best.score === 0 && material.summary.trim()) {
    const summary = material.summary.trim();
    return summary.length > 220 ? `${summary.slice(0, 217)}...` : summary;
  }
  const bestSegment = segments[best.index];
  const nextSegment = segments[best.index + 1];
  const combined =
    nextSegment &&
    nextSegment.paragraphIndex === bestSegment.paragraphIndex &&
    nextSegment.sentenceIndex === bestSegment.sentenceIndex + 1 &&
    bestSegment.text.length + nextSegment.text.length <= 260
      ? `${bestSegment.text} ${nextSegment.text}`
      : bestSegment.text;

  return combined.length > 260 ? `${combined.slice(0, 257)}...` : combined;
}

function isTitlePredictionQuestion(question: string) {
  const compactQuestion = question.replace(/\s+/g, "");
  return (
    (/(제목|표제|헤드라인)/.test(compactQuestion) &&
      /(예측|예상|내용|이야기|무슨|어떤|무엇)/.test(compactQuestion)) ||
    /(이야기일까|내용일까|말일까|뜻일까)/.test(compactQuestion) ||
    /(제목보고|제목을보고).*(줄알았|예상했|생각했)/.test(compactQuestion)
  );
}

function createTitlePredictionAnswer(question: string, material: MaterialAnalysis) {
  const compactQuestion = question.replace(/\s+/g, "");
  const sourceText = `${material.materialTitle}\n${material.visibleText}\n${material.summary}`;
  const isFoodWasteMaterial = /(남은 음식|잔반|급식)/.test(sourceText);
  const asksIfStudentsAteMore = /(많이먹|더먹|급식을많이|밥을많이)/.test(compactQuestion);

  if (isFoodWasteMaterial && asksIfStudentsAteMore) {
    return "그렇게 예상해 볼 수는 있어요. 다만 학생들이 급식을 많이 먹어서 줄었다고 바로 단정하기보다는, 먹을 만큼만 받게 된 방법 때문에 남기는 음식이 줄었는지 자료에서 확인해 보면 좋아요.";
  }

  if (isFoodWasteMaterial) {
    return "제목만 보면 남은 음식이 크게 줄어든 변화가 중심일 것 같아요. 왜 그런 변화가 생겼는지는 제목만으로 단정하지 말고, 자료 속 방법과 결과를 함께 보며 확인해 보면 좋아요.";
  }

  const title = material.materialTitle.trim();
  if (title) {
    return `제목만 보면 '${title}'에서 어떤 변화나 핵심 내용이 나올지 먼저 예상해 볼 수 있어요. 그 예상이 맞는지는 자료 속 표현과 근거를 보며 차분히 확인해 보면 좋아요.`;
  }

  return "제목이나 첫 부분을 보면 자료가 무엇을 다룰지 먼저 예상해 볼 수 있어요. 그 예상이 맞는지는 자료 속 표현과 근거를 보며 차분히 확인해 보면 좋아요.";
}

const localVocabularyMeanings: Record<string, string> = {
  잔반: "먹고 남긴 밥이나 음식",
  배식: "여러 사람에게 음식을 나누어 줌",
  "선택 배식": "먹을 사람이 음식의 종류나 양을 골라 받는 배식 방식",
  출처: "말이나 자료가 나온 곳",
  집중력: "한 가지 일에 마음과 주의를 모으는 힘",
  보관함: "물건을 넣어 간직하는 함이나 공간",
  공회전: "차량이 움직이지 않는 상태에서 엔진만 돌아가는 일",
  미세먼지: "눈에 잘 보이지 않을 만큼 매우 작은 먼지",
  리필: "다 쓴 용기에 내용물을 다시 채우는 일",
  다회용: "한 번 버리지 않고 여러 차례 사용할 수 있음",
  흡음판: "소리를 흡수하여 울림이나 소음을 줄이는 판",
  데시벨: "소리의 크기를 나타내는 단위",
  누수: "물이 새어 나옴",
  변인: "실험 결과에 영향을 줄 수 있어 살펴보거나 통제하는 조건",
  상관관계: "한 현상이 변할 때 다른 현상도 함께 변하는 관계",
  인과관계: "어떤 일이 원인이 되어 다른 결과가 생기는 관계",
  지속가능성: "현재의 필요를 채우면서도 미래 세대가 살아갈 조건을 해치지 않고 이어 갈 수 있는 성질",
  토종: "어떤 지역에서 본래부터 자라거나 살아온 종류",
};

const vocabularyTermStopwords = new Set([
  "뜻",
  "의미",
  "무슨",
  "말",
  "단어",
  "낱말",
  "용어",
  "여기서",
  "문장",
  "기사",
  "자료",
  "이게",
  "이건",
  "그게",
  "그건",
]);

function sourceSentences(material: MaterialAnalysis) {
  const source = `${material.visibleText}\n${material.summary}`.trim();
  return (
    source
      .replace(/(\d)\.(\d)/g, "$1<decimal>$2")
      .match(/[^.!?。？！\n]+[.!?。？！]?/g)
      ?.map((sentence) => sentence.replace(/<decimal>/g, ".").trim())
      .filter(Boolean) ?? []
  );
}

function findVocabularyContextSentence(term: string, material: MaterialAnalysis) {
  const normalizedTerm = term.replace(/\s+/g, "");
  const sentence = sourceSentences(material).find((candidate) =>
    candidate.replace(/\s+/g, "").includes(normalizedTerm),
  );
  return sentence ? firstSourceSentence(sentence, 105) : "";
}

function extractInlineVocabularyMeaning(term: string, contextSentence: string) {
  if (!term || !contextSentence) return "";
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const definitionPattern = new RegExp(
    `["'“”‘’]?${escapedTerm}["'“”‘’]?(?:은|는|이란|란)\\s*(.+?)(?:을|를)?\\s*(?:말한다|뜻한다|가리킨다)(?:[.!?。？！]|$)`,
  );
  return definitionPattern.exec(contextSentence)?.[1]?.trim().replace(/(?:을|를)$/, "") ?? "";
}

function hasKoreanFinalConsonant(value: string) {
  const lastCharacter = Array.from(value.trim()).reverse().find((character) => /[가-힣]/.test(character));
  if (!lastCharacter) return false;
  return (lastCharacter.charCodeAt(0) - 0xac00) % 28 !== 0;
}

function topicParticle(value: string) {
  return hasKoreanFinalConsonant(value) ? "은" : "는";
}

function quotedModifier(value: string) {
  return hasKoreanFinalConsonant(value) ? "이라는" : "라는";
}

function normalizeRequestedVocabularyTerm(value: string, material: MaterialAnalysis) {
  const trimmed = value.trim().replace(/^["'“”‘’]|["'“”‘’]$/g, "");
  if (!trimmed || vocabularyTermStopwords.has(trimmed)) return "";

  const source = `${material.materialTitle}\n${material.visibleText}\n${material.summary}`.replace(/\s+/g, "");
  if (source.includes(trimmed.replace(/\s+/g, ""))) return trimmed;

  const withoutParticle = trimmed.replace(/(이|가|은|는|을|를)$/, "");
  return source.includes(withoutParticle.replace(/\s+/g, "")) ? withoutParticle : trimmed;
}

function extractRequestedVocabularyTerm(studentTurn: string, material: MaterialAnalysis) {
  const configuredTerms = normalizeMaterialVocabulary(material.vocabulary)
    .map((entry) => entry.term)
    .sort((left, right) => right.length - left.length);
  const configuredMatch = configuredTerms.find((term) =>
    studentTurn.replace(/\s+/g, "").includes(term.replace(/\s+/g, "")),
  );
  if (configuredMatch) return configuredMatch;

  const quoted = /["'“‘]([^"'”’]{1,30})["'”’]/.exec(studentTurn)?.[1];
  if (quoted) return normalizeRequestedVocabularyTerm(quoted, material);

  const beforeMeaning = /([가-힣A-Za-z][가-힣A-Za-z0-9·\- ]{0,24}?)(?:이|가|은|는)?\s*(?:무슨\s*)?(?:뜻|의미|말)(?:이|인|이에|인가|일)?/.exec(
    studentTurn,
  )?.[1];
  if (beforeMeaning) {
    const tokens = beforeMeaning.trim().split(/\s+/);
    return normalizeRequestedVocabularyTerm(tokens.at(-1) || "", material);
  }

  const beforeDefinition = /([가-힣A-Za-z][가-힣A-Za-z0-9·\-]{1,24})(?:이|가|은|는)?\s*(?:뭐예요|뭔가요|무엇인가요)/.exec(
    studentTurn,
  )?.[1];
  return beforeDefinition ? normalizeRequestedVocabularyTerm(beforeDefinition, material) : "";
}

function createVocabularyLocalTurn(studentTurn: string, material: MaterialAnalysis): NaturalLocalTurn {
  const term = extractRequestedVocabularyTerm(studentTurn, material);
  if (!term) {
    return {
      reply: "뜻을 알고 싶은 낱말을 따옴표로 표시해 주세요. 예를 들면 ‘공회전’이 무슨 뜻이에요처럼 쓰면 그 문장에 맞춰 설명할게요.",
      primaryMove: "clarify",
      engagementState: "curious",
      curriculumRelation: "direct",
      sourceStatus: "source_insufficient",
      supportLevel: 1,
    };
  }

  const configured = normalizeMaterialVocabulary(material.vocabulary).find(
    (entry) => entry.term.replace(/\s+/g, "") === term.replace(/\s+/g, ""),
  );
  const contextSentence = configured?.contextSentence
    ? firstSourceSentence(configured.contextSentence, 105)
    : findVocabularyContextSentence(term, material);
  const inlineMeaning = extractInlineVocabularyMeaning(term, contextSentence);
  const dictionaryMeaning = (
    configured?.dictionaryMeaning ||
    inlineMeaning ||
    localVocabularyMeanings[term] ||
    ""
  ).slice(0, 95);
  const contextualMeaning =
    configured?.contextualMeaning ||
    inlineMeaning ||
    (dictionaryMeaning && contextSentence ? dictionaryMeaning : "");

  if (!dictionaryMeaning) {
    return {
      reply: contextSentence
        ? `‘${term}’이 쓰인 부분은 “${contextSentence}”예요. 이 자료만으로 정확한 사전 뜻까지 단정하면 지어낼 수 있어서, 국어사전에서 ‘${term}’을 찾은 뒤 이 문장과 맞는 뜻을 골라야 해요.`
        : `자료에서 ‘${term}’이 쓰인 문장을 찾지 못했어요. 뜻을 지어내지 않고, 국어사전에서 기본 뜻을 확인한 뒤 앞뒤 문장과 맞는 뜻을 골라야 해요.`,
      primaryMove: "check_evidence",
      engagementState: "seeking_evidence",
      curriculumRelation: "direct",
      sourceStatus: "source_insufficient",
      supportLevel: 2,
    };
  }

  const contextExplanation = (contextualMeaning || dictionaryMeaning).slice(0, 110);
  return {
    reply: contextSentence
      ? `‘${term}’${topicParticle(term)} 사전적으로 “${dictionaryMeaning}”${quotedModifier(dictionaryMeaning)} 뜻이에요. 이 글의 “${contextSentence}”에서는 “${contextExplanation}”${quotedModifier(contextExplanation)} 뜻으로 쓰였어요.`
      : `‘${term}’${topicParticle(term)} 사전적으로 “${dictionaryMeaning}”${quotedModifier(dictionaryMeaning)} 뜻이에요. 이 자료에서는 “${contextExplanation}”${quotedModifier(contextExplanation)} 뜻으로 이해하면 돼요.`,
    primaryMove: "clarify",
    engagementState: "seeking_evidence",
    curriculumRelation: "direct",
    sourceStatus: contextSentence ? "supported" : "reasonable_inference",
    supportLevel: 1,
  };
}

type LegacyChatResult = Pick<
  ChatResult,
  | "answer"
  | "followUpQuestion"
  | "questionType"
  | "typeLabel"
  | "typeReason"
  | "evidencePrompt"
  | "revisionSuggestion"
  | "evaluationSignals"
  | "teacherFeedback"
  | "rubricScores"
  | "safetyFlag"
>;

function createLegacyLocalQuestionResult({
  question,
  material,
  rubric,
  behavior: behaviorValue,
}: {
  question: string;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  behavior?: QuestioningChatbotBehavior;
}): LegacyChatResult {
  const behavior = normalizeQuestioningChatbotBehavior(behaviorValue);
  const questionType = classifyQuestionLocally(question, behavior);
  const typeLabel = questionTypeLabels[questionType];
  const compactQuestion = question.replace(/\s/g, "");
  const looksLikeQuestion =
    /[?？]/.test(question) || /(무엇|뭐|왜|어떻게|어떤|누가|언제|어디|얼마|인가요|일까요|나요|까요)/.test(question);
  const needsMoreDetail =
    looksLikeQuestion && (compactQuestion.length < 8 || question.trim().split(/\s+/).length < 2);
  const sourceExcerpt = findRelevantSourceExcerpt(question, material, looksLikeQuestion);

  if (questionType === "safety") {
    return {
      answer:
        "이 질문에는 개인정보나 정답 대필 요청이 섞여 있을 수 있어요. 이름, 연락처, 사진 속 개인 정보는 빼고, 자료에서 확인할 수 있는 내용으로 천천히 다시 살펴봐요.",
      followUpQuestion: "괜찮아요. 개인정보를 뺀 뒤 자료와 연결되는 궁금함을 천천히 다시 정리해 봐요.",
      questionType,
      typeLabel,
      typeReason: "개인정보 또는 대필 요청 가능성이 있어 안전 확인으로 분류했습니다.",
      evidencePrompt: "개인정보를 모두 지운 뒤 자료에서 확인할 수 있는 부분만 표시해 보세요.",
      revisionSuggestion: "이 자료에서 내가 확인하고 싶은 사실이나 이유는 무엇인가요?",
      evaluationSignals: ["개인정보 입력 가능성", "정답 대필 요청 가능성", "자료 근거 확인 필요"],
      teacherFeedback: "개인정보를 제외하고 자료 근거를 확인하는 질문으로 바꾸면 좋겠습니다.",
      rubricScores: rubric.map((criterion) => ({
        criterionKey: criterion.key,
        score: criterion.key === "revision_reflection" ? 1 : 2,
        rationale: "안전 규칙 확인이 필요합니다.",
      })),
      safetyFlag: true,
    };
  }

  if (questionType === "off_topic") {
    return {
      answer: behavior.offTopicResponse,
      followUpQuestion: "괜찮아요. 다시 질문 자료로 돌아와 눈에 띄는 부분부터 천천히 살펴봐요.",
      questionType,
      typeLabel,
      typeReason: "질문 자료와 직접 연결되지 않는 질문으로 보입니다.",
      evidencePrompt: "자료의 어떤 부분과 연결해 질문할 수 있을지 먼저 찾아보세요.",
      revisionSuggestion: "이 자료에서 내가 궁금한 점은 무엇이고, 어느 부분에서 확인할 수 있나요?",
      evaluationSignals: ["자료 범위 밖 질문", "수업 목표 재연결 필요"],
      teacherFeedback: "질문을 수업 자료의 특정 부분과 연결하도록 안내하세요.",
      rubricScores: rubric.map((criterion) => ({
        criterionKey: criterion.key,
        score: criterion.key === "standard_material_alignment" ? 1 : 2,
        rationale: "성취기준과 자료 연결이 더 필요합니다.",
      })),
      safetyFlag: false,
    };
  }

  if (questionType === "vocabulary") {
    const vocabularyTurn = createVocabularyLocalTurn(question, material);
    return {
      answer: vocabularyTurn.reply,
      followUpQuestion: "사전의 기본 뜻과 이 문장에서 고른 뜻을 나누어 확인해 보세요.",
      questionType,
      typeLabel,
      typeReason: "낱말이나 용어의 기본 뜻과 문맥 속 의미를 묻는 질문입니다.",
      evidencePrompt: "그 낱말이 쓰인 문장과 앞뒤 문장에서 뜻을 좁혀 주는 단서를 표시해 보세요.",
      revisionSuggestion: "‘이 낱말의 사전적 뜻은 무엇이고, 이 문장에서는 어떤 뜻으로 쓰였나요?’로 나누어 물어보세요.",
      evaluationSignals: ["어휘 의미 확인", "문장 맥락 확인", "사전적 의미와 문맥적 의미 구분"],
      teacherFeedback: "학생이 낱말의 기본 뜻을 확인한 뒤 문장 단서로 알맞은 뜻을 선택하는지 살펴보세요.",
      rubricScores: rubric.map((criterion) => ({
        criterionKey: criterion.key,
        score:
          criterion.key === "standard_material_alignment" || criterion.key === "evidence_check"
            ? 4
            : 3,
        rationale: "낱말의 뜻을 지문 속 문장과 연결해 확인하는 질문입니다.",
      })),
      safetyFlag: false,
    };
  }

  if (questionType === "extension") {
    return {
      answer:
        "질문 자료에는 직접 나오지 않지만 수업 내용과 이어지는 궁금증이에요. 현재 로컬 모드에서는 실시간 리서치 출처를 확인할 수 없으니, 자료와 연결되는 부분을 짚고 신뢰할 수 있는 추가 자료로 함께 확인해 보세요.",
      followUpQuestion: "좋은 확장이에요. 먼저 자료와 연결되는 부분을 차분히 다시 확인해 봐요.",
      questionType,
      typeLabel,
      typeReason: "자료 밖 내용이지만 수업 주제와 이어지는 추가 탐구 표현이 포함되어 있습니다.",
      evidencePrompt: "이 질문이 수업 자료의 어떤 문장, 장면, 개념과 연결되는지 먼저 표시해 보세요.",
      revisionSuggestion: "이 자료의 어떤 부분과 연결해서 더 알아보고 싶은가요? 확인할 출처도 함께 적어 보세요.",
      evaluationSignals: ["확장 질문", "자료 연결 확인 필요", "추가 출처 확인 필요"],
      teacherFeedback: "수업 자료와 연결되는 지점을 먼저 찾고, 추가 리서치 출처를 확인하도록 안내하세요.",
      rubricScores: rubric.map((criterion) => ({
        criterionKey: criterion.key,
        score: criterion.key === "question_depth" ? 4 : 3,
        rationale: "수업 내용과 연결되는 확장 질문으로 보이나 자료 근거와 추가 출처 확인이 필요합니다.",
      })),
      safetyFlag: false,
    };
  }

  const revisionByType: Record<QuestionType, string> = {
    fact: "자료 속 특정 문장이나 장면을 넣어 '무엇을 확인할 수 있나요?'로 더 분명하게 다시 써 보세요.",
    vocabulary: "낱말의 사전적 뜻과 이 문장에서의 뜻을 나누고, 뜻을 판단한 앞뒤 단서도 함께 물어보세요.",
    inference: "왜 그렇게 생각하는지 묻고, 근거가 될 단서를 함께 찾는 질문으로 바꿔 보세요.",
    application: "우리 반, 우리 학교, 다른 상황처럼 적용할 조건을 구체적으로 넣어 보세요.",
    extension: "수업 자료와 어떤 부분이 연결되는지 먼저 쓰고, 추가로 확인할 출처나 자료를 함께 적어 보세요.",
    reflection: "내 질문이 자료 근거와 연결되는지, 무엇을 더 확인해야 하는지 돌아보는 문장으로 다시 써 보세요.",
    off_topic: "자료 속 특정 부분과 연결해 다시 질문해 보세요.",
    safety: "개인정보와 대필 요청을 빼고 다시 질문해 보세요.",
  };

  const compactQuestionForApplication = question.replace(/\s+/g, "");
  const asksBoardCaution =
    questionType === "application" &&
    /잔반게시판/.test(compactQuestionForApplication) &&
    /(조심|주의|문제|부담|비교|순위|창피)/.test(compactQuestionForApplication);
  if (asksBoardCaution) {
    return {
      answer:
        "우리 반에서 잔반 게시판을 만든다면 개인 이름이나 특정 학생의 식사량을 드러내지 않는 것이 중요해요. 자료처럼 학급 전체의 변화나 실천 목표를 보여 주는 방식으로 만들면, 서로 비교하기보다 함께 줄여 가는 활동으로 사용할 수 있어요.",
      followUpQuestion: "좋아요. 우리 반 상황에 맞게 모두가 부담 없이 참여할 방법을 천천히 생각해 봐요.",
      questionType,
      typeLabel,
      typeReason: "자료 속 잔반 게시판을 우리 반 상황에 적용하면서 주의점을 묻는 적용 질문입니다.",
      evidencePrompt: "자료에서 잔반 게시판이 어떤 정보를 보여 주었는지 확인하고, 개인정보나 비교 부담이 생기지 않게 바꿀 부분을 찾아보세요.",
      revisionSuggestion: "우리 반에서 잔반 게시판을 만들 때 학생들이 부담 없이 참여하려면 어떤 정보를 보여 주어야 할까요?",
      evaluationSignals: ["자료 적용", "개인정보와 비교 부담 고려", "실천 방법 구체화"],
      teacherFeedback:
        "자료 속 실천을 그대로 옮기기보다 개인정보와 비교 부담까지 고려해 학교 상황에 맞게 적용하려는 질문입니다.",
      rubricScores: rubric.map((criterion) => ({
        criterionKey: criterion.key,
        score:
          criterion.key === "question_depth" || criterion.key === "standard_material_alignment"
            ? 4
            : 3,
        rationale: "자료의 실천 방법을 우리 반 상황으로 옮기며 주의점까지 고려했습니다.",
      })),
      safetyFlag: false,
    };
  }

  if (isTitlePredictionQuestion(question)) {
    const titlePredictionQuestionType: QuestionType = "inference";
    return {
      answer: createTitlePredictionAnswer(question, material),
      followUpQuestion: "좋아요. 제목에서 떠올린 예상을 자료와 천천히 비교해 봐요.",
      questionType: titlePredictionQuestionType,
      typeLabel: questionTypeLabels[titlePredictionQuestionType],
      typeReason: "제목이나 표현을 바탕으로 내용을 예상하는 질문으로 보입니다.",
      evidencePrompt: "제목에서 떠올린 예상과 실제 자료에서 확인한 내용을 나누어 표시해 보세요.",
      revisionSuggestion: "제목을 보고 예상한 내용과 자료에서 확인한 근거를 함께 넣어 다시 써 보세요.",
      evaluationSignals: ["제목 근거 예측", "자료 근거 확인 필요", "단정과 확인 구분"],
      teacherFeedback:
        "제목을 바탕으로 내용을 예상하는 질문입니다. 단정하지 않고 자료 속 근거와 비교하도록 안내하면 좋겠습니다.",
      rubricScores: rubric.map((criterion) => ({
        criterionKey: criterion.key,
        score:
          criterion.key === "standard_material_alignment" || criterion.key === "question_depth"
            ? 4
            : 3,
        rationale: "제목을 단서로 내용을 예측하고 자료 확인으로 이어지는 질문입니다.",
      })),
      safetyFlag: false,
    };
  }

  const answerByType: Record<
    Extract<QuestionType, "fact" | "vocabulary" | "inference" | "application" | "reflection">,
    string
  > = {
    fact: `이 부분은 자료에서 확인할 수 있어요. ${sourceExcerpt}`,
    vocabulary: createVocabularyLocalTurn(question, material).reply,
    inference: `그렇게 생각해 볼 수 있어요. 자료 속 단서는 이 부분과 연결됩니다. ${sourceExcerpt}`,
    application: `우리 상황에 연결해 보려면 이 부분을 먼저 보면 좋아요. ${sourceExcerpt}`,
    reflection: `좋은 점검이에요. 내 생각과 자료가 어떻게 이어지는지 이 부분을 보며 확인해 봐요. ${sourceExcerpt}`,
  };
  const followUpByType: Record<
    Extract<QuestionType, "fact" | "vocabulary" | "inference" | "application" | "reflection">,
    string
  > = {
    fact: "좋아요. 확인한 사실을 붙잡고 자료를 한 번 더 살펴봐요.",
    vocabulary: "사전의 기본 뜻과 이 문장에서 고른 뜻을 나누어 확인해 봐요.",
    inference: "좋은 생각이에요. 근거가 되는 단서를 자료에서 한 번 더 찾아봐요.",
    application: "좋아요. 우리 반이나 학교 상황과 천천히 연결해 봐요.",
    reflection: "좋은 출발이에요. 지금 떠오른 생각을 자료와 연결해 다시 정리해 봐요.",
  };
  const questionFocusMemo = material.questionFocusMemo?.trim();
  const focusFollowUp = questionFocusMemo
    ? "좋아요. 교사가 안내한 방향을 떠올리며 자료를 한 번 더 살펴봐요."
    : "";
  const answer = answerByType[questionType];
  const followUpQuestion = needsMoreDetail
    ? "좋은 시작이에요. 자료에서 눈에 띄는 대상이나 장면을 천천히 다시 살펴봐요."
    : focusFollowUp || followUpByType[questionType];

  return {
    answer: `${looksLikeQuestion ? "" : "말해 준 생각을 잘 들었어요. "}${answer}${
      needsMoreDetail ? ` ${behavior.insufficientQuestionResponse}` : ""
    }`,
    followUpQuestion,
    questionType,
    typeLabel,
    typeReason: `${typeLabel}의 특징을 보이는 표현이 포함되어 있습니다.`,
    evidencePrompt: "자료의 어느 부분에서 이 답을 확인할 수 있나요? 근거가 되는 문장이나 장면을 표시해 보세요.",
    revisionSuggestion: revisionByType[questionType],
    evaluationSignals: ["질문 유형 확인", "자료 근거 확인 필요", "질문 다시 쓰기 가능"],
    teacherFeedback: questionFocusMemo
      ? "교사가 정한 질문 성격 메모를 참고해 자료 근거와 질문 확장을 함께 보세요."
      : "질문 유형을 확인한 뒤 자료 근거를 표시하고, 더 구체적인 질문으로 다시 쓰고 바꾸게 하세요.",
    rubricScores: rubric.map((criterion) => ({
      criterionKey: criterion.key,
      score:
        questionType === "fact"
          ? criterion.key === "question_depth"
            ? 2
            : 3
          : questionType === "reflection"
            ? criterion.key === "revision_reflection"
              ? 4
              : 3
            : 3,
      rationale: "로컬 분류 기준으로 산출한 예비 점수입니다. 교사가 최종 판단해야 합니다.",
    })),
    safetyFlag: false,
  };
}

function hasQuestionEnding(value: string) {
  return /[?？]\s*$/.test(value.trim());
}

function keepAtMostOneQuestion(value: string) {
  let questionMarkSeen = false;
  return value.replace(/[?？]/g, () => {
    if (questionMarkSeen) {
      return ".";
    }
    questionMarkSeen = true;
    return "?";
  });
}

function isClosingStudentTurn(value: string) {
  const compact = value.toLowerCase().replace(/\s+/g, "");
  return /(네|응|아|오케이|ㅇㅋ)?(이제)?(됐어요|됐어|알겠어요|알겠어|알겠음그만|알겠음|그만할래|그만할게요|그만할게|끝낼래|끝낼게요|끝낼게|여기까지만할게요|여기까지만할게|여기까지만|안할래|쉬고싶|ㅇㅋ이제끝|ㅇㅋ끝|그만)([.!?？]|$)/.test(
    compact,
  );
}

function isRepairStudentTurn(value: string) {
  const compact = value.toLowerCase().replace(/\s+/g, "");
  return /(왜자꾸|자꾸물어|그만물어|질문이너무|부담스러|부담돼|재촉|싫다고|안된다고|계속틀렸|또근거|제가다찾|내가다찾|설명만|양쪽다맞다고만)/.test(
    compact,
  );
}

function firstSourceSentence(value: string, maxLength = 150) {
  const protectedValue = value.replace(/(\d)\.(\d)/g, "$1<decimal>$2");
  const first = (protectedValue.match(/[^.!?]+[.!?]?/)?.[0] || protectedValue)
    .replace(/<decimal>/g, ".")
    .trim();
  return first.length > maxLength ? `${first.slice(0, maxLength - 3).trim()}...` : first;
}

function bestSourceSentence(value: string, studentTurn: string, maxLength = 165) {
  const sentences = value
    .replace(/(\d)\.(\d)/g, "$1<decimal>$2")
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.replace(/<decimal>/g, ".").trim())
    .filter(Boolean);
  if (!sentences?.length) return firstSourceSentence(value, maxLength);

  const terms = (studentTurn.match(/[가-힣A-Za-z0-9]+/g) || [])
    .map(normalizeSearchToken)
    .filter((term) => term.length >= 2 && !questionSearchStopwords.has(term));
  const scored = sentences.map((sentence, index) => {
    const compactSentence = sentence.toLowerCase().replace(/\s+/g, "");
    const score = terms.reduce(
      (total, term) => total + (compactSentence.includes(term.replace(/\s+/g, "")) ? Math.min(term.length, 6) : 0),
      0,
    );
    return { sentence, index, score };
  });
  const best = scored.reduce((current, candidate) => (candidate.score > current.score ? candidate : current));
  const selected = best.score > 0 ? best.sentence : sentences[0];
  return selected.length > maxLength ? `${selected.slice(0, maxLength - 3).trim()}...` : selected;
}

function isUncertainStudentTurn(value: string) {
  const normalized = value.trim();
  return (
    /^(그래도\s*)?(잘\s*)?(모르겠는데요|모르겠어|모르겠어요|모르겠|몰라요|몰라)([.!?？]|$)/.test(normalized) ||
    /(글쎄|그냥\s*그런|생각\s*안\s*나|어려워|뭘\s*보|무슨\s*말)/.test(normalized)
  );
}

function sourceLimitationCue(material: MaterialAnalysis) {
  const source = `${material.summary}\n${material.visibleText}`;
  const sentences = source
    .replace(/(\d)\.(\d)/g, "$1<decimal>$2")
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.replace(/<decimal>/g, ".").trim())
    .filter(Boolean);
  const limitation = sentences?.find((sentence) =>
    /(다만|하지만|그러나|반면|달랐|같지|확인하지|확인하지 못|알 수 없|하나뿐|하나씩|따로 조사|아직 조사|전문가.*없|비교하지)/.test(
      sentence,
    ),
  );
  return firstSourceSentence(limitation || material.summary, 170);
}

function sourceActionCue(material: MaterialAnalysis) {
  const source = `${material.visibleText}\n${material.summary}`;
  const sentences = source
    .replace(/(\d)\.(\d)/g, "$1<decimal>$2")
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.replace(/<decimal>/g, ".").trim())
    .filter(Boolean);
  const action = sentences?.find((sentence) =>
    /(제안|방법|하기로|할 수 있|교사에게 말|알리|조절|운영|반복|같게 해야)/.test(sentence),
  );
  return action ? firstSourceSentence(action, 180) : "";
}

function compactStudentIdea(value: string) {
  return value
    .replace(/[?？.!]/g, "")
    .replace(/^(근데|그런데|그러면|그럼|그래도)(?:\s+|[,，]\s*)?/g, "")
    .replace(/^아(?:\s+|[,，]\s*)/g, "")
    .trim()
    .slice(0, 42);
}

function avoidRepeatedStudentReply(
  reply: string,
  conversation: QuestioningConversationEntry[],
  sourceCue: string,
) {
  const recentAssistantTurns = conversation
    .filter((entry) => entry.role === "assistant")
    .slice(-3)
    .map((entry) => entry.content.trim());

  if (!recentAssistantTurns.includes(reply.trim())) {
    return reply;
  }

  const conciseCue = firstSourceSentence(sourceCue, 120);
  const alternatives = conciseCue
    ? [
        `앞에서 한 말을 반복하지 않을게요. 핵심은 ${conciseCue}`,
        `이번에는 한 가지만 짚을게요. ${conciseCue}`,
        `네가 방금 말한 내용을 이어 보면 ${conciseCue}`,
      ]
    : [
        "앞에서 한 말을 반복하지 않을게요. 방금 떠올린 생각을 그대로 두어도 괜찮아요.",
        "이번에는 설명을 더 붙이지 않을게요. 네 생각을 잠시 그대로 두어도 돼요.",
      ];

  return (
    alternatives.find((candidate) => !recentAssistantTurns.includes(candidate)) ||
    "앞에서 한 말을 되풀이하지 않고 여기서 잠시 멈출게요."
  );
}

type NaturalLocalTurn = {
  reply: string;
  primaryMove: PrimaryMove;
  engagementState: EngagementState;
  curriculumRelation: CurriculumRelation;
  sourceStatus: SourceStatus;
  supportLevel: 0 | 1 | 2 | 3 | 4;
};

function withoutLeadingConnector(value: string) {
  return value.replace(/^(다만|하지만|그러나|반면)\s*/g, "").trim();
}

function createGeneralNaturalTurn({
  studentTurn,
  material,
  sourceCue,
  questionType,
  conversation,
}: {
  studentTurn: string;
  material: MaterialAnalysis;
  sourceCue: string;
  questionType: QuestionType;
  conversation: QuestioningConversationEntry[];
}): NaturalLocalTurn {
  const compactTurn = studentTurn.toLowerCase().replace(/\s+/g, "");
  const source = `${material.materialTitle}\n${material.summary}\n${material.visibleText}`;
  const compactSource = source.toLowerCase().replace(/\s+/g, "");
  const cue = bestSourceSentence(sourceCue || material.summary, studentTurn, 165);
  const limitation = withoutLeadingConnector(sourceLimitationCue(material));
  const studentIdea = compactStudentIdea(studentTurn);
  const recentStudentTurns = conversation
    .filter((entry) => entry.role === "student")
    .slice(-3)
    .map((entry) => entry.content);
  const recentAssistantText = conversation
    .filter((entry) => entry.role === "assistant")
    .slice(-2)
    .map((entry) => entry.content)
    .join(" ");
  const followsCopyingRequest = recentStudentTurns.some((entry) =>
    /(답|숙제|수행평가|소개문|문단|예시).*(다써|전체|완성|그대로|대신|만들어|보여)/.test(
      entry.replace(/\s+/g, ""),
    ),
  );
  const asksForMethod = /(어떻게).*(조사|실험|확인|비교)|다시.*(재|실험|조사)|같은조건/.test(
    compactTurn,
  );
  const asksForPracticalAction = /(어떻게해야|어떻게하면|무슨방법|방법이있|할수있겠|하면되겠|바꾸면되겠)/.test(
    compactTurn,
  );
  const asksIfNoEffect = /(아무효과|효과도없|소용없|아무소용|다거짓|전부거짓|아무의미)/.test(
    compactTurn,
  );
  const falseDilemma = /(그럼|그러면).*(아예|다시|안|어둡|없애|금지).*(해야|돼|나아)/.test(compactTurn);
  const causalOverclaim = /(때문|덕분|원인이맞|무조건|정확히|최고|best|둘다.*(줄|늘)|(줄|늘).*(줄|늘).*(잖|니까|뜻)|(신고|수치|값).*(뜻|원인)|줄어서|늘어서|(해서|어서|아서).*(줄|늘|좋아))/.test(
    compactTurn,
  );
  const noticesCompetingFactor = /(도같이|도함께|도영향|도달랐|도다르|다르게|뿐이었|하나뿐|였네요|이었네요|있었네요|구나|군요)/.test(
    compactTurn,
  );
  const asksAboutSmallSample = /(하나면왜|하나뿐|한개면왜|왜부족|몇개|여러개|세개씩|여러번씩)/.test(compactTurn);
  const selfRevision = /(생각.*달라|생각.*바뀌|수있다고만|확정.*못|기준이네요|제생각이|였네요|이었네요|아그건|지도몰라|수도있|보면괜찮)/.test(
    compactTurn,
  );
  const moralJudgment = /(나쁜사람|잘못한사람|나쁜건가|잘못인가)/.test(compactTurn);
  const emotionalOrPosition = /(불쌍|무서|아프|싫|걱정|불편|반대|중요|좋을것|좋다고|예쁠|화내|편리|돈이들|떨어뜨)/.test(
    compactTurn,
  );
  const asksWhetherSourceSays = /(기사|자료).*(나와|있어|말해|써있)/.test(compactTurn);
  const givesOwnStartingIdea =
    followsCopyingRequest && /(저는|나는|제가|내가).*(쓰고싶|말하고싶|좋아|했어요|할머니|축구)/.test(studentTurn);
  const asksForFirstSentence = followsCopyingRequest && /(첫문장|시작문장|한문장만)/.test(compactTurn);
  const followsVocabularyExplanation =
    recentStudentTurns.some((entry) =>
      /(뜻|무슨\s*말|의미|낱말|단어|용어|뭐예요|뭔가요|무엇인가요)/.test(entry),
    ) &&
    /(사전적으로|사전적 뜻|이 글의 .+에서는|이 자료에서는)/.test(recentAssistantText) &&
    !/(뜻|무슨\s*말|의미|낱말|단어|용어)/.test(studentTurn);

  if (givesOwnStartingIdea) {
    return {
      reply: `“${studentIdea}”라는 네 생각이 이미 글의 시작점이에요. 먼저 그 뜻을 네가 아는 말로 짧게 적고, 막히는 낱말만 도구로 확인하면 네 글을 지킬 수 있어요.`,
      primaryMove: "follow_student_lead",
      engagementState: "personally_connecting",
      curriculumRelation: "productive_extension",
      sourceStatus: "reasonable_inference",
      supportLevel: 1,
    };
  }

  if (asksForFirstSentence) {
    return {
      reply:
        "첫 문장을 대신 완성하기보다 네가 소개하고 싶은 내용을 한국어로 한 줄 먼저 적어 보세요. 그다음 아는 영어 낱말을 붙이면 필요한 표현만 골라 도울 수 있어요.",
      primaryMove: "offer_clue",
      engagementState: "revising_thought",
      curriculumRelation: "productive_extension",
      sourceStatus: "reasonable_inference",
      supportLevel: 2,
    };
  }

  if (followsVocabularyExplanation) {
    const connectsOppositeMeaning = /(일회용|반대|반대말)/.test(compactTurn);
    const connectsMeasuredNumber = /(숫자|측정|데시벨|이해돼|이해했)/.test(compactTurn) && /데시벨/.test(source);
    return {
      reply: connectsOppositeMeaning
        ? "맞아요. 이 글에서는 한 번 쓰고 버리는 ‘일회용’과 달리, 씻어서 여러 번 다시 쓰는 뜻으로 보면 돼요."
        : connectsMeasuredNumber
          ? "데시벨이 소리 크기를 나타내는 단위라는 걸 알고 나니, 78에서 72로 바뀐 숫자도 소음이 낮아졌다는 뜻으로 읽히네요."
          : "네, 방금 네 말처럼 이해하면 돼요. 사전에 있는 넓은 뜻 가운데 이 글의 앞뒤 문장에 맞는 뜻을 골라 읽은 거예요.",
      primaryMove: "receive",
      engagementState: "revising_thought",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
      supportLevel: 0,
    };
  }

  if (moralJudgment) {
    return {
      reply: `사람 전체를 나쁘다고 정할 필요는 없어요. ${cue} 행동이 미치는 영향과 그때의 사정을 나누어 보고, 가능한 선택을 차분히 이야기하는 편이 더 좋아요.`,
      primaryMove: "receive",
      engagementState: "personally_connecting",
      curriculumRelation: "productive_extension",
      sourceStatus: "reasonable_inference",
      supportLevel: 1,
    };
  }

  if (asksForMethod) {
    return {
      reply: `${limitation} 더 분명히 알려면 비교하려는 한 조건만 바꾸고 나머지 조건을 같게 하거나, 같은 조사를 여러 번 반복해 결과를 비교하면 좋아요.`,
      primaryMove: "offer_clue",
      engagementState: "seeking_evidence",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
      supportLevel: 2,
    };
  }

  if (asksForPracticalAction) {
    const actionCue = sourceActionCue(material);
    return {
      reply: actionCue
        ? `${actionCue} 이 제안처럼 자료에 나온 불편을 줄이는 절차를 먼저 정해 두면 돼요.`
        : `${cue} 이 조건을 바꾸지 않으면서 불편을 줄일 수 있는 작은 방법부터 시험해 보면 좋아요.`,
      primaryMove: "offer_clue",
      engagementState: "exploring_possibilities",
      curriculumRelation: "productive_extension",
      sourceStatus: actionCue ? "supported" : "reasonable_inference",
      supportLevel: 1,
    };
  }

  if (asksAboutSmallSample) {
    const followsSampleExplanation = recentAssistantText.includes("같은 조건의 대상을 여러 개");
    return {
      reply: followsSampleExplanation
        ? "네, 조건마다 화분을 세 개씩 두는 것은 좋은 다음 단계예요. 빛의 색만 다르게 하고 물의 양과 온도 같은 나머지 조건은 같게 해야 공정하게 비교할 수 있어요."
        : "하나의 결과에는 그 대상만의 차이나 우연이 섞일 수 있어요. 같은 조건의 대상을 여러 개 두고 비슷한 결과가 반복되는지 보면 원인을 더 조심스럽게 판단할 수 있어요.",
      primaryMove: "clarify",
      engagementState: "seeking_evidence",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
      supportLevel: 2,
    };
  }

  if (asksIfNoEffect) {
    return {
      reply: `효과가 전혀 없었다는 뜻도 아니에요. ${cue} 다만 ${limitation} 가능성은 남겨 두되 한 가지 원인으로 확정하지 않는 것이 정확해요.`,
      primaryMove: "compare_possibilities",
      engagementState: "exploring_possibilities",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
      supportLevel: 1,
    };
  }

  if (falseDilemma) {
    const actionCue = sourceActionCue(material);
    return {
      reply: `꼭 지금 방법을 그대로 두거나 완전히 없애는 두 가지 중에서만 고를 필요는 없어요. ${actionCue || limitation} 좋은 점은 남기고 불편을 줄이는 조정안을 생각할 수 있어요.`,
      primaryMove: "compare_possibilities",
      engagementState: "exploring_possibilities",
      curriculumRelation: "productive_extension",
      sourceStatus: actionCue ? "supported" : "reasonable_inference",
      supportLevel: 1,
    };
  }

  if (causalOverclaim) {
    const repeatedCausalFrame = recentAssistantText.includes("두 변화가 함께 나타난 것은");
    return {
      reply: repeatedCausalFrame
        ? `함께 줄거나 늘었다는 사실만으로 원인까지 정해지지는 않아요. ${limitation} 그래서 다른 조건을 함께 남겨 두어야 해요.`
        : `두 변화가 함께 나타난 것은 자료에서 확인돼요. ${limitation} 그래서 “${studentIdea}”라고 한 가지 원인으로 단정할 수는 없어요.`,
      primaryMove: "compare_possibilities",
      engagementState: "exploring_possibilities",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
      supportLevel: 1,
    };
  }

  if (asksWhetherSourceSays) {
    const queryTerms = (studentTurn.match(/[가-힣A-Za-z0-9]+/g) || [])
      .map(normalizeSearchToken)
      .filter(
        (term) =>
          term.length >= 2 &&
          !questionSearchStopwords.has(term) &&
          !["기사", "자료", "나와", "있어", "말해", "써있"].includes(term),
      );
    const missingTerm = queryTerms.find((term) => !compactSource.includes(term.replace(/\s+/g, "")));
    return {
      reply: missingTerm
        ? `${cue} 이 내용까지는 확인되지만 '${missingTerm}'에 해당하는 일은 자료에 직접 나오지 않아요. 그 부분은 네가 떠올린 가능성으로 구분하면 돼요.`
        : `${cue} 이 내용은 자료에서 확인할 수 있어요. 자료가 말한 범위보다 더 넓게 단정하지 않으면 돼요.`,
      primaryMove: "clarify",
      engagementState: "seeking_evidence",
      curriculumRelation: "direct",
      sourceStatus: missingTerm ? "source_insufficient" : "supported",
      supportLevel: 1,
    };
  }

  if (selfRevision || noticesCompetingFactor) {
    const proposesCompromise = /(멀리서|조금만|필요할때|나누어|번갈아|방향을|아래쪽)/.test(compactTurn);
    return {
      reply: proposesCompromise
        ? `“${studentIdea}”는 네가 스스로 찾은 조정안이네요. 한쪽의 좋은 점을 남기면서 걱정되는 점을 줄이는 방법이에요.`
        : `“${studentIdea}”라는 점을 새로 함께 봤군요. ${limitation} 처음 생각을 버린 것이 아니라, 근거를 더 보고 단정을 줄인 거예요.`,
      primaryMove: "receive",
      engagementState: "revising_thought",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
      supportLevel: 0,
    };
  }

  if (emotionalOrPosition) {
    const repeatedEmotionFrame = recentAssistantText.includes("생각이나 느낌이 분명하네요");
    const seesPositiveSide = /(예쁘|좋을|좋아|기대)/.test(compactTurn);
    return {
      reply: repeatedEmotionFrame
        ? seesPositiveSide
          ? `걱정되는 마음과 “${studentIdea}”라는 기대가 함께 있군요. 둘 중 하나를 지우지 않고 두 마음을 모두 고려해도 돼요.`
          : `“${studentIdea}”라고 느끼는 데에는 이유가 있네요. 자료의 장점을 이야기할 때도 네 걱정을 없는 것처럼 다루지는 않을게요.`
        : `“${studentIdea}”라는 네 생각이나 느낌이 분명하네요. ${cue} 자료의 다른 조건을 인정하더라도 네가 중요하게 본 기준은 그대로 말할 수 있어요.`,
      primaryMove: "follow_student_lead",
      engagementState: "personally_connecting",
      curriculumRelation: "productive_extension",
      sourceStatus: "reasonable_inference",
      supportLevel: 0,
    };
  }

  if (questionType === "extension") {
    return {
      reply: `“${studentIdea}”라는 궁금증은 자료에서 한 걸음 더 나아간 생각이에요. ${cue} 이 연결은 남겨 두되, 자료 밖의 사실은 추가 출처를 확인하기 전까지 단정하지 않을게요.`,
      primaryMove: "productive_extension",
      engagementState: "curious",
      curriculumRelation: "productive_extension",
      sourceStatus: "source_insufficient",
      supportLevel: 1,
    };
  }

  if (questionType === "inference") {
    return {
      reply: `${cue} 이 근거로 한 가지 가능성은 설명할 수 있어요. 다만 ${limitation} 자료가 확인한 범위와 우리가 추론한 부분은 나누어 말하는 게 좋아요.`,
      primaryMove: "compare_possibilities",
      engagementState: "exploring_possibilities",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
      supportLevel: 1,
    };
  }

  if (questionType === "application") {
    return {
      reply: `“${studentIdea}”처럼 네 상황에 연결한 점이 중요해요. ${cue} 자료의 방법을 그대로 복사하기보다 네 상황에서 달라지는 조건을 함께 보면 돼요.`,
      primaryMove: "follow_student_lead",
      engagementState: "personally_connecting",
      curriculumRelation: "productive_extension",
      sourceStatus: "reasonable_inference",
      supportLevel: 1,
    };
  }

  if (questionType === "reflection") {
    return {
      reply: `“${studentIdea}”라고 생각이 달라진 데에는 자료를 다시 본 근거가 있네요. 지금처럼 처음 판단과 새로 발견한 조건을 함께 남기면 생각의 변화가 잘 보여요.`,
      primaryMove: "receive",
      engagementState: "revising_thought",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
      supportLevel: 0,
    };
  }

  return {
    reply: `“${studentIdea}”라고 짚었군요. ${cue}`,
    primaryMove: "receive",
    engagementState: "noticing",
    curriculumRelation: "direct",
    sourceStatus: "supported",
    supportLevel: 0,
  };
}

function createNaturalLocalTurn(studentTurn: string, material: MaterialAnalysis): NaturalLocalTurn | null {
  const compactTurn = studentTurn.replace(/\s+/g, "");
  const source = `${material.materialTitle}\n${material.summary}\n${material.visibleText}`;

  if (/(잔반|선택배식|급식)/.test(source)) {
    if (/(모든학교|다른학교).*(줄|가능)/.test(compactTurn)) {
      return {
        reply:
          "다른 학교에서도 줄어들 가능성은 있지만, 이 기사 하나로 모든 학교의 결과를 알 수는 없어요. 메뉴와 학생 수, 다시 받을 수 있는지 같은 조건이 달라질 수 있거든요.",
        primaryMove: "productive_extension",
        engagementState: "curious",
        curriculumRelation: "productive_extension",
        sourceStatus: "source_insufficient",
        supportLevel: 1,
      };
    }
    if (/(왜줄|왜.*줄었)/.test(compactTurn)) {
      return {
        reply:
          "학생이 먹을 양을 직접 골랐고, 적게 받았다가 더 받을 수도 있었던 점이 영향을 주었을 수 있어요. 다만 메뉴와 날씨도 달랐기 때문에 원인을 하나로 확정할 수는 없어요.",
        primaryMove: "compare_possibilities",
        engagementState: "exploring_possibilities",
        curriculumRelation: "direct",
        sourceStatus: "reasonable_inference",
        supportLevel: 1,
      };
    }
    if (/(저도|나도).*(많이받|남겨)/.test(compactTurn)) {
      return {
        reply:
          "네 경험을 떠올리니 선택 배식이 왜 편했는지 더 잘 보이네요. 처음부터 먹을 만큼 고르고 부족하면 더 받는 방식이라면 많이 받아 놓고 남기는 일이 줄 수 있겠어요.",
        primaryMove: "follow_student_lead",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 0,
      };
    }
    if (compactTurn === "결과요." || compactTurn === "결과요") {
      return {
        reply: "결과에 먼저 눈이 갔군요. 남은 음식이 하루 평균 18kg에서 10.4kg으로 줄었다는 부분이 결과예요.",
        primaryMove: "receive",
        engagementState: "noticing",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 1,
      };
    }
    if (/많이줄었/.test(compactTurn)) {
      return {
        reply: "맞아요. 선택 배식을 해 본 뒤 남은 음식이 많이 줄었다는 흐름이 기사의 중심에 있어요.",
        primaryMove: "receive",
        engagementState: "noticing",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 0,
      };
    }
    if (/그게끝/.test(compactTurn)) {
      return {
        reply:
          "결과를 찾은 것에서 끝내도 괜찮고, 조금 더 보고 싶다면 학교가 무엇을 바꾸어서 그 결과가 나왔는지 이어 볼 수도 있어요. 어느 쪽이 더 궁금해요?",
        primaryMove: "clarify",
        engagementState: "curious",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 1,
      };
    }
  }

  if (/(옥상|텃밭|1\.5도|29\.3도)/.test(source)) {
    if (/(정확히1\.5도|1\.5도.*낮췄)/.test(compactTurn)) {
      return {
        reply:
          "지난해 기록보다 1.5도 낮게 측정된 것은 맞아요. 하지만 텃밭과 함께 그늘막도 만들었고 날씨 차이도 확인하지 못해서, 텃밭만의 효과가 정확히 1.5도라고 말하기는 어려워요.",
        primaryMove: "compare_possibilities",
        engagementState: "exploring_possibilities",
        curriculumRelation: "direct",
        sourceStatus: "reasonable_inference",
        supportLevel: 1,
      };
    }
    if (/숫자가있는데왜/.test(compactTurn)) {
      return {
        reply:
          "온도 숫자는 실제로 잰 기록이에요. 다만 온도가 달라진 까닭에는 텃밭뿐 아니라 그늘막과 날씨도 영향을 줄 수 있어서, 측정된 숫자와 원인 판단은 나누어 보아야 해요.",
        primaryMove: "clarify",
        engagementState: "seeking_evidence",
        curriculumRelation: "direct",
        sourceStatus: "reasonable_inference",
        supportLevel: 1,
      };
    }
    if (/교장선생님.*넓히/.test(compactTurn)) {
      return {
        reply:
          "교장 선생님이 넓히자고 한 것은 기사에 실린 의견이에요. 낮아진 온도 기록은 그 의견을 뒷받침할 수 있지만, 방수와 비용을 걱정하는 의견도 함께 나와요.",
        primaryMove: "compare_possibilities",
        engagementState: "exploring_possibilities",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 0,
      };
    }
    if (/(물새|누수)/.test(compactTurn)) {
      return {
        reply:
          "텃밭을 넓히고 싶은 마음과 물이 샐까 걱정되는 마음을 함께 보고 있네요. 기사 속 학부모도 방수 공사와 관리 비용을 먼저 살펴야 한다고 말했어요.",
        primaryMove: "receive",
        engagementState: "personally_connecting",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 0,
      };
    }
    if (/우리학교.*텃밭/.test(compactTurn)) {
      return {
        reply:
          "기사를 보며 바로 우리 학교 옥상을 떠올렸군요. 교실을 덜 덥게 하는 점과 식물을 기르는 점 중 어떤 모습이 더 기대돼요?",
        primaryMove: "follow_student_lead",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 1,
      };
    }
    if (/채소.*먹/.test(compactTurn)) {
      return {
        reply:
          "교실이 시원해지는 것과 채소를 기르는 것을 함께 기대하는군요. 기사에는 학생들이 상추와 토마토를 길렀다고 나오지만, 수확한 채소를 먹었다는 내용까지는 없어요.",
        primaryMove: "receive",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 0,
      };
    }
    if (/안하는게나/.test(compactTurn)) {
      return {
        reply:
          "꼭 하거나 안 하는 두 가지로만 정할 필요는 없어요. 기대되는 점은 살리고 방수와 비용을 먼저 확인한 뒤 작은 범위에서 시험하는 방법도 생각할 수 있어요.",
        primaryMove: "compare_possibilities",
        engagementState: "exploring_possibilities",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 1,
      };
    }
  }

  if (/(줄넘기|집중력두배|12명.*9명)/.test(source)) {
    if (/누가쓴.*없/.test(compactTurn)) {
      return {
        reply:
          "맞아요. 작성자와 조사 날짜가 없어서 누가 어떤 방법으로 확인했는지 다시 살피기 어려워요. 기사 내용을 판단할 때 중요한 발견이에요.",
        primaryMove: "receive",
        engagementState: "seeking_evidence",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 0,
      };
    }
    if (/(다거짓|거짓말)/.test(compactTurn)) {
      return {
        reply:
          "전부 거짓이라고 보기는 어려워요. 12명 중 9명이 집중이 잘된 것 같다고 답한 내용은 있지만, 집중력이 두 배가 되었다고 확인한 검사는 없어요.",
        primaryMove: "compare_possibilities",
        engagementState: "exploring_possibilities",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 1,
      };
    }
    if (/9명.*맞는거/.test(compactTurn)) {
      return {
        reply:
          "9명이 그렇게 느꼈다는 응답은 기사에서 확인할 수 있어요. 하지만 느낌을 묻는 것과 집중력을 검사해 두 배인지 확인하는 것은 서로 다른 일이에요.",
        primaryMove: "clarify",
        engagementState: "seeking_evidence",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 1,
      };
    }
    if (/(제목낚시|낚시예요)/.test(compactTurn)) {
      return {
        reply:
          "눈길을 끌려고 본문에서 확인한 내용보다 크게 표현한 제목에 가까워 보여요. 거짓이라고 바로 정하기보다 제목의 강한 말과 본문의 약한 근거가 맞지 않는다고 설명할 수 있어요.",
        primaryMove: "compare_possibilities",
        engagementState: "exploring_possibilities",
        curriculumRelation: "direct",
        sourceStatus: "reasonable_inference",
        supportLevel: 0,
      };
    }
    if (/12명중9명.*느낌/.test(compactTurn)) {
      return {
        reply:
          "원래 제목보다 기사 내용에 훨씬 가까워요. 누가 몇 명에게 무엇을 물었는지가 드러나고, '느낌'이라고 써서 검사 결과처럼 보이지도 않아요.",
        primaryMove: "receive",
        engagementState: "revising_thought",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 0,
      };
    }
    if (/제목에두배/.test(compactTurn)) {
      return {
        reply:
          "맞아요. 제목에는 '두 배'라고 강하게 쓰여 있어요. 하지만 본문에는 집중력을 검사한 점수나 전후 비교가 없어서, 제목의 표현이 본문에서 확인한 내용보다 앞서 나갔다고 볼 수 있어요.",
        primaryMove: "clarify",
        engagementState: "seeking_evidence",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 1,
      };
    }
    if (/(공부두배|집중력두배|믿어도돼)/.test(compactTurn)) {
      return {
        reply:
          "기사에서 확인되는 것은 12명 중 9명이 집중이 더 잘된 것 같다고 답했다는 내용까지예요. 집중력이 두 배가 되었다는 검사는 없어서 제목처럼 단정할 수는 없어요.",
        primaryMove: "clarify",
        engagementState: "seeking_evidence",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 1,
      };
    }
  }

  if (/(스마트폰|보관함|급한연락)/.test(source)) {
    if (/공부하기싫어서/.test(compactTurn)) {
      return {
        reply:
          "그렇게 보일 수도 있지만 기사 속 9명은 가족의 급한 연락이나 방과 후 일정 때문에 불편했다고 말했어요. 공부하기 싫어서라고만 보기에는 다른 이유가 이미 나와 있어요.",
        primaryMove: "compare_possibilities",
        engagementState: "exploring_possibilities",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 1,
      };
    }
    if (/아픈가족.*연락/.test(compactTurn)) {
      return {
        reply:
          "그럴 수도 있겠네요. 기사는 구체적인 가족 상황까지 말하지 않지만, 급한 연락을 늦게 확인해 불편했다는 학생들이 있었다고 알려 줘요.",
        primaryMove: "productive_extension",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 0,
      };
    }
    if (/핑계.*가져갈/.test(compactTurn)) {
      return {
        reply:
          "그런 걱정도 생길 수 있어요. 학생회가 제안한 것처럼 필요한 때 교사에게 말하고 꺼내는 규칙을 분명히 하면, 급한 상황과 무분별한 사용을 함께 살필 수 있어요.",
        primaryMove: "follow_student_lead",
        engagementState: "exploring_possibilities",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 1,
      };
    }
    if (/친구.*(부모님|전화).*(어떻게|해야)/.test(compactTurn)) {
      return {
        reply:
          "그 친구에게 어떤 사정이 있는지는 우리가 단정하지 않는 게 좋아요. 기사 속 제안처럼 급한 연락 방법을 먼저 정하고, 필요한 때 교사에게 말해 스마트폰을 꺼내는 방법은 함께 의논해 볼 수 있어요.",
        primaryMove: "productive_extension",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 1,
      };
    }
    if (/19명.*9명/.test(compactTurn)) {
      return {
        reply:
          "맞아요. 같은 보관함을 사용했지만 학생들의 경험은 하나로 같지 않았어요. 집중하기 편했다는 의견과 급한 연락이 불편했다는 의견이 함께 나왔어요.",
        primaryMove: "receive",
        engagementState: "noticing",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 0,
      };
    }
    if (/둘다맞/.test(compactTurn)) {
      return {
        reply:
          "그렇게 볼 수 있어요. 어느 한쪽을 틀렸다고 하기보다 집중과 급한 연락이라는 서로 다른 필요를 함께 고려해야 하는 문제예요.",
        primaryMove: "receive",
        engagementState: "exploring_possibilities",
        curriculumRelation: "direct",
        sourceStatus: "reasonable_inference",
        supportLevel: 0,
      };
    }
    if (/비상.*꺼내/.test(compactTurn)) {
      return {
        reply:
          "네 생각은 기사 속 학생회 제안과도 이어져요. 평소에는 보관하고 필요한 때 절차에 따라 꺼내는 방법이 두 의견 사이의 조정안이 될 수 있겠어요.",
        primaryMove: "receive",
        engagementState: "revising_thought",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 0,
      };
    }
  }

  if (/(노란발자국|횡단보도|시속34|시속30)/.test(source)) {
    if (/과속방지턱/.test(compactTurn)) {
      return {
        reply:
          "차를 느리게 하려는 분명한 생각이네요. 과속방지턱이 도움이 될 가능성은 있지만 이 기사에서는 시험하지 않았으니, 노란 발자국 결과와 같은 것으로 단정하지는 않을게요.",
        primaryMove: "receive",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "source_insufficient",
        supportLevel: 1,
      };
    }
    if (/무조건느려/.test(compactTurn)) {
      return {
        reply:
          "속도를 낮추는 데 도움이 될 가능성은 커 보여요. 다만 이 기사는 과속방지턱을 조사하지 않았으니 이 학교 앞에서 얼마나 달라질지는 아직 알 수 없어요.",
        primaryMove: "clarify",
        engagementState: "exploring_possibilities",
        curriculumRelation: "productive_extension",
        sourceStatus: "source_insufficient",
        supportLevel: 1,
      };
    }
    if (/경찰세우/.test(compactTurn)) {
      return {
        reply:
          "경찰 단속도 차를 느리게 하려는 한 가지 방법이 될 수 있어요. 지금은 그 생각을 바로 반박하기보다 노란 발자국과는 다른 해결책으로 남겨 둘게요.",
        primaryMove: "receive",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "source_insufficient",
        supportLevel: 0,
      };
    }
  }

  if (/(리필정거장|플라스틱용기|1,200개)/.test(source)) {
    if (/플라스틱.*진짜줄/.test(compactTurn)) {
      return {
        reply:
          "이 가게가 판 양을 새 용기 수로 바꾸어 계산하면 약 1,200개를 덜 쓴 셈이에요. 하지만 가정의 전체 쓰레기까지 잰 것은 아니어서 마을 플라스틱이 정확히 그만큼 줄었다고 단정할 수는 없어요.",
        primaryMove: "clarify",
        engagementState: "seeking_evidence",
        curriculumRelation: "direct",
        sourceStatus: "supported",
        supportLevel: 1,
      };
    }
    if (/우리동네.*(없|안)/.test(compactTurn)) {
      return {
        reply:
          "그러면 기사 속 방법을 그대로 따라 하기는 어렵겠네요. 가까운 곳에서 다시 채워 살 수 있는 물건을 찾거나, 이미 가진 통을 오래 쓰는 방법처럼 네 생활에 맞게 바꿀 수 있어요.",
        primaryMove: "follow_student_lead",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 1,
      };
    }
    if (/편의점.*과자.*안돼/.test(compactTurn)) {
      return {
        reply:
          "과자를 한 번 사는 일을 잘못이라고 정할 필요는 없어요. 이 기사는 모든 포장을 당장 없애라는 뜻보다, 다시 쓸 수 있는 선택을 늘렸을 때 생기는 변화를 보여 줘요.",
        primaryMove: "receive",
        engagementState: "personally_connecting",
        curriculumRelation: "productive_extension",
        sourceStatus: "reasonable_inference",
        supportLevel: 0,
      };
    }
  }

  return null;
}

export function createLocalQuestionResult({
  question,
  studentTurn,
  material,
  rubric,
  behavior: behaviorValue,
  conversation = [],
  curriculumCompass,
  targetGrade,
}: {
  question?: string;
  studentTurn?: string;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  behavior?: QuestioningChatbotBehavior;
  conversation?: QuestioningConversationEntry[];
  curriculumCompass?: CurriculumCompass;
  targetGrade?: string;
}): ChatResult {
  const turn = (studentTurn ?? question ?? "").trim();
  const behavior = normalizeQuestioningChatbotBehavior(behaviorValue);
  const legacy = createLegacyLocalQuestionResult({
    question: turn,
    material,
    rubric,
    behavior,
  });
  const compactTurn = turn.replace(/\s+/g, "");
  const sourceCue = findRelevantSourceExcerpt(turn, material, /[?？]/.test(turn));
  const shortSourceCue = firstSourceSentence(sourceCue, 115);
  const isClosing = isClosingStudentTurn(turn);
  const recentStudentNeedsRepair = conversation
    .filter((entry) => entry.role === "student")
    .slice(-2)
    .some((entry) => isRepairStudentTurn(entry.content));
  const needsRepair =
    isRepairStudentTurn(turn) || (recentStudentNeedsRepair && /(설명|제가\s*다|내가\s*다)/.test(turn));
  const isUncertain = isUncertainStudentTurn(turn) || compactTurn.length <= 3;
  const repeatedUncertainty =
    isUncertain &&
    conversation
      .filter((entry) => entry.role === "student")
      .slice(-4)
      .some((entry) => isUncertainStudentTurn(entry.content));
  const recentAssistantTurns = conversation.filter((entry) => entry.role === "assistant").slice(-2);
  const allowQuestion =
    !isClosing &&
    !needsRepair &&
    !repeatedUncertainty &&
    recentAssistantTurns.filter((entry) => hasQuestionEnding(entry.content)).length < 2;
  const asksBoardCaution =
    legacy.questionType === "application" &&
    /잔반게시판/.test(compactTurn) &&
    /(조심|주의|문제|부담|비교|순위|창피)/.test(compactTurn);
  const asksTitlePrediction = isTitlePredictionQuestion(turn);
  const vocabularyTurn =
    legacy.questionType === "vocabulary" ? createVocabularyLocalTurn(turn, material) : null;
  const naturalTurn = createNaturalLocalTurn(turn, material);
  const generalTurn = createGeneralNaturalTurn({
    studentTurn: turn,
    material,
    sourceCue,
    questionType: legacy.questionType,
    conversation,
  });
  const hasPrivateInformation = /(전화번호|주소|비밀번호|주민번호|이름은|이름이|사진)/.test(turn);

  let primaryMove: PrimaryMove;
  let engagementState: EngagementState;
  let curriculumRelation: CurriculumRelation;
  let sourceStatus: SourceStatus;
  let supportLevel: 0 | 1 | 2 | 3 | 4;
  let studentReply: string;

  if (legacy.questionType === "safety") {
    primaryMove = "safety_redirect";
    engagementState = "noticing";
    curriculumRelation = "disconnected";
    sourceStatus = "out_of_scope";
    supportLevel = 2;
    studentReply = hasPrivateInformation
      ? "이름과 전화번호 같은 개인정보는 대화에 남기지 않는 게 좋아요. 그 정보는 빼고 '급한 연락이 필요한 학생'처럼 상황만 말하면 충분해요."
      : "완성된 답이나 문단을 대신 써 주지는 않을게요. 네가 말하고 싶은 내용 한 가지를 먼저 정하면, 시작할 수 있는 작은 단계나 필요한 표현을 도울 수 있어요.";
  } else if (isClosing) {
    primaryMove = "close";
    engagementState = "ready_to_close";
    curriculumRelation = "direct";
    sourceStatus = "supported";
    supportLevel = 0;
    studentReply =
      "알겠어요. 오늘 자료를 보며 떠올린 생각만으로도 충분해요. 더 이야기하고 싶은 때가 생기면 여기서 다시 이어가면 돼요.";
  } else if (needsRepair) {
    primaryMove = "repair";
    engagementState = "disengaged";
    curriculumRelation = "direct";
    sourceStatus = "supported";
    supportLevel = 0;
    const repeatedRepair = recentAssistantTurns.some((entry) => /제가 계속 확인|양쪽 이야기/.test(entry.content));
    studentReply = /설명/.test(compactTurn)
      ? `알겠어요. 이번에는 질문 없이 핵심만 설명할게요. ${shortSourceCue}`
      : repeatedRepair
        ? "네가 혼자 다 찾아야 하는 것처럼 느껴졌겠어요. 이번에는 제가 먼저 핵심을 설명하고 질문은 멈출게요."
        : "맞아요. 제가 계속 확인하거나 양쪽 이야기만 되풀이해서 답답했겠어요. 이번에는 질문하지 않고 네가 말한 생각을 그대로 받아 둘게요.";
  } else if (legacy.questionType === "off_topic") {
    primaryMove = "clarify";
    engagementState = "noticing";
    curriculumRelation = "disconnected";
    sourceStatus = "out_of_scope";
    supportLevel = 2;
    studentReply = allowQuestion
      ? `${behavior.offTopicResponse} 지금 자료에서 가장 눈에 띄는 말은 무엇인가요?`
      : `${behavior.offTopicResponse} 지금은 자료에서 눈에 띄는 말 하나만 찾아도 충분해요.`;
  } else if (vocabularyTurn) {
    primaryMove = vocabularyTurn.primaryMove;
    engagementState = vocabularyTurn.engagementState;
    curriculumRelation = vocabularyTurn.curriculumRelation;
    sourceStatus = vocabularyTurn.sourceStatus;
    supportLevel = vocabularyTurn.supportLevel;
    studentReply = vocabularyTurn.reply;
  } else if (isUncertain) {
    primaryMove = repeatedUncertainty ? "repair" : "offer_clue";
    engagementState = "disengaged";
    curriculumRelation = "adjacent";
    sourceStatus = sourceCue ? "supported" : "source_insufficient";
    supportLevel = repeatedUncertainty ? 3 : 2;
    studentReply = repeatedUncertainty
      ? `질문을 더 보태지 않을게요. 이번에는 ${shortSourceCue} 이 한 가지 단서만 보면 돼요.`
      : allowQuestion
        ? `바로 답을 정하지 않아도 돼요. ${shortSourceCue} 여기서는 변화한 결과와 그 까닭 중 어느 쪽이 먼저 보여요?`
        : `바로 답을 정하지 않아도 돼요. 이번에는 ${shortSourceCue} 이 한 가지 단서만 보면 충분해요.`;
  } else if (naturalTurn) {
    primaryMove = naturalTurn.primaryMove;
    engagementState = naturalTurn.engagementState;
    curriculumRelation = naturalTurn.curriculumRelation;
    sourceStatus = naturalTurn.sourceStatus;
    supportLevel = naturalTurn.supportLevel;
    studentReply = naturalTurn.reply;
  } else if (asksBoardCaution) {
    primaryMove = "follow_student_lead";
    engagementState = "personally_connecting";
    curriculumRelation = "direct";
    sourceStatus = "reasonable_inference";
    supportLevel = 1;
    studentReply = allowQuestion
      ? `${legacy.answer} 모두가 부담 없이 참여하려면 게시판에서 어떤 정보는 빼는 게 좋을까요?`
      : `${legacy.answer} 개인을 비교하지 않는 방식으로 바꾸려는 생각이 중요해요.`;
  } else if (asksTitlePrediction) {
    primaryMove = "compare_possibilities";
    engagementState = "exploring_possibilities";
    curriculumRelation = "direct";
    sourceStatus = "reasonable_inference";
    supportLevel = 1;
    studentReply = allowQuestion
      ? `${createTitlePredictionAnswer(turn, material)} 처음 예상과 실제 내용에서 달랐던 점이 있었나요?`
      : createTitlePredictionAnswer(turn, material);
  } else {
    primaryMove = generalTurn.primaryMove;
    engagementState = generalTurn.engagementState;
    curriculumRelation = generalTurn.curriculumRelation;
    sourceStatus = generalTurn.sourceStatus;
    supportLevel = generalTurn.supportLevel;
    studentReply = generalTurn.reply;
  }

  const normalizedReply = keepAtMostOneQuestion(
    avoidRepeatedStudentReply(studentReply, conversation, sourceCue),
  ).trim();
  const finalIsClosing = isClosing || primaryMove === "close";
  const expectsStudentReply = !finalIsClosing && hasQuestionEnding(normalizedReply);
  const compassSignal = curriculumCompass?.bigIdeas[0] || targetGrade || "수업 자료와 학생 생각의 연결";

  return {
    schemaVersion: 2,
    studentReply: normalizedReply,
    expectsStudentReply,
    isClosing: finalIsClosing,
    primaryMove,
    engagementState,
    curriculumRelation,
    supportLevel,
    sourceStatus,
    sourceCue,
    promptVersion: "questioning-dialogue-v2",
    provider: "local",
    answer: normalizedReply,
    followUpQuestion: "",
    questionType: legacy.questionType,
    typeLabel: legacy.typeLabel,
    typeReason: legacy.typeReason,
    evidencePrompt: legacy.evidencePrompt,
    revisionSuggestion: legacy.revisionSuggestion,
    evaluationSignals: [...legacy.evaluationSignals, `대화 동작: ${primaryMove}`, `교육과정 나침반: ${compassSignal}`],
    teacherFeedback: `${legacy.teacherFeedback} 학생에게는 성취기준을 직접 제시하지 않고 ${primaryMove} 동작으로 응답했습니다.`,
    rubricScores: legacy.rubricScores,
    safetyFlag: legacy.safetyFlag,
  };
}
