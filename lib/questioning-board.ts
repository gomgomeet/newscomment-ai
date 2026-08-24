export type QuestionType =
  | "fact"
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
  questionType: Extract<QuestionType, "fact" | "inference" | "application" | "extension" | "reflection">;
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
  keyConcepts: string[];
  possibleMisconceptions: string[];
  questionSeeds: string[];
  sourceLimit: string;
  safetyNotice: string;
};

export type QuestionClassifierKeywords = {
  safety: string[];
  off_topic: string[];
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

export type ChatResult = {
  answer: string;
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
  result?: ChatResult;
};

export type QuestioningChatbotConfig = {
  targetGrade: string;
  subjectUnit: string;
  standard: string;
  assessmentAnalysis?: StandardAssessmentAnalysis;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  behavior: QuestioningChatbotBehavior;
  prdText: string;
  updatedAt: string;
};

export const QUESTIONING_CHATBOT_CONFIG_KEY = "questioning-chatbot-config";
export const QUESTIONING_AI_SETTINGS_KEY = "questioning-ai-settings";

export type QuestioningAiSettings = {
  provider: "gemini";
  apiKey: string;
  model: string;
};

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
      "대필",
      "그대로 써",
      "전체 정답",
      "숙제 해",
    ],
    off_topic: ["게임", "연예인", "날씨", "주식"],
    reflection: ["내 질문", "내 생각", "고칠", "좋은 질문", "배운 점", "성찰"],
    extension: ["더 알아", "추가", "관련", "다른 예", "비슷한 사례", "배경", "확장", "조사"],
    application: ["우리", "나라면", "실천", "해결", "적용", "다른 상황"],
    inference: ["왜", "어떻게", "까닭", "원인", "의미", "결과"],
  },
  offTopicResponse:
    "수업 내용과 관련된 질문에 대해서만 응답할 수 있어요. 자료 속 장면·문장·표현과 연결해 다시 질문해 보세요.",
  insufficientQuestionResponse:
    "말해 준 내용을 잘 들었어요. 자료에서 연결되는 대상이나 장면을 하나 골라 조금 더 자세히 이야기해 볼까요?",
  additionalInstructions:
    "학생의 질문이나 응답을 먼저 구체적으로 받아 주고 자료와 연결해 대화한다. 질문 종류를 설명하지 말고, 자연스러운 후속 질문 하나로 학생이 스스로 더 분명하고 깊은 질문을 만들도록 돕는다.",
};

