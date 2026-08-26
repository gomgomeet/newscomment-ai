import type {
  ChatEvaluation,
  ChatResult,
  MaterialAnalysis,
  QuestioningConversationEntry,
} from "@/lib/questioning-board";
import {
  buildStandardTargets,
  detectSignals,
  scoreBeyondTextQuestion,
  scoreComprehensionResponse,
  scoreOpinionResponse,
  scoreStandardResponse,
  type StandardTarget,
} from "@/lib/questioning-target-signals";

export const PHASE_B1_PROMPT = "혹시 지문에서 모르는 단어나 이해하기 어려운 문장이 있나요?";
export const PHASE_B2_PROMPT =
  "혹시 글에 대해서 질문하기가 어려우면 제가 질문해도 될까요? 제 질문에 대한 답을 지문에서 찾아보세요.";

const OPINION_PROMPT = "이 글을 읽고 어떤 생각이나 느낌이 들었어? 네 생각이 궁금해.";
const COMPREHENSION_MEDIUM_PROMPT =
  "글에서 가장 중요한 사실 한 가지를 찾아 자기 말로 말해 줄래요?";
const COMPREHENSION_HIGH_PROMPT =
  "글에 나온 결과와 그 까닭을 구분해서 말해 줄래요?";

type PhaseQuestionKind = "comprehension_medium" | "comprehension_followup" | "standard" | "opinion";
type Difficulty = "하" | "중" | "상";

type PhaseQuestion = {
  kind: PhaseQuestionKind;
  text: string;
  target?: StandardTarget;
  difficulty: Difficulty;
};

type TranscriptEntry = QuestioningConversationEntry & { current?: boolean };

const QUESTION_WORD = /(왜|어떻게|무엇|뭐|어디|언제|누가|누구|몇|얼마나|어느)/;
const QUESTION_REQUEST_END = /(?:나요|까요|건가요|거예요|뭐예요|뭔가요|무슨\s*뜻|알려\s*주세요|설명해\s*주세요)[.!]?$/;
const NON_QUESTION_STATE = /(모르|생각해|같아|느꼈|알겠|궁금한지\s*모르)[^?？]*[.!]?$/;
const BLOCKED_REQUEST = /(전화번호|주소|비밀번호|주민번호|실명|내\s*이름|제\s*이름|대신\s*써|정답\s*알려|숙제.*해\s*줘)/;
const OBVIOUS_OFF_TOPIC = /(게임|아이돌|유튜브|배고|졸려|심심|먹고\s*싶|놀고\s*싶)/;
const NO_DIFFICULTY = /^(없어요?|없습니다|괜찮아요?|아니요?|딱히\s*없어요?|모르겠어요?)[.\s!]*$/;
const SENTENCE_DIFFICULTY = /(이\s*문장|문장이|문장을|이\s*부분|이해하기\s*어려|어려워|무슨\s*말인지)/;

function passageText(material: MaterialAnalysis) {
  return material.visibleText.trim() || material.summary.trim();
}

function normalizeContentWord(word: string) {
  const normalized = word.toLowerCase();
  if (!/[가-힣]/.test(normalized)) return normalized;
  const stem = normalized.replace(
    /(?:으로부터|에게서|한테서|에서는|에서도|이라고|에게|한테|께서|으로|에는|에도|처럼|보다|까지|부터|만큼|조차|마저|라도|이나|라고|은|는|이|가|을|를|와|과|의|도|만|로)$/,
    "",
  );
  return stem.length >= 2 ? stem : normalized;
}

function contentWords(text: string) {
  return Array.from(
    new Set(
      text
        .split(/[^가-힣A-Za-z0-9]+/)
        .map((word) => normalizeContentWord(word.trim()))
        .filter((word) => word.length >= 2),
    ),
  );
}

function isStudentQuestion(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[?？]$/.test(trimmed) || QUESTION_REQUEST_END.test(trimmed)) return true;
  if (NON_QUESTION_STATE.test(trimmed)) return false;
  return QUESTION_WORD.test(trimmed) && /(됐어요|돼요|해요|예요|인가요|있나요|없나요)[.!]?$/.test(trimmed);
}

