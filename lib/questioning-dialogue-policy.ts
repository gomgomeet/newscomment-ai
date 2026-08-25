import type {
  CurriculumCompass,
  CurriculumRelation,
  EngagementState,
  MaterialAnalysis,
  PrimaryMove,
  QuestioningConversationEntry,
} from "@/lib/questioning-board";

export type DialoguePolicyInput = {
  studentTurn: string;
  recentConversation: QuestioningConversationEntry[];
  curriculumCompass: CurriculumCompass;
  material: MaterialAnalysis;
};

export type DialoguePolicyDecision = {
  likelyEngagementState: EngagementState;
  curriculumRelation: CurriculumRelation;
  allowedMoves: PrimaryMove[];
  maxSupportLevel: 0 | 1 | 2 | 3 | 4;
  allowQuestion: boolean;
  shouldClose: boolean;
  reason: string;
};

const repairPattern = /(왜\s*자꾸|자꾸\s*물어|그만\s*물어|질문이\s*너무|부담스러|부담돼|재촉|싫다고|안\s*된다고|계속\s*틀렸|또\s*근거|제가\s*다\s*찾|내가\s*다\s*찾|설명만|양쪽\s*다\s*맞다고만)/;
const privacyOrCopyingPattern = /(전화번호|주소|비밀번호|주민번호|사진|이름은|답\s*다\s*써|그대로\s*써|대필|수행평가\s*답|숙제\s*해|소개문.*(문단|전체|완성)|번역\s*앱처럼.*문단)/;
const personalConnectionPattern = /(우리|나는|내가|나라면|우리\s*반|우리\s*학교|경험|기분|느낌)/;
const curiosityPattern = /(왜|어떻게|궁금|혹시|다른|더\s*알|무슨|어떤)/;

function normalized(value: string) {
  return value.replace(/\s+/g, "");
}

function hasClosingSignal(value: string) {
  const compact = normalized(value.toLowerCase());
  return /(네|응|아|오케이|ㅇㅋ)?(이제)?(됐어요|됐어|알겠어요|알겠어|알겠음그만|알겠음|그만할래|그만할게요|그만할게|끝낼래|끝낼게요|끝낼게|여기까지만할게요|여기까지만할게|여기까지만|안할래|쉬고싶|ㅇㅋ이제끝|ㅇㅋ끝|그만)([.!?？]|$)/.test(
    compact,
  );
}

function hasUncertaintySignal(value: string) {
  const normalizedValue = value.trim();
  return (
    /^(그래도\s*)?(잘\s*)?(모르겠는데요|모르겠어|모르겠어요|모르겠|몰라요|몰라)([.!?？]|$)/.test(
      normalizedValue,
    ) || /(글쎄|그냥\s*그런|생각\s*안\s*나|어려워|뭘\s*보|무슨\s*말)/.test(normalizedValue)
  );
}

function recentStudentUncertainty(conversation: QuestioningConversationEntry[]) {
  return conversation
    .filter((entry) => entry.role === "student")
    .slice(-3)
    .filter((entry) => hasUncertaintySignal(entry.content)).length;
}

function recentAssistantQuestions(conversation: QuestioningConversationEntry[]) {
  return conversation
    .filter((entry) => entry.role === "assistant")
    .slice(-2)
    .filter((entry) => /[?？]\s*$/.test(entry.content)).length;
}

function isMaterialAdjacent(studentTurn: string, material: MaterialAnalysis, compass: CurriculumCompass) {
  const haystack = normalized(
    [
      material.materialTitle,
      material.summary,
      material.visibleText,
      ...material.keyConcepts,
      ...compass.worthwhileNoticing,
      ...compass.meaningfulExtensions,
    ].join(" "),
  );
  const terms = studentTurn
    .split(/[^가-힣A-Za-z0-9]+/)
    .map((term) => normalized(term))
    .filter((term) => term.length >= 2);

  return terms.some((term) => haystack.includes(term));
}

