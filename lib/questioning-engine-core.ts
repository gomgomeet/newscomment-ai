import {
  createLocalQuestionResult,
  normalizeQuestioningChatbotConfig,
  type ChatResult,
  type QuestioningChatbotConfig,
  type QuestioningConversationEntry,
} from "@/lib/questioning-board";
import {
  applyQuestioningConversationPhase,
  getQuestioningTurnMetadata,
} from "@/lib/questioning-conversation-phase";

export const QUESTIONING_ENGINE_FAMILY = "questioning-dialogue-v2";

const OFF_TOPIC_PATTERN = /(야구|축구|농구|게임|아이돌|유튜브|로또|드라마|영화|연예인|오늘\s*날씨|점심\s*(메뉴|추천)|배고파|졸려|심심해)/i;
const TOPIC_STOPWORDS = new Set([
  "그리고", "그러나", "하지만", "그래서", "때문에", "통해서", "대한", "위해",
  "있습니다", "합니다", "했습니다", "하는", "되는", "있는", "없는", "학생", "수업",
  "자료", "기사", "내용", "질문", "생각", "우리", "그것", "이것", "결과", "알려줘",
]);
const SOURCE_APPLICATION_PATTERN = /(?:이\s*(?:글|기사|자료)|글의\s*내용|기사\s*내용|수업\s*자료).{0,35}(?:소개|표현|만들|바꾸|정리|설명|전달|비교|연결)/i;
const TOPIC_SUFFIXES = [
  "이에요", "예요", "인가요", "에서는", "에서도", "이라는", "라는", "으로", "에서",
  "에게", "처럼", "보다", "하고", "해서", "은", "는", "이", "가", "을", "를", "도", "만", "와", "과", "의", "에", "로",
];

type QuestioningEngineTurn = {
  config: QuestioningChatbotConfig;
  question: string;
  conversation?: QuestioningConversationEntry[];
};

type QuestioningPolicyTurn = QuestioningEngineTurn & {
  result: ChatResult;
};

function normalizeTopicToken(value: string) {
  let token = value.trim().toLowerCase();
  let suffix = TOPIC_SUFFIXES.find((candidate) =>
    token.endsWith(candidate) && token.length - candidate.length >= 2
  );
  while (suffix) {
    token = token.slice(0, -suffix.length);
    suffix = TOPIC_SUFFIXES.find((candidate) =>
      token.endsWith(candidate) && token.length - candidate.length >= 2
    );
  }
  return token;
}