export function createDefaultQuestioningChatbotBehavior(): QuestioningChatbotBehavior {
  return {
    ...defaultQuestioningChatbotBehavior,
    classifierKeywords: {
      safety: [...defaultQuestioningChatbotBehavior.classifierKeywords.safety],
      off_topic: [...defaultQuestioningChatbotBehavior.classifierKeywords.off_topic],
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

  return {
    classifierKeywords: {
      safety: normalizeKeywordList(keywords.safety, fallback.classifierKeywords.safety),
      off_topic: normalizeKeywordList(keywords.off_topic, fallback.classifierKeywords.off_topic),
      reflection: normalizeKeywordList(keywords.reflection, fallback.classifierKeywords.reflection),
      extension: normalizeKeywordList(keywords.extension, fallback.classifierKeywords.extension),
      application: normalizeKeywordList(keywords.application, fallback.classifierKeywords.application),
      inference: normalizeKeywordList(keywords.inference, fallback.classifierKeywords.inference),
    },
    offTopicResponse: normalizeBehaviorText(behavior.offTopicResponse, fallback.offTopicResponse, 500),
    insufficientQuestionResponse:
      insufficientQuestionResponse ===
      "좋은 출발이에요. 자료의 어느 부분과 연결되는지 한 단어만 더 넣어 질문을 구체적으로 바꾸어 보세요."
        ? fallback.insufficientQuestionResponse
        : insufficientQuestionResponse,
    additionalInstructions:
      additionalInstructions ===
        "학생 질문을 비판하지 말고 응원과 힌트를 제공하며, 답을 자료에서 다시 확인하도록 안내한다." ||
      additionalInstructions ===
        "학생 질문에 먼저 자료를 근거로 직접 답하고, 자연스러운 후속 질문 하나로 대화를 이어 간다. 질문 유형과 개선 제안은 답변 뒤에 보조 정보로 제공한다."
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
    "제목: 급식실 남은 음식, 석 달 만에 절반으로\n핵심 사실: 푸른초등학교는 학생들이 먹을 반찬 양을 직접 고르는 선택제를 운영했다.\n핵심 사실: 학생들은 '조금, 보통, 많이' 중 먹을 양을 고르고 학급별 잔반 무게를 게시판에서 확인했다.\n수치 변화: 예전에는 하루에 큰 통 세 통이 넘는 잔반이 나왔지만, 변화 후 한 통 반으로 줄었다.\n학생 반응: 4학년 학생은 먹을 만큼만 받으니 다 먹게 되고, 다 먹으면 기분도 좋다고 말했다.\n학교 계획: 영양교사는 버리는 음식이 줄어든 만큼 아낀 돈으로 과일 후식을 늘릴 계획이라고 했다.\n전문가 관점: 잔반 줄이기는 학교만의 일이 아니라 음식, 노동, 자원, 지구 환경을 지키는 실천과 연결된다.",
  keyConcepts: [
    "급식 잔반",
    "반찬 양 선택제",
    "잔반 게시판",
    "식습관 변화",
    "음식물 쓰레기",
    "자원 절약과 환경 보호",
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
  sourceLimit:
    "수업자가 제공한 기사 이미지에서 확인할 수 있는 급식 잔반, 반찬 양 선택제, 잔반 게시판, 식습관 변화, 음식물 쓰레기와 환경 보호에 연결된 질문에만 답합니다.",
  safetyNotice: "학생 이름, 학급별 실제 잔반 순위, 개인 식사량 등 개인정보나 민감한 비교 정보는 입력하지 않습니다.",
};

export function createDefaultQuestioningLessonMaterial(): MaterialAnalysis {
  return {
    ...defaultQuestioningLessonMaterial,
    keyConcepts: [...defaultQuestioningLessonMaterial.keyConcepts],
    possibleMisconceptions: [...defaultQuestioningLessonMaterial.possibleMisconceptions],
    questionSeeds: [...defaultQuestioningLessonMaterial.questionSeeds],
  };
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
    keyConcepts: [],
    possibleMisconceptions: [],
    questionSeeds: [],
    sourceLimit: "교사가 입력하거나 AI가 분석한 수업 자료 범위 안에서만 답합니다.",
    safetyNotice: "학생 이름, 연락처, 사진 속 식별 정보 등 개인정보는 입력하지 않습니다.",
  };
}

export function classifyQuestionLocally(
  question: string,
  behaviorValue?: QuestioningChatbotBehavior,
): QuestionType {
  const normalized = question.toLowerCase();
  const behavior = normalizeQuestioningChatbotBehavior(behaviorValue);
  const keywords = behavior.classifierKeywords;

  if (keywords.safety.some((signal) => normalized.includes(signal.toLowerCase()))) {
    return "safety";
  }

  if (keywords.off_topic.some((signal) => normalized.includes(signal.toLowerCase()))) {
    return "off_topic";
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
  const source = material.visibleText.trim() || material.summary.trim();
  if (!source) {
    return "교사가 입력한 질문 자료에서 관련 내용을 확인해 보세요.";
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
      (paragraph.match(/[^.!?]+[.!?]?/g) || [paragraph]).map((sentence, sentenceIndex) => ({
        paragraphIndex,
        sentenceIndex,
        text: sentence.trim(),
      })),
    )
    .filter((segment) => segment.text.length >= 8);

  if (!segments.length) {
    return source.slice(0, 280);
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

export function createLocalQuestionResult({
  question,
  material,
  rubric,
  behavior: behaviorValue,
}: {
  question: string;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  behavior?: QuestioningChatbotBehavior;
}): ChatResult {
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
        "이 질문에는 개인정보나 정답 대필 요청이 섞여 있을 수 있어요. 이름, 연락처, 사진 속 개인 정보는 빼고, 자료에서 확인할 수 있는 내용이나 내 질문을 고치는 방향으로 다시 물어보세요.",
      followUpQuestion: "개인정보를 뺀 뒤, 질문 자료에서 정말 궁금한 내용을 다시 물어볼까요?",
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
      followUpQuestion: "질문 자료에서 가장 궁금한 장면이나 내용을 하나 골라 질문해 볼까요?",
      questionType,
      typeLabel,
      typeReason: "수업 자료 요약과 직접 연결되지 않는 질문으로 보입니다.",
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

  if (questionType === "extension") {
    return {
      answer:
        "질문 자료에는 직접 나오지 않지만 수업 내용과 이어지는 궁금증이에요. 현재 로컬 모드에서는 실시간 리서치 출처를 확인할 수 없으니, 자료와 연결되는 부분을 짚고 신뢰할 수 있는 추가 자료로 함께 확인해 보세요.",
      followUpQuestion: "질문 자료의 어느 내용에서 이 궁금증이 생겼나요?",
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
    inference: "왜 그렇게 생각하는지 묻고, 근거가 될 단서를 함께 찾는 질문으로 바꿔 보세요.",
    application: "우리 반, 우리 학교, 다른 상황처럼 적용할 조건을 구체적으로 넣어 보세요.",
    extension: "수업 자료와 어떤 부분이 연결되는지 먼저 쓰고, 추가로 확인할 출처나 자료를 함께 적어 보세요.",
    reflection: "내 질문이 자료 근거와 연결되는지, 무엇을 더 확인해야 하는지 돌아보는 문장으로 다시 써 보세요.",
    off_topic: "자료 속 특정 부분과 연결해 다시 질문해 보세요.",
    safety: "개인정보와 대필 요청을 빼고 다시 질문해 보세요.",
  };

  const answerByType: Record<Extract<QuestionType, "fact" | "inference" | "application" | "reflection">, string> = {
    fact: `질문 자료에서 바로 확인되는 내용은 다음과 같아요. ${sourceExcerpt}`,
    inference: `질문 자료의 단서를 연결해 보면 이렇게 답할 수 있어요. ${sourceExcerpt} 이 내용은 질문에서 묻는 이유나 결과를 판단하는 핵심 단서예요.`,
    application: `질문 자료에서 적용 방법을 생각할 때 참고할 내용은 다음과 같아요. ${sourceExcerpt} 이 방법을 우리 상황에 맞게 바꾸어 볼 수 있어요.`,
    reflection: `내 질문과 이해를 돌아볼 때 먼저 확인할 내용은 다음과 같아요. ${sourceExcerpt}`,
  };
  const followUpByType: Record<Extract<QuestionType, "fact" | "inference" | "application" | "reflection">, string> = {
    fact: "이 사실을 알고 나니 한 단계 더 궁금해진 점은 무엇인가요?",
    inference: "그렇게 생각한 까닭을 자료의 한 장면과 연결해 말해 볼까요?",
    application: "이 방법을 우리 반이나 학교에 적용한다면 가장 먼저 무엇을 해 볼 수 있을까요?",
    reflection: "이제 새롭게 궁금해진 점을 한 문장으로 말해 볼까요?",
  };
  const answer = answerByType[questionType];
  const followUpQuestion = needsMoreDetail
    ? "좋은 시작이에요. 질문 자료에서 궁금한 대상이나 장면을 하나 골라 조금 더 자세히 물어볼까요?"
    : followUpByType[questionType];

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
    teacherFeedback: "질문 유형을 확인한 뒤 자료 근거를 표시하고, 더 구체적인 질문으로 다시 쓰고 바꾸게 하세요.",
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