function lessonWords(material: MaterialAnalysis) {
  return [
    ...material.keyConcepts,
    ...(material.vocabulary || []).map((entry) => entry.term),
    ...contentWords(passageText(material)),
  ];
}

function hasLessonWord(text: string, material: MaterialAnalysis) {
  const compact = text.replace(/\s+/g, "");
  return lessonWords(material).some(
    (word) => word.length >= 2 && compact.includes(word.replace(/\s+/g, "")),
  );
}

function isCountableStudentQuestion(text: string, material: MaterialAnalysis) {
  if (!isStudentQuestion(text) || BLOCKED_REQUEST.test(text)) return false;
  return !OBVIOUS_OFF_TOPIC.test(text) || hasLessonWord(text, material);
}

function isPassageRelatedQuestion(text: string, material: MaterialAnalysis) {
  if (!isCountableStudentQuestion(text, material)) return false;
  if (/(뜻|의미|낱말|단어|문장|지문|글쓴이|주장|중심\s*생각|하고\s*싶은\s*말|왜\s*그렇게)/.test(text)) {
    return true;
  }
  return hasLessonWord(text, material);
}

function sourceSentences(material: MaterialAnalysis) {
  const text = passageText(material);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const headingKey = (value: string) => value.replace(/[^가-힣A-Za-z0-9]/g, "").toLowerCase();
  const firstLineKey = headingKey(lines[0] || "");
  const titleKey = headingKey(material.materialTitle || "");
  const firstLineIsTitle =
    lines.length > 1 &&
    titleKey.length >= 4 &&
    (firstLineKey === titleKey || firstLineKey.includes(titleKey) || titleKey.includes(firstLineKey));
  const sourceText = firstLineIsTitle ? lines.slice(1).join("\n") : text;
  return sourceText
    .replace(/(\d)\.(\d)/g, "$1<decimal>$2")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/<decimal>/g, ".").trim())
    .filter((sentence) => sentence.length >= 12 && !/[?？]$/.test(sentence));
}

function supportSentence(material: MaterialAnalysis) {
  return sourceSentences(material)[0] || material.summary.trim() || "지문의 첫 문장";
}