export function decideQuestioningDialoguePolicy({
  studentTurn,
  recentConversation,
  curriculumCompass,
  material,
}: DialoguePolicyInput): DialoguePolicyDecision {
  const compactTurn = normalized(studentTurn);
  const hasTwoRecentQuestions = recentAssistantQuestions(recentConversation) >= 2;

  if (privacyOrCopyingPattern.test(studentTurn)) {
    return {
      likelyEngagementState: "noticing",
      curriculumRelation: "disconnected",
      allowedMoves: ["safety_redirect"],
      maxSupportLevel: 2,
      allowQuestion: false,
      shouldClose: false,
      reason: "개인정보 또는 답안 대필 가능성이 있어 안전 전환만 허용합니다.",
    };
  }

  if (hasClosingSignal(studentTurn)) {
    return {
      likelyEngagementState: "ready_to_close",
      curriculumRelation: "direct",
      allowedMoves: ["close", "receive"],
      maxSupportLevel: 0,
      allowQuestion: false,
      shouldClose: true,
      reason: "학생이 충분함이나 종료 의사를 밝혀 질문 없이 마칩니다.",
    };
  }

  if (repairPattern.test(studentTurn)) {
    return {
      likelyEngagementState: "disengaged",
      curriculumRelation: "direct",
      allowedMoves: ["repair", "receive"],
      maxSupportLevel: 0,
      allowQuestion: false,
      shouldClose: false,
      reason: "학생이 대화 방식에 부담을 표현해 새 학습 과제보다 관계 회복을 우선합니다.",
    };
  }

  if (hasUncertaintySignal(studentTurn) || compactTurn.length <= 3) {
    const repeated = recentStudentUncertainty(recentConversation) >= 1;
    return {
      likelyEngagementState: "disengaged",
      curriculumRelation: "adjacent",
      allowedMoves: repeated ? ["repair", "offer_clue"] : ["offer_clue", "receive"],
      maxSupportLevel: repeated ? 3 : 2,
      allowQuestion: !repeated && !hasTwoRecentQuestions,
      shouldClose: false,
      reason: repeated
        ? "막힘이 반복되어 부담을 낮추고 구체적 단서나 선택지를 제공합니다."
        : "첫 막힘에는 자료 단서 하나와 최대 두 선택지만 제공합니다.",
    };
  }

  if (personalConnectionPattern.test(studentTurn)) {
    return {
      likelyEngagementState: "personally_connecting",
      curriculumRelation: "productive_extension",
      allowedMoves: ["follow_student_lead", "productive_extension", "receive"],
      maxSupportLevel: 1,
      allowQuestion: !hasTwoRecentQuestions,
      shouldClose: false,
      reason: "학생의 경험 연결을 성취기준으로 즉시 수렴시키지 않고 생산적 확장으로 이어 갑니다.",
    };
  }

  const adjacent = isMaterialAdjacent(studentTurn, material, curriculumCompass);
  if (!adjacent && curiosityPattern.test(studentTurn)) {
    return {
      likelyEngagementState: "curious",
      curriculumRelation: "productive_extension",
      allowedMoves: ["productive_extension", "clarify", "receive"],
      maxSupportLevel: 1,
      allowQuestion: !hasTwoRecentQuestions,
      shouldClose: false,
      reason: "자료에 직접 없는 호기심이지만 주제와 연결할 여지를 남깁니다.",
    };
  }

  return {
    likelyEngagementState: curiosityPattern.test(studentTurn) ? "curious" : "noticing",
    curriculumRelation: adjacent ? "direct" : "adjacent",
    allowedMoves: ["receive", "check_evidence", "compare_possibilities", "follow_student_lead"],
    maxSupportLevel: compactTurn.length > 28 ? 0 : 1,
    allowQuestion: !hasTwoRecentQuestions,
    shouldClose: false,
    reason: "학생 발화를 먼저 받아 주고 필요한 경우에만 자료 확인이나 가능성 비교를 사용합니다.",
  };
}
