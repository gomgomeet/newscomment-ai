export type QuestionType =
  | "fact"
  | "inference"
  | "application"
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

export type ChatEvaluation = {
  criterionKey: string;
  score: number;
  rationale: string;
};

export type ChatResult = {
  answer: string;
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
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  prdText: string;
  updatedAt: string;
};

export const QUESTIONING_CHATBOT_CONFIG_KEY = "questioning-chatbot-config";

export const standardOptions: StandardOption[] = [
  {
    id: "korean-evidence-reading",
    subject: "국어",
    gradeBand: "초등 5-6학년",
    title: "근거를 들어 읽기 자료 이해하기",
    standard:
      "글이나 자료를 읽고 중심 내용과 세부 정보를 파악하며, 자신의 생각을 근거를 들어 설명한다.",
    classroomGoal:
      "학생이 자료에서 확인한 사실을 바탕으로 질문을 만들고, 답의 근거를 자료 속에서 확인한다.",
  },
  {
    id: "social-problem-solving",
    subject: "사회",
    gradeBand: "초등 5-6학년",
    title: "사회 문제를 탐구하고 해결 방안 제안하기",
    standard:
      "생활 주변이나 사회에서 나타나는 문제의 원인과 영향을 자료를 바탕으로 파악하고 해결 방안을 제안한다.",
    classroomGoal:
      "학생이 자료 속 문제 상황을 확인하고, 원인 추론과 생활 속 적용 질문으로 확장한다.",
  },
  {
    id: "science-evidence-explanation",
    subject: "과학",
    gradeBand: "초등 5-6학년",
    title: "관찰 자료를 근거로 과학적 설명하기",
    standard:
      "관찰, 실험, 그림, 표 등의 자료를 바탕으로 자연 현상을 설명하고 자신의 설명을 근거와 연결한다.",
    classroomGoal:
      "학생이 관찰 자료에서 단서를 찾고, 현상의 까닭을 묻는 추론 질문을 만든다.",
  },
  {
    id: "english-reading-question",
    subject: "영어",
    gradeBand: "초등 5-6학년",
    title: "영어 읽기 자료에서 핵심 정보 질문하기",
    standard:
      "짧고 쉬운 글을 읽고 주요 내용과 세부 정보를 파악하며, 글의 내용에 관해 묻고 답한다.",
    classroomGoal:
      "학생이 영어 지문의 정보 확인 질문을 만들고, 근거가 되는 표현을 찾아 답을 확인한다.",
  },
];

export const questionTypeLabels: Record<QuestionType, string> = {
  fact: "사실 질문",
  inference: "추론 질문",
  application: "적용 질문",
  reflection: "성찰 질문",
  off_topic: "범위 밖 질문",
  safety: "안전 확인",
};