function comprehensionFollowup(material: MaterialAnalysis, difficulty: Difficulty) {
  if (difficulty === "상") return COMPREHENSION_HIGH_PROMPT;
  const sentence = supportSentence(material).replace(/[“”"]/g, "").slice(0, 150);
  return `자료의 “${sentence}”를 다시 봐요. 이 문장에 나온 사실 한 가지는 무엇인가요?`;
}

function classifyAssistantQuestion(text: string, targets: StandardTarget[]): PhaseQuestion | null {
  if (text.includes(COMPREHENSION_MEDIUM_PROMPT)) {
    return { kind: "comprehension_medium", text: COMPREHENSION_MEDIUM_PROMPT, difficulty: "중" };
  }
  if (text.includes(COMPREHENSION_HIGH_PROMPT)) {
    return { kind: "comprehension_followup", text: COMPREHENSION_HIGH_PROMPT, difficulty: "상" };
  }
  if (/자료의 “.+”를 다시 봐요\. 이 문장에 나온 사실 한 가지는 무엇인가요\?/.test(text)) {
    return { kind: "comprehension_followup", text, difficulty: "하" };
  }
  const target = targets.find((item) => text.includes(item.askTemplate));
  if (target) {
    return {
      kind: "standard",
      text: target.askTemplate,
      target,
      difficulty: text.includes("이 문장을 먼저 다시 보고") ? "하" : "상",
    };
  }
  if (text.includes(OPINION_PROMPT)) return { kind: "opinion", text: OPINION_PROMPT, difficulty: "중" };
  return null;
}

function phaseQuestionsIn(conversation: QuestioningConversationEntry[], targets: StandardTarget[]) {
  return conversation
    .filter((entry) => entry.role === "assistant")
    .map((entry) => classifyAssistantQuestion(entry.content, targets))
    .filter((question): question is PhaseQuestion => Boolean(question));
}

function lastAssistantQuestion(conversation: QuestioningConversationEntry[], targets: StandardTarget[]) {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const entry = conversation[index];
    if (entry.role !== "assistant") continue;
    return classifyAssistantQuestion(entry.content, targets);
  }
  return null;
}

function answerScore(
  question: PhaseQuestion,
  answer: string,
  material: MaterialAnalysis,
) {
  const signals = detectSignals({ answer, target: question.target, passage: passageText(material) });
  if (question.kind === "standard") return scoreStandardResponse(signals);
  if (question.kind === "opinion") {
    const normalized = answer.trim().replace(/[.!?？~]/g, "");
    if (/^(모르겠|몰라|글쎄|없어)/.test(normalized)) return 1;
    if (normalized && !/\s/.test(normalized)) return 2;
    return scoreOpinionResponse(signals);
  }
  return scoreComprehensionResponse(signals);
}

function nextPhaseQuestion({
  asked,
  lastQuestion,
  currentAnswer,
  targets,
  material,
}: {
  asked: PhaseQuestion[];
  lastQuestion: PhaseQuestion | null;
  currentAnswer: string;
  targets: StandardTarget[];
  material: MaterialAnalysis;
}): { question: PhaseQuestion | null; feedback: string } {
  if (asked.length === 0) {
    return {
      question: { kind: "comprehension_medium", text: COMPREHENSION_MEDIUM_PROMPT, difficulty: "중" },
      feedback: "",
    };
  }

  const currentScore = lastQuestion ? answerScore(lastQuestion, currentAnswer, material) : 0;
  const nextDifficulty: Difficulty = currentScore >= 3 ? "상" : "하";
  const lowFailureFeedback =
    lastQuestion?.difficulty === "하" && currentScore <= 2
      ? `여기에는 “${supportSentence(material).slice(0, 150)}”라고 나와 있어요. 이 문장에서 답을 찾을 수 있어요. `
      : "";

  if (!asked.some((question) => question.kind === "comprehension_followup")) {
    return {
      question: {
        kind: "comprehension_followup",
        text: comprehensionFollowup(material, nextDifficulty),
        difficulty: nextDifficulty,
      },
      feedback: lowFailureFeedback,
    };
  }

  const askedTargetKeys = new Set(
    asked.filter((question) => question.kind === "standard").map((question) => question.target?.key),
  );
  const nextTarget = targets.find((target) => !askedTargetKeys.has(target.key));
  if (nextTarget) {
    const targetText =
      nextDifficulty === "하"
        ? `자료의 “${supportSentence(material).slice(0, 150)}” 이 문장을 먼저 다시 보고 ${nextTarget.askTemplate}`
        : nextTarget.askTemplate;
    return {
      question: {
        kind: "standard",
        text: targetText,
        target: nextTarget,
        difficulty: nextDifficulty,
      },
      feedback: lowFailureFeedback,
    };
  }

  if (!asked.some((question) => question.kind === "opinion")) {
    return {
      question: { kind: "opinion", text: OPINION_PROMPT, difficulty: "중" },
      feedback: lowFailureFeedback,
    };
  }

  return { question: null, feedback: lowFailureFeedback };
}

function quotedOrMatchingSentence(turn: string, material: MaterialAnalysis) {
  const quoted = /[“‘"']([^”’"']{10,})[”’"']/.exec(turn)?.[1]?.trim();
  const candidates = sourceSentences(material);
  if (quoted) {
    const normalizedQuote = quoted.replace(/[^가-힣A-Za-z0-9]/g, "");
    const belongsToSource = candidates.some((sentence) => {
      const normalizedSentence = sentence.replace(/[^가-힣A-Za-z0-9]/g, "");
      return normalizedSentence.includes(normalizedQuote) || normalizedQuote.includes(normalizedSentence);
    });
    return belongsToSource ? quoted : undefined;
  }
  return candidates
    .sort((a, b) => b.length - a.length)
    .find((sentence) => turn.replace(/\s+/g, "").includes(sentence.replace(/\s+/g, "")));
}

function sameNumbers(source: string, changed: string) {
  return JSON.stringify(source.match(/\d+(?:[.,]\d+)*/g) || []) === JSON.stringify(changed.match(/\d+(?:[.,]\d+)*/g) || []);
}

export function paraphraseDifficultSentence(turn: string, material: MaterialAnalysis) {
  if (!SENTENCE_DIFFICULTY.test(turn)) return null;
  const source = quotedOrMatchingSentence(turn, material);
  if (!source) return null;

  let changed = source;
  for (const entry of material.vocabulary || []) {
    if (!changed.includes(entry.term)) continue;
    const meaning = (entry.contextualMeaning || entry.dictionaryMeaning).replace(/[.。]$/, "");
    changed = changed.replaceAll(entry.term, `${entry.term}(${meaning})`);
  }
  changed = changed
    .replace(/잠식하고\s*있/g, "조금씩 차지하고 있")
    .replace(/로\s*인해/g, "때문에")
    .replace(/에\s*의해/g, "때문에")
    .replace(/되었다/g, "됐어요")
    .replace(/하였다/g, "했어요");

  if (!sameNumbers(source, changed)) changed = source;
  const explanation =
    changed === source
      ? "내용을 바꾸면 뜻이 달라질 수 있어 원문을 그대로 함께 읽어 볼게요."
      : `이 문장은 이런 뜻이에요. ${changed}`;
  return `이 문장 말이지요. “${source}” ${explanation} 또 이해가 되지 않는 부분이 있을까요?`;
}

function transcriptWithCurrent(
  conversation: QuestioningConversationEntry[],
  currentTurn: string,
): TranscriptEntry[] {
  return [...conversation, { role: "student", content: currentTurn, current: true }];
}

function phaseOneEntries(transcript: TranscriptEntry[], targets: StandardTarget[]) {
  const firstPhaseAssistant = transcript.findIndex(
    (entry) =>
      entry.role === "assistant" &&
      (entry.content.includes(PHASE_B2_PROMPT) || Boolean(classifyAssistantQuestion(entry.content, targets))),
  );
  return firstPhaseAssistant < 0 ? transcript : transcript.slice(0, firstPhaseAssistant);
}

function phaseResponseScores(
  transcript: TranscriptEntry[],
  targets: StandardTarget[],
  material: MaterialAnalysis,
) {
  const scores: Array<{ kind: PhaseQuestionKind; score: number }> = [];
  for (let index = 1; index < transcript.length; index += 1) {
    const student = transcript[index];
    const assistant = transcript[index - 1];
    if (student.role !== "student" || assistant.role !== "assistant") continue;
    const question = classifyAssistantQuestion(assistant.content, targets);
    if (!question) continue;
    scores.push({ kind: question.kind, score: answerScore(question, student.content, material) });
  }
  return scores;
}

function levelLabel(score: number) {
  if (score >= 5) return "탁월";
  if (score === 4) return "우수";
  if (score === 3) return "도달";
  if (score === 2) return "부분 도달";
  if (score === 1) return "시작";
  return "관찰 전";
}

function evaluation(
  transcript: TranscriptEntry[],
  material: MaterialAnalysis,
  targets: StandardTarget[],
): ChatEvaluation[] {
  const phaseOne = phaseOneEntries(transcript, targets).filter((entry) => entry.role === "student");
  const countableQuestions = phaseOne.filter((entry) => isCountableStudentQuestion(entry.content, material));
  const relatedQuestions = phaseOne.filter((entry) => isPassageRelatedQuestion(entry.content, material));
  const beyondQuestions = countableQuestions.filter((entry) => !isPassageRelatedQuestion(entry.content, material));
  const b1Index = transcript.findIndex(
    (entry) => entry.role === "assistant" && entry.content.includes(PHASE_B1_PROMPT),
  );
  const questionsAfterB1 = b1Index < 0
    ? []
    : transcript
        .slice(b1Index + 1)
        .filter((entry) => entry.role === "student" && isCountableStudentQuestion(entry.content, material));
  let questioningScore = countableQuestions.length >= 5 ? 5 : countableQuestions.length === 4 ? 4 : countableQuestions.length >= 2 ? 3 : countableQuestions.length === 1 ? 2 : 0;
  if (countableQuestions.length === 1 && questionsAfterB1.length === 1) questioningScore = 1;

  const responses = phaseResponseScores(transcript, targets, material);
  const comprehensionResponse = Math.max(
    0,
    ...responses
      .filter((item) => item.kind === "comprehension_medium" || item.kind === "comprehension_followup")
      .map((item) => item.score),
  );
  const vocabularyQuestions = relatedQuestions.filter((entry) => /(뜻|의미|낱말|단어|용어)/.test(entry.content));
  const factOrRelationQuestions = relatedQuestions.filter((entry) => !/(뜻|의미|낱말|단어|용어)/.test(entry.content));
  let comprehensionScore = 0;
  if (factOrRelationQuestions.length > 0 && comprehensionResponse >= 4) comprehensionScore = 5;
  else if (comprehensionResponse >= 3) comprehensionScore = 4;
  else if (relatedQuestions.length > 0 && comprehensionResponse >= 2) comprehensionScore = 3;
  else if (vocabularyQuestions.length > 0) comprehensionScore = 2;
  else if (comprehensionResponse > 0) comprehensionScore = 1;

  const targetQuestions = countableQuestions.filter((entry) =>
    targets.some((target) => target.markers.test(entry.content)),
  );
  const standardResponse = Math.max(
    0,
    ...responses.filter((item) => item.kind === "standard").map((item) => item.score),
  );
  let standardScore = 0;
  if (targetQuestions.length >= 2 && standardResponse >= 3) standardScore = 5;
  else if (targetQuestions.length >= 1 && standardResponse >= 3) standardScore = 4;
  else if (standardResponse >= 3) standardScore = 3;
  else if (targetQuestions.length >= 1) standardScore = 2;
  else if (standardResponse > 0) standardScore = 1;

  const opinionScore = Math.max(
    0,
    ...responses.filter((item) => item.kind === "opinion").map((item) => item.score),
  );
  const beyondScore = Math.max(
    0,
    ...beyondQuestions.map((entry) =>
      scoreBeyondTextQuestion(detectSignals({ answer: entry.content, passage: passageText(material) })),
    ),
  );

  const make = (criterionKey: string, score: number, rationale: string): ChatEvaluation => ({
    criterionKey,
    score,
    rationale: `${score}점(${levelLabel(score)}) - ${rationale}`,
  });

  return [
    make("questioning", questioningScore, `스스로 만든 질문 ${countableQuestions.length}개를 관찰함`),
    make("passage_comprehension", comprehensionScore, `지문 관련 질문 ${relatedQuestions.length}개, 이해 응답 최고 ${comprehensionResponse}점`),
    make("achievement_standard", standardScore, `표적 질문 ${targetQuestions.length}개, 성취기준 응답 최고 ${standardResponse}점`),
    make("reflection_opinion", opinionScore, `생각·의견 응답 ${opinionScore > 0 ? "관찰함" : "아직 관찰하지 못함"}${beyondScore > 0 ? `, 더 알아볼 질문 신호 ${beyondScore}점` : ""}`),
  ];
}

function appendOneQuestion(baseReply: string, feedback: string, question: string) {
  const withoutQuestions = baseReply
    .replace(/[^.!?？]*[?？]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [withoutQuestions, feedback.trim(), question].filter(Boolean).join(" ").trim();
}

function withoutManagedPhasePrompts(reply: string) {
  const stripped = reply
    .replaceAll(PHASE_B1_PROMPT, "")
    .replaceAll(PHASE_B2_PROMPT, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || "말해 준 내용을 바탕으로 지문을 계속 살펴볼게요.";
}

export function applyQuestioningConversationPhase({
  result,
  currentTurn,
  conversation,
  material,
  standard,
  teacherMemo = "",
}: {
  result: ChatResult;
  currentTurn: string;
  conversation: QuestioningConversationEntry[];
  material: MaterialAnalysis;
  standard: string;
  teacherMemo?: string;
}): ChatResult {
  const targets = buildStandardTargets(standard, teacherMemo);
  const transcript = transcriptWithCurrent(conversation, currentTurn);
  const asked = phaseQuestionsIn(conversation, targets);
  const lastQuestion = lastAssistantQuestion(conversation, targets);
  const b1Used = conversation.some((entry) => entry.role === "assistant" && entry.content.includes(PHASE_B1_PROMPT));
  const b2Used = conversation.some((entry) => entry.role === "assistant" && entry.content.includes(PHASE_B2_PROMPT));
  const priorStudentTurns = conversation.filter((entry) => entry.role === "student");
  const currentPhaseOneQuestions = [...priorStudentTurns.map((entry) => entry.content), currentTurn].filter((turn) =>
    isPassageRelatedQuestion(turn, material),
  ).length;
  const protectedMove = result.isClosing || result.primaryMove === "repair" || result.primaryMove === "safety_redirect";
  const paraphrased = paraphraseDifficultSentence(currentTurn, material);

  // B1/B2는 이 판정기에서만 결정한다. 기본 생성기가 같은 문구를 우연히
  // 만들더라도 질문 수와 대화 순서를 확인하기 전에는 노출하지 않는다.
  let studentReply = withoutManagedPhasePrompts(result.studentReply);
  let primaryMove = result.primaryMove;
  let supportLevel = result.supportLevel;
  let enteredPhaseTwo = asked.length > 0 || b2Used || currentPhaseOneQuestions >= 4;

  if (paraphrased && !result.isClosing && result.primaryMove !== "safety_redirect") {
    studentReply = paraphrased;
    primaryMove = "offer_clue";
    supportLevel = 2;
  } else if (!protectedMove && conversation.at(-1)?.role === "assistant" && conversation.at(-1)?.content.includes(PHASE_B1_PROMPT)) {
    if (NO_DIFFICULTY.test(currentTurn)) {
      studentReply = PHASE_B2_PROMPT;
      primaryMove = "clarify";
      supportLevel = 1;
      enteredPhaseTwo = true;
    }
  } else if (!protectedMove && (asked.length > 0 || b2Used || currentPhaseOneQuestions >= 4)) {
    const next = nextPhaseQuestion({ asked, lastQuestion, currentAnswer: currentTurn, targets, material });
    if (next.question) {
      studentReply = appendOneQuestion(result.studentReply, next.feedback, next.question.text);
      primaryMove = next.question.kind === "opinion" ? "follow_student_lead" : "check_evidence";
      supportLevel = next.question.difficulty === "하" ? 3 : next.question.difficulty === "상" ? 1 : 2;
    } else if (lastQuestion?.kind === "opinion") {
      studentReply = appendOneQuestion(result.studentReply, "", "") ||
        "생각을 말해 줘서 고마워요. 여기까지 정리해도 충분해요.";
      primaryMove = "receive";
      supportLevel = 0;
    }
  } else if (
    !protectedMove &&
    !b1Used &&
    priorStudentTurns.length + 1 >= 3 &&
    currentPhaseOneQuestions <= 1
  ) {
    studentReply = appendOneQuestion(result.studentReply, "", PHASE_B1_PROMPT);
    primaryMove = "clarify";
    supportLevel = 1;
  }

  const normalizedReply = studentReply.replace(/\s+/g, " ").trim();
  const currentPhaseQuestion = classifyAssistantQuestion(normalizedReply, targets);
  const difficultyOrder: Difficulty[] = ["하", "중", "상"];
  const reachedDifficulty = [...asked, ...(currentPhaseQuestion ? [currentPhaseQuestion] : [])]
    .map((question) => question.difficulty)
    .sort((a, b) => difficultyOrder.indexOf(b) - difficultyOrder.indexOf(a))[0];
  const moreToExploreQuestions = phaseOneEntries(transcript, targets)
    .filter((entry) => entry.role === "student")
    .map((entry) => entry.content)
    .filter((turn) => isCountableStudentQuestion(turn, material) && !isPassageRelatedQuestion(turn, material));
  const rubricScores = evaluation(transcript, material, targets);
  if (currentPhaseQuestion?.kind === "opinion") {
    const opinion = rubricScores.find((score) => score.criterionKey === "reflection_opinion");
    if (opinion && opinion.score === 0) {
      opinion.score = 1;
      opinion.rationale = "1점(시작) - 생각·의견 질문을 물었고 학생 응답을 기다리는 중";
    }
  }
  return {
    ...result,
    studentReply: normalizedReply,
    answer: normalizedReply,
    primaryMove,
    supportLevel,
    expectsStudentReply: !result.isClosing && /[?？]/.test(normalizedReply),
    rubricScores,
    conversationPhase: enteredPhaseTwo ? 2 : 1,
    ...(reachedDifficulty ? { reachedDifficulty } : {}),
    moreToExploreQuestions,
  };
}