function isClearlyOffTopic(question: string, config: QuestioningChatbotConfig) {
  const offTopicMatch = question.match(OFF_TOPIC_PATTERN);
  const configuredSignal = config.behavior.classifierKeywords.off_topic.find((signal) =>
    signal.trim().length >= 2 && question.toLowerCase().includes(signal.trim().toLowerCase())
  );
  if (!offTopicMatch && !configuredSignal) return false;
  if (SOURCE_APPLICATION_PATTERN.test(question)) return false;
  const material = [
    config.material.materialTitle,
    config.material.summary,
    config.material.visibleText,
    ...config.material.keyConcepts,
  ].join(" ").replace(/\s+/g, "").toLowerCase();
  // 질문 전체를 대조하면 "축구 결과"의 공통어인 "결과" 하나만으로 수업 관련
  // 질문처럼 보일 수 있다. 감지된 이탈 주제 자체가 자료에 있을 때만 허용한다.
  const detectedTopic = (offTopicMatch?.[0] || configuredSignal || "")
    .replace(/(?:오늘|메뉴|추천)/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  if (detectedTopic && material.includes(detectedTopic)) return false;

  const hasMaterialContext = question
    .split(/[^가-힣A-Za-z0-9-]+/)
    .map(normalizeTopicToken)
    .filter((word) => word.length >= 2 && !TOPIC_STOPWORDS.has(word))
    .some((word) => material.includes(word));
  return !hasMaterialContext;
}

function enforceQuestioningTopicBoundary(
  result: ChatResult,
  question: string,
  config: QuestioningChatbotConfig,
  hasScoredManagedResponse: boolean,
) {
  if (
    hasScoredManagedResponse || !isClearlyOffTopic(question, config) ||
    result.safetyFlag || result.isClosing
  ) return result;
  const reply = "이 질문은 지금 수업자료와 관련이 적어요. 자료에서 궁금한 낱말이나 사실을 찾아 이야기해 주세요.";
  return {
    ...result,
    studentReply: reply,
    answer: reply,
    followUpQuestion: "",
    expectsStudentReply: false,
    primaryMove: "receive" as const,
    curriculumRelation: "disconnected" as const,
    sourceStatus: "out_of_scope" as const,
  };
}

/**
 * 웹 챗봇과 교사 배포앱이 함께 쓰는 로컬 대화 엔진 진입점입니다.
 * 공급자(Gemini/OpenAI)와 저장소(Notion/Google Sheet)는 이 바깥에서 달라질 수 있지만,
 * 수업자료·루브릭·대화 정책을 해석하는 순서는 한 곳에서 유지합니다.
 */
export function createQuestioningLocalBaseResult({
  config: rawConfig,
  question,
  conversation = [],
}: QuestioningEngineTurn) {
  const config = normalizeQuestioningChatbotConfig(rawConfig);
  const createBase = (behavior: QuestioningChatbotConfig["behavior"]) => createLocalQuestionResult({
    studentTurn: question,
    material: config.material,
    rubric: config.rubric,
    behavior,
    conversation,
    curriculumCompass: config.curriculumCompass,
    targetGrade: config.targetGrade,
  });
  const base = createBase(config.behavior);
  if (base.questionType !== "off_topic" || isClearlyOffTopic(question, config)) return base;

  // '게임도 미디어인가요?'처럼 분류기의 일반 이탈어가 자료의 상위 개념과
  // 연결되는 경우에는 해당 신호만 걷고 다시 분류한다. 자료 문맥 검사는 그대로 둔다.
  const normalizedQuestion = question.toLowerCase();
  return createBase({
    ...config.behavior,
    classifierKeywords: {
      ...config.behavior.classifierKeywords,
      off_topic: config.behavior.classifierKeywords.off_topic.filter((signal) =>
        !normalizedQuestion.includes(signal.trim().toLowerCase())
      ),
    },
  });
}

/** 모든 모델·로컬 응답에 동일한 1·2국면, 종료, 관리 질문 정책을 적용합니다. */
export function applyQuestioningSharedPolicy({
  config: rawConfig,
  result,
  question,
  conversation = [],
}: QuestioningPolicyTurn) {
  const config = normalizeQuestioningChatbotConfig(rawConfig);
  let phased = applyQuestioningConversationPhase({
    result,
    currentTurn: question,
    conversation,
    material: config.material,
    standard: config.standard,
    teacherMemo: config.material.questionFocusMemo,
  });
  const metadata = getQuestioningTurnMetadata({
    result: phased,
    currentTurn: question,
    conversation,
    material: config.material,
    standard: config.standard,
    teacherMemo: config.material.questionFocusMemo,
  });
  const hasScoredManagedResponse = metadata.responseScore !== null && metadata.responseScore > 0;
  if (
    hasScoredManagedResponse &&
    (phased.sourceStatus === "out_of_scope" || phased.questionType === "off_topic")
  ) {
    phased = {
      ...phased,
      questionType: "reflection",
      curriculumRelation: "direct",
      sourceStatus: "reasonable_inference",
    };
  }
  return enforceQuestioningTopicBoundary(phased, question, config, hasScoredManagedResponse);
}

/** 공급자 호출을 생략하는 턴과 경량앱 계획 생성에서 사용하는 완전한 공통 경로입니다. */
export function runQuestioningLocalEngine(input: QuestioningEngineTurn) {
  const config = normalizeQuestioningChatbotConfig(input.config);
  const result = createQuestioningLocalBaseResult({ ...input, config });
  return {
    config,
    result: applyQuestioningSharedPolicy({ ...input, config, result }),
  };
}