export function buildRubric(standard: string): RubricCriterion[] {
  const standardHint = standard.trim() || "선택한 성취기준";

  return [
    {
      key: "standard_material_alignment",
      label: "성취기준·자료 연결",
      description: `${standardHint}을 학생 질문과 자료 근거가 함께 겨냥하는지 봅니다.`,
      observableEvidence: "첫 질문, 근거 표시, 챗봇 답 확인 메모에서 성취기준의 핵심 행동이 드러나는가",
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
      observableEvidence: "사실·추론·적용·성찰 질문의 분류 기록과 수정된 질문",
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
      label: "질문 개선·성찰",
      description: "처음 질문을 더 명확하고 깊은 질문으로 고쳐 쓰고, 개선 이유를 설명하는지 봅니다.",
      observableEvidence: "처음 질문, 고친 질문, 왜 좋아졌는지 쓴 성찰 문장",
      feedbackForward: "고친 질문에는 자료 단서, 사고 동사, 다음 탐구 방향 중 적어도 하나를 더 넣게 합니다.",
      levels: [
        { score: 5, label: "탁월", descriptor: "질문을 의미 있게 고치고, 개선 이유와 다음 확인 지점을 설명합니다." },
        { score: 4, label: "우수", descriptor: "질문을 더 구체적으로 고치고 왜 좋아졌는지 간단히 설명합니다." },
        { score: 3, label: "도달", descriptor: "질문을 고쳐 쓰지만 개선 이유가 짧거나 일부만 드러납니다." },
        { score: 2, label: "부분 도달", descriptor: "표현만 조금 바꾸고 질문의 초점이나 깊이는 크게 달라지지 않습니다." },
        { score: 1, label: "시작", descriptor: "질문 수정이나 성찰이 매우 부족합니다." },
        { score: 0, label: "미제출", descriptor: "수정 질문 또는 성찰 기록이 없습니다." },
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

export function classifyQuestionLocally(question: string): QuestionType {
  const normalized = question.toLowerCase();
  const privacySignals = ["이름", "전화번호", "주소", "주민", "사진", "상담", "비밀번호"];
  const answerCopySignals = ["답 다 써", "대필", "그대로 써", "전체 정답", "숙제 해"];

  if (privacySignals.some((signal) => normalized.includes(signal)) || answerCopySignals.some((signal) => normalized.includes(signal))) {
    return "safety";
  }

  if (["급식", "게임", "연예인", "날씨", "주식"].some((signal) => normalized.includes(signal))) {
    return "off_topic";
  }

  if (["내 질문", "내 생각", "고칠", "좋은 질문", "배운 점", "성찰"].some((signal) => normalized.includes(signal))) {
    return "reflection";
  }

  if (["우리", "나라면", "실천", "해결", "적용", "다른 상황"].some((signal) => normalized.includes(signal))) {
    return "application";
  }

  if (["왜", "어떻게", "까닭", "원인", "의미", "결과"].some((signal) => normalized.includes(signal))) {
    return "inference";
  }

  return "fact";
}

export function createLocalQuestionResult({
  question,
  material,
  rubric,
}: {
  question: string;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
}): ChatResult {
  const questionType = classifyQuestionLocally(question);
  const typeLabel = questionTypeLabels[questionType];
  const summary =
    material.summary.length > 180 ? `${material.summary.slice(0, 180)}...` : material.summary;

  if (questionType === "safety") {
    return {
      answer:
        "이 질문에는 개인정보나 정답 대필 요청이 섞여 있을 수 있어요. 이름, 연락처, 사진 속 개인 정보는 빼고, 자료에서 확인할 수 있는 내용이나 내 질문을 고치는 방향으로 다시 물어보세요.",
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
      answer:
        "이 질문은 지금 입력된 수업 자료의 범위를 벗어나요. 이 챗봇은 교사가 넣은 자료를 바탕으로만 답할 수 있으니, 자료 속 장면·문장·표현과 연결해 다시 질문해 보세요.",
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

  const revisionByType: Record<QuestionType, string> = {
    fact: "자료 속 특정 문장이나 장면을 넣어 '무엇을 확인할 수 있나요?'로 더 분명하게 고쳐 보세요.",
    inference: "왜 그렇게 생각하는지 묻고, 근거가 될 단서를 함께 찾는 질문으로 고쳐 보세요.",
    application: "우리 반, 우리 학교, 다른 상황처럼 적용할 조건을 구체적으로 넣어 보세요.",
    reflection: "내 질문이 자료 근거와 연결되는지, 무엇을 더 확인해야 하는지 돌아보는 문장으로 고쳐 보세요.",
    off_topic: "자료 속 특정 부분과 연결해 다시 질문해 보세요.",
    safety: "개인정보와 대필 요청을 빼고 다시 질문해 보세요.",
  };

  return {
    answer: `자료 요약을 기준으로 보면 ${summary || "교사가 입력한 자료 범위"} 안에서 답을 확인해야 합니다. 챗봇 답을 그대로 믿기보다 자료의 문장, 장면, 표에서 근거를 다시 찾아보세요.`,
    questionType,
    typeLabel,
    typeReason: `${typeLabel}의 특징을 보이는 표현이 포함되어 있습니다.`,
    evidencePrompt: "자료의 어느 부분에서 이 답을 확인할 수 있나요? 근거가 되는 문장이나 장면을 표시해 보세요.",
    revisionSuggestion: revisionByType[questionType],
    evaluationSignals: ["질문 유형 확인", "자료 근거 확인 필요", "질문 수정 가능"],
    teacherFeedback: "질문 유형을 확인한 뒤 자료 근거를 표시하고, 더 구체적인 질문으로 고쳐 쓰게 하세요.",
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
