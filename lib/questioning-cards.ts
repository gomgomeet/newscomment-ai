/**
 * 생각 카드 — 지식 단위 정의와 지역 생성기
 *
 * 생각 카드는 "AI가 미리 만든 답변 모음"이 아니라, 학생 질문에 답하기 위해 미리
 * 조사하고 구조화해 놓은 작은 지식 단위들의 네트워크다. 설계 근거는
 * docs/THINKING_CARD_KNOWLEDGE_BASE.md, 저장 구조는
 * supabase/migrations/004_questioning_thinking_cards.sql 참조.
 *
 * 이 파일이 만드는 카드는 **AI 없이 지문에서 기계적으로 뽑는 것**뿐이다. 배경·리서치·
 * 심화 카드는 Teacher AI 단계에서 붙는다. 여기서 지문에 없는 사실을 지어내지 않는다.
 */

import {
  simulateStudentQuestions,
  type SimulatedQuestion,
} from "./questioning-thinking-card";
import type { MaterialAnalysis } from "./questioning-board";

/** 카드 8종. DB의 card_type 검사 제약과 값이 같아야 한다. */
export type ThinkingCardType =
  | "vocabulary" // 낱말 뜻
  | "fact" // 지문에 그대로 있는 사실
  | "inference" // 지문 근거로 끌어낸 추론
  | "background" // 지문 이해에 필요한 배경 지식
  | "research" // 웹에서 찾아 출처를 밝힌 내용
  | "expected_question" // 학생이 물을 법한 질문 (라우터)
  | "extension" // 더 나아가는 질문거리
  | "dialogue_design"; // 교사 메모에서 나온 대화 설계

/** 이 정보가 어디서 왔는가. 답변에서 "지문 근거"와 "알려진 내용"을 가르는 기준. */
export type CardSourceType = "passage" | "inference" | "external" | "teacher" | "ai";

export type CardReasoningType =
  | "cause_effect"
  | "comparison"
  | "prediction"
  | "intention"
  | "generalization"
  | "evidence"
  | "problem_solution"
  | "sequence";

/** 승인 대기 상태가 아니라 출처 등급이다. 답변에서 이 순서로 우선한다. */
export type CardKnowledgeStatus =
  | "verified"
  | "researched"
  | "inferred"
  | "needs_review"
  | "outdated";

/** A 정부·국제기구·학술 / B 주요 언론·전문기관 / C 일반 웹 / D 미검증 */
export type CardSourceReliability = "A" | "B" | "C" | "D";

export type CardRelationType =
  | "supports"
  | "explains"
  | "extends"
  | "contrasts"
  | "answers"
  | "follows";

/**
 * 저장 전 카드 한 장. DB 컬럼과 1:1로 대응하되, 아직 uuid가 없으므로 카드끼리는
 * localId로 잇는다. 저장 계층이 uuid로 바꿔 준다.
 */
export type ThinkingCardDraft = {
  localId: string;
  cardType: ThinkingCardType;
  title: string;
  summary: string;
  content: string;

  sourceType: CardSourceType;
  /** 근거가 된 지문 문장 원문. 지어낸 카드와 구분하는 핵심 필드다. */
  sourceText: string;
  sourceLocation: string;

  reasoningType: CardReasoningType | null;
  /** 1.0 지문에 명확 / 0.8 근거 충분한 추론 / 0.6 여러 가능성 중 하나 / 0.4 확인 필요 */
  confidence: number;
  knowledgeStatus: CardKnowledgeStatus;

  /** 학년·난이도는 지문만으로는 알 수 없다. Teacher AI 단계에서 채운다. */
  studentLevel: string | null;
  difficulty: number | null;

  keywords: string[];
  relatedQuestions: string[];

  /** 예상질문카드 전용 — 답을 담지 않고 관련 카드로 잇는다. */
  questionIntent: string | null;
  relatedLocalIds: string[];

  /** 리서치카드 전용 */
  externalSourceUrl: string | null;
  externalSourceTitle: string | null;
  externalSourceOrganization: string | null;
  externalSourceDate: string | null;
  sourceReliability: CardSourceReliability | null;

  /** 대화설계카드 전용 — 언제(trigger) 무엇을(prompt) 왜(goal) */
  dialogueTrigger: string | null;
  dialoguePrompt: string | null;
  dialogueGoal: string | null;

  isEnabled: boolean;
};

export type CardRelationDraft = {
  fromLocalId: string;
  toLocalId: string;
  relationType: CardRelationType;
  note: string;
};

export type CardSet = {
  cards: ThinkingCardDraft[];
  relations: CardRelationDraft[];
};

/** 카드 한 장을 만들 때 반복되는 기본값. 나머지는 만드는 쪽에서 채운다. */
function draft(base: Partial<ThinkingCardDraft> & Pick<ThinkingCardDraft, "localId" | "cardType" | "title">): ThinkingCardDraft {
  return {
    summary: "",
    content: "",
    sourceType: "passage",
    sourceText: "",
    sourceLocation: "",
    reasoningType: null,
    confidence: 0.8,
    knowledgeStatus: "inferred",
    studentLevel: null,
    difficulty: null,
    keywords: [],
    relatedQuestions: [],
    questionIntent: null,
    relatedLocalIds: [],
    externalSourceUrl: null,
    externalSourceTitle: null,
    externalSourceOrganization: null,
    externalSourceDate: null,
    sourceReliability: null,
    dialogueTrigger: null,
    dialoguePrompt: null,
    dialogueGoal: null,
    isEnabled: true,
    ...base,
  };
}

const SENTENCE_SPLIT = /(?<=[.!?。])\s+|\n+/;

function splitSentences(value: string): string[] {
  return value
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8);
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

/** 뜻을 나르지 않는 조사·어미를 떼어 핵심어만 남긴다. */
const KEYWORD_TAIL = /(을|를|이|가|은|는|에|에서|으로|로|와|과|의|도|만|께|한테|에게|부터|까지)$/;
const KEYWORD_STOPWORDS = new Set([
  "그리고", "그래서", "하지만", "그러나", "따라서", "때문", "이런", "그런", "저런",
  "있다", "없다", "한다", "된다", "합니다", "됩니다", "것은", "것이", "수도", "우리",
]);

function extractKeywords(value: string, limit = 6): string[] {
  const found = value
    .split(/[\s,·]+/)
    .map((token) => token.replace(/[^가-힣A-Za-z0-9]/g, ""))
    .map((token) => (token.length > 2 ? token.replace(KEYWORD_TAIL, "") : token))
    .filter((token) => token.length >= 2 && !KEYWORD_STOPWORDS.has(token));
  return Array.from(new Set(found)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// 낱말 카드
// ---------------------------------------------------------------------------

/**
 * 어휘표를 낱말 카드로 옮긴다.
 *
 * 문맥 문장이 실제 본문에 있으면 지문 근거가 확인된 것이므로 verified로 둔다.
 * 없으면 교사가 손으로 적어 넣은 뜻일 수 있어 needs_review로 남긴다 — 확인하지
 * 않은 뜻이 학생에게 그대로 전달되는 것을 막기 위해서다.
 */
export function buildVocabularyCards(material: MaterialAnalysis): ThinkingCardDraft[] {
  const body = compact(material.visibleText ?? "");
  const entries = material.vocabulary ?? [];

  return entries
    .filter((entry) => entry.term.trim().length > 0)
    .map((entry, index) => {
      const term = entry.term.trim();
      const contextSentence = entry.contextSentence?.trim() ?? "";
      const groundedInBody = contextSentence.length > 0 && body.includes(compact(contextSentence));
      const contextual = entry.contextualMeaning?.trim() ?? "";

      return draft({
        localId: `vocabulary-${index}`,
        cardType: "vocabulary",
        title: term,
        summary: entry.dictionaryMeaning?.trim() ?? "",
        content: contextual ? `이 글에서는 ${contextual}` : "",
        sourceType: "passage",
        sourceText: contextSentence,
        sourceLocation: groundedInBody ? "본문" : "교사 입력 어휘표",
        confidence: groundedInBody ? 1 : 0.6,
        knowledgeStatus: groundedInBody ? "verified" : "needs_review",
        keywords: [term, ...extractKeywords(contextual, 3)],
        relatedQuestions: [`${term}이 무슨 뜻이에요?`],
      });
    });
}

// ---------------------------------------------------------------------------
// 사실 카드 · 추론 카드
// ---------------------------------------------------------------------------

/** 추론의 실마리가 되는 접속·연결 표현. 지문이 관계를 밝힌 자리다. */
const REASONING_MARKERS: Array<{ pattern: RegExp; type: CardReasoningType; label: string }> = [
  { pattern: /때문|덕분|탓에|(으)?로 인해|그래서|따라서|결과/, type: "cause_effect", label: "까닭과 결과" },
  { pattern: /보다|반면|그러나|하지만|에 비해|와 달리/, type: "comparison", label: "견주어 보기" },
  { pattern: /하면|한다면|될 것|예상|전망|앞으로/, type: "prediction", label: "앞일 내다보기" },
  { pattern: /위해|하려고|목적|취지/, type: "intention", label: "의도 살피기" },
  { pattern: /문제|해결|방안|대책/, type: "problem_solution", label: "문제와 해결" },
  { pattern: /먼저|다음|그 뒤|이어서|마지막/, type: "sequence", label: "차례 짚기" },
];

function findReasoning(sentence: string) {
  return REASONING_MARKERS.find((marker) => marker.pattern.test(sentence)) ?? null;
}

/**
 * 본문 문장을 사실 카드와 추론 카드로 나눈다.
 *
 * 연결 표현이 있는 문장은 추론 카드(관계를 읽어야 답할 수 있는 자리), 나머지 중
 * 핵심 개념이나 수치가 든 문장은 사실 카드로 삼는다. 어느 쪽이든 sourceText는
 * **본문 문장 원문 그대로**다. 지문에 없는 문장은 카드가 되지 않는다.
 */
export function buildPassageCards(material: MaterialAnalysis, limit = 8): {
  facts: ThinkingCardDraft[];
  inferences: ThinkingCardDraft[];
} {
  const sentences = splitSentences(material.visibleText ?? "");
  const concepts = (Array.isArray(material.keyConcepts) ? material.keyConcepts : [])
    .map((item) => compact(item))
    .filter((item) => item.length >= 2);

  const facts: ThinkingCardDraft[] = [];
  const inferences: ThinkingCardDraft[] = [];

  sentences.forEach((sentence, index) => {
    const location = `본문 ${index + 1}번째 문장`;
    const reasoning = findReasoning(sentence);

    if (reasoning) {
      inferences.push(
        draft({
          localId: `inference-${inferences.length}`,
          cardType: "inference",
          title: `${reasoning.label} — ${sentence.slice(0, 24)}`,
          summary: sentence.slice(0, 120),
          content: `지문은 이 문장에서 ${reasoning.label}를 드러냅니다. 학생에게는 근거 문장을 먼저 짚어 준 뒤 관계를 묻습니다.`,
          sourceType: "inference",
          sourceText: sentence,
          sourceLocation: location,
          reasoningType: reasoning.type,
          confidence: 0.8,
          knowledgeStatus: "inferred",
          keywords: extractKeywords(sentence),
        }),
      );
      return;
    }

    const compactSentence = compact(sentence);
    const carriesConcept = concepts.some((concept) => compactSentence.includes(concept));
    const carriesNumber = /\d/.test(sentence);
    if (!carriesConcept && !carriesNumber) return;

    facts.push(
      draft({
        localId: `fact-${facts.length}`,
        cardType: "fact",
        title: sentence.slice(0, 30),
        summary: sentence.slice(0, 120),
        content: sentence,
        sourceType: "passage",
        sourceText: sentence,
        sourceLocation: location,
        confidence: 1,
        knowledgeStatus: "verified",
        keywords: extractKeywords(sentence),
      }),
    );
  });

  return { facts: facts.slice(0, limit), inferences: inferences.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// 대화 설계 카드 (교사 메모)
// ---------------------------------------------------------------------------

/**
 * 메모에 담긴 수업 의도를 발문으로 옮길 때 쓰는 표. 메모의 표현을 그대로 발문으로
 * 쓰면 학생에게 어색해서, 흔한 의도마다 아이 눈높이의 기본 발문을 둔다.
 */
const MEMO_INTENTS: Array<{
  pattern: RegExp;
  trigger: string;
  prompt: string;
  goal: string;
}> = [
  {
    pattern: /제목|표제/,
    trigger: "대화를 시작할 때",
    prompt: "제목을 보고 궁금한 점이 있나요?",
    goal: "제목으로 내용을 예측하며 읽게 한다",
  },
  {
    pattern: /낱말|어휘|단어|뜻/,
    trigger: "학생이 낱말에서 막힐 때",
    prompt: "그 낱말이 이 글에서 어떤 뜻으로 쓰였을까요?",
    goal: "낱말 뜻을 문맥에서 짐작하게 한다",
  },
  {
    pattern: /까닭|이유|원인|왜/,
    trigger: "학생이 사실만 확인하고 멈출 때",
    prompt: "왜 그렇게 되었을지 글에서 찾아볼까요?",
    goal: "까닭을 지문 근거로 찾게 한다",
  },
  {
    pattern: /근거|증거|확인|정말/,
    trigger: "학생이 단정해서 말할 때",
    prompt: "그렇게 생각한 근거가 글의 어디에 있나요?",
    goal: "주장과 근거를 잇게 한다",
  },
  {
    pattern: /중심 ?생각|요약|간추/,
    trigger: "대화를 마무리할 때",
    prompt: "이 글에서 가장 중요한 생각은 무엇이었나요?",
    goal: "중심 생각을 파악하고 간추리게 한다",
  },
  {
    pattern: /경험|우리|생활|스스로/,
    trigger: "학생이 글 내용을 이해한 뒤",
    prompt: "이 글의 내용을 우리 생활에서 본 적이 있나요?",
    goal: "글과 자기 경험을 잇게 한다",
  },
  {
    pattern: /예측|예상|추론|짐작/,
    trigger: "글을 읽기 전이나 중간에",
    prompt: "다음에는 어떤 내용이 나올 것 같나요?",
    goal: "예측하며 읽고 확인하게 한다",
  },
];

/**
 * 교사 메모를 대화 설계 카드로 옮긴다. **메모 한 줄이 카드 한 장**이다.
 *
 * 메모를 발문으로 바꾸는 것은 해석이지 사실이 아니다. 그래서 카드는 만들되
 * needs_review로 남겨, 교사가 확인 화면에서 발문 문장을 직접 고칠 수 있게 한다.
 * 의도를 알아보지 못한 메모는 기본 발문 대신 메모를 그대로 목표에 담아 둔다.
 */
export function buildDialogueDesignCards(teacherMemo: string): ThinkingCardDraft[] {
  const lines = teacherMemo
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4);

  return lines.map((line, index) => {
    const intent = MEMO_INTENTS.find((item) => item.pattern.test(line)) ?? null;

    return draft({
      localId: `dialogue-${index}`,
      cardType: "dialogue_design",
      title: line.slice(0, 30),
      summary: intent ? intent.goal : "교사 메모에 담긴 수업 의도",
      content: line,
      sourceType: "teacher",
      sourceText: line,
      sourceLocation: "교사 메모",
      confidence: intent ? 0.8 : 0.6,
      // 메모 해석은 우리가 한 것이라 교사 확인이 필요하다.
      knowledgeStatus: "needs_review",
      keywords: extractKeywords(line),
      dialogueTrigger: intent ? intent.trigger : "대화 중 알맞은 때",
      dialoguePrompt: intent ? intent.prompt : "",
      dialogueGoal: intent ? intent.goal : line,
      // 의도를 알아보지 못한 메모는 발문이 비어 있다. 교사가 확인 화면에서 채우기
      // 전까지 꺼 두어, 빈 발문이 챗봇에 들어가지 않게 한다.
      isEnabled: Boolean(intent),
    });
  });
}

// ---------------------------------------------------------------------------
// 예상 질문 카드
// ---------------------------------------------------------------------------

/** 예상 질문의 근거 문장과 같은 문장을 쓰는 카드를 찾는다. */
function findCardBySourceText(cards: ThinkingCardDraft[], sourceText: string): ThinkingCardDraft | null {
  if (!sourceText.trim()) return null;
  const needle = compact(sourceText);
  return (
    cards.find((card) => {
      const haystack = compact(card.sourceText);
      return haystack.length > 0 && (haystack.includes(needle) || needle.includes(haystack));
    }) ?? null
  );
}

/**
 * 질문과 키워드가 가장 많이 겹치는 카드를 찾는다.
 *
 * 사실 확인 질문("글에서 알려 준 것은 무엇인가요?")처럼 근거 문장 한 줄로 좁혀지지
 * 않는 질문에만 쓴다. 모든 질문에 이 방법을 쓰면 지문이 답할 수 없는 질문까지
 * 낱말 하나가 겹친다는 이유로 "답할 수 있다"고 잘못 보고하게 된다.
 */
function findByKeywordOverlap(cards: ThinkingCardDraft[], question: string): ThinkingCardDraft | null {
  const asked = new Set(extractKeywords(question));
  if (asked.size === 0) return null;

  let best: ThinkingCardDraft | null = null;
  let bestScore = 0;
  cards.forEach((card) => {
    const score = card.keywords.filter((keyword) => asked.has(keyword)).length;
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  });
  return bestScore >= 1 ? best : null;
}

/** 질문에 낱말이 따옴표로 들어 있으면 그 낱말 카드가 곧 답이다. */
function findVocabularyCardForQuestion(
  cards: ThinkingCardDraft[],
  question: string,
): ThinkingCardDraft | null {
  const compactQuestion = compact(question);
  return (
    cards.find(
      (card) => card.cardType === "vocabulary" && compactQuestion.includes(compact(card.title)),
    ) ?? null
  );
}

/**
 * 질문 관점에 맞는 카드를 먼저 찾는다.
 *
 * 근거 문장만으로 잇면 까닭 질문이 "잔반이 줄었다"는 사실 카드에 붙는다. 사실은
 * 맞지만 까닭을 묻는 질문의 답이 아니다. 까닭 질문은 인과 추론 카드를, 낱말 질문은
 * 낱말 카드를 먼저 본다.
 */
function findAnswerCard(item: SimulatedQuestion, cards: ThinkingCardDraft[]): ThinkingCardDraft | null {
  if (item.lens === "vocabulary") {
    const vocabularyCard = findVocabularyCardForQuestion(cards, item.question);
    if (vocabularyCard) return vocabularyCard;
  }

  if (item.lens === "causal") {
    const causalCard = cards.find((card) => card.reasoningType === "cause_effect");
    if (causalCard) return causalCard;
  }

  if (item.lens === "literal") {
    const factCard = findByKeywordOverlap(
      cards.filter((card) => card.cardType === "fact"),
      item.question,
    );
    if (factCard) return factCard;
  }

  return findCardBySourceText(cards, item.evidenceSentence);
}

/**
 * 학생 관점 시뮬레이션 결과를 예상 질문 카드로 옮긴다.
 *
 * 이 카드는 답을 담지 않는다. 학생 질문이 들어오면 어느 카드를 봐야 하는지 알려 주는
 * 라우터다. 지문에서 근거를 찾지 못한 질문도 카드로 남기되 needs_review로 두어,
 * 배경·리서치 카드가 붙기 전까지는 답변에 쓰이지 않게 한다.
 */
export function buildExpectedQuestionCards(
  simulated: SimulatedQuestion[],
  answerCards: ThinkingCardDraft[],
): { cards: ThinkingCardDraft[]; relations: CardRelationDraft[] } {
  const cards: ThinkingCardDraft[] = [];
  const relations: CardRelationDraft[] = [];

  simulated.forEach((item, index) => {
    const localId = `question-${index}`;
    // 근거 문장을 못 찾은 질문도 낱말 카드로는 답할 수 있다. 그래서 answerableFromText만
    // 보고 거르지 않고, 관점에 맞는 카드가 있는지 먼저 찾는다.
    const linked = findAnswerCard(item, answerCards);

    cards.push(
      draft({
        localId,
        cardType: "expected_question",
        title: item.question,
        summary: `${item.lensLabel} 관점에서 나올 법한 질문`,
        content: item.teacherNote,
        sourceType: linked ? linked.sourceType : "inference",
        sourceText: linked ? linked.sourceText : item.evidenceSentence,
        sourceLocation: linked ? linked.sourceLocation : "",
        confidence: linked ? 0.8 : 0.4,
        knowledgeStatus: linked ? "inferred" : "needs_review",
        keywords: extractKeywords(item.question),
        questionIntent: item.lensLabel,
        relatedQuestions: [item.question],
        relatedLocalIds: linked ? [linked.localId] : [],
        // 답할 카드가 없는 질문은 켜 두면 챗봇이 막힌다.
        isEnabled: Boolean(linked),
      }),
    );

    if (linked) {
      relations.push({
        fromLocalId: linked.localId,
        toLocalId: localId,
        relationType: "answers",
        note: `${item.lensLabel} 질문의 근거 문장`,
      });
    }
  });

  return { cards, relations };
}

// ---------------------------------------------------------------------------
// 묶어 만들기
// ---------------------------------------------------------------------------

/** 낱말 카드가 설명해 주는 사실·추론 카드를 잇는다. */
function linkVocabulary(
  vocabularyCards: ThinkingCardDraft[],
  passageCards: ThinkingCardDraft[],
): CardRelationDraft[] {
  const relations: CardRelationDraft[] = [];
  vocabularyCards.forEach((vocabularyCard) => {
    const term = compact(vocabularyCard.title);
    if (term.length < 2) return;
    passageCards
      .filter((card) => compact(card.sourceText).includes(term))
      .slice(0, 3)
      .forEach((card) => {
        relations.push({
          fromLocalId: vocabularyCard.localId,
          toLocalId: card.localId,
          relationType: "explains",
          note: `'${vocabularyCard.title}'이 쓰인 문장`,
        });
      });
  });
  return relations;
}

/**
 * 지문 하나에서 AI 없이 만들 수 있는 카드를 모두 만든다.
 *
 * 배경·리서치·심화 카드는 여기서 만들지 않는다. 그것들은 지문 밖 지식이라
 * 웹 리서치가 필요하고, 출처 없이 만들면 지어낸 카드가 된다.
 */
export function buildLocalCardSet(material: MaterialAnalysis): CardSet {
  // 자료가 아직 비어 있으면 카드를 만들지 않는다. 근거 없는 예상 질문만 잔뜩
  // 저장해 두면 확인할 것만 늘고 답변에는 쓰이지 못한다.
  const hasMaterial =
    (material.visibleText ?? "").trim().length > 0 ||
    (material.summary ?? "").trim().length > 0 ||
    (material.questionFocusMemo ?? "").trim().length > 0;
  if (!hasMaterial) return { cards: [], relations: [] };

  const vocabularyCards = buildVocabularyCards(material);
  const { facts, inferences } = buildPassageCards(material);
  const dialogueCards = buildDialogueDesignCards(material.questionFocusMemo ?? "");

  const passageCards = [...facts, ...inferences];
  const questionResult = buildExpectedQuestionCards(simulateStudentQuestions(material), [
    ...vocabularyCards,
    ...passageCards,
  ]);

  return {
    cards: [...vocabularyCards, ...passageCards, ...dialogueCards, ...questionResult.cards],
    relations: [...linkVocabulary(vocabularyCards, passageCards), ...questionResult.relations],
  };
}

// ---------------------------------------------------------------------------
// AI 카드 붙이기
// ---------------------------------------------------------------------------

/**
 * 질문과 카드가 실제로 맞닿는지 본다.
 *
 * 카드가 "이 질문에 답해 준다"고 스스로 밝힌 것이 가장 확실한 신호다. 그것이 없으면
 * 핵심어가 **둘 이상** 겹칠 때만 인정한다. 하나만 겹쳐도 잇게 하면, 지문 주제어
 * 하나 때문에 아무 배경 카드나 아무 질문에 붙는다.
 */
function answersQuestion(card: ThinkingCardDraft, question: string): boolean {
  const compactQuestion = compact(question);

  const declared = card.relatedQuestions.some((candidate) => {
    const compactCandidate = compact(candidate);
    return (
      compactCandidate.length >= 6 &&
      (compactQuestion.includes(compactCandidate) || compactCandidate.includes(compactQuestion))
    );
  });
  if (declared) return true;

  const asked = new Set(extractKeywords(question));
  return card.keywords.filter((keyword) => asked.has(keyword)).length >= 2;
}

/**
 * Teacher AI가 만든 배경·리서치·심화 카드를 카드 묶음에 합친다.
 *
 * 합치기만 하는 것이 아니라, **지문으로 답할 수 없어 꺼 두었던 예상 질문**을 다시
 * 살펴본다. "우리 반에서도 해 보면?" 같은 질문은 지문이 답하지 못하지만 배경 카드는
 * 답할 수 있다. 그 카드를 찾으면 질문을 켠다 — 배경 지식을 붙이는 이유가 이것이다.
 *
 * 꺼진 채로 남은 질문은 여전히 아무도 답할 수 없는 질문이고, 교사가 학생과 함께
 * 확인할 몫으로 남는다.
 */
export function attachAiCards(cardSet: CardSet, aiCards: ThinkingCardDraft[]): CardSet {
  if (aiCards.length === 0) return cardSet;

  // 답변에 쓸 수 있는 AI 카드만 후보로 본다. 등급이 낮아 꺼 둔 리서치 카드로
  // 질문을 되살리면, 교사가 확인 화면에서 끄기도 전에 이미 쓰이게 된다.
  const usableAiCards = aiCards.filter((card) => card.isEnabled);
  const relations: CardRelationDraft[] = [];

  const cards = cardSet.cards.map((card) => {
    if (card.cardType !== "expected_question" || card.isEnabled) return card;

    const answer = usableAiCards.find((candidate) => answersQuestion(candidate, card.title));
    if (!answer) return card;

    relations.push({
      fromLocalId: answer.localId,
      toLocalId: card.localId,
      relationType: "answers",
      note: answer.cardType === "research" ? "웹에서 확인한 내용" : "배경 지식",
    });

    return {
      ...card,
      isEnabled: true,
      // 지문 밖 지식으로 답하는 질문이다. 지문 근거로 답하는 질문(0.8)보다 낮춰
      // 답변에서 지문 근거가 먼저 쓰이게 한다.
      confidence: 0.6,
      knowledgeStatus: answer.knowledgeStatus,
      relatedLocalIds: [...card.relatedLocalIds, answer.localId],
    };
  });

  return {
    cards: [...cards, ...aiCards],
    relations: [...cardSet.relations, ...relations],
  };
}

// ---------------------------------------------------------------------------
// 요약
// ---------------------------------------------------------------------------

export type CardSetSummary = {
  total: number;
  byType: Record<ThinkingCardType, number>;
  /** 답변에 바로 쓸 수 있는 카드 (켜져 있고 확인이 끝난 것) */
  usable: number;
  /**
   * 교사에게 한 번 물어야 하는 카드 — 확인 창을 띄울지 정하는 기준.
   *
   * 메모 해석과 리서치 결과만 들어간다. 낱말·사실·추론·예상 질문은 지문에서
   * 기계적으로 나오므로 승인 대상이 아니다. 여기에 그것들을 넣으면 확인 창이
   * 매번 떠서, 버튼을 하나로 합친 뜻이 무너진다.
   */
  needsConfirmation: ThinkingCardDraft[];
  /** 근거가 약해 답변에 쓰이지 않는 카드 수 — 화면에는 숫자로만 알린다. */
  weakCardCount: number;
};

const EMPTY_BY_TYPE: Record<ThinkingCardType, number> = {
  vocabulary: 0,
  fact: 0,
  inference: 0,
  background: 0,
  research: 0,
  expected_question: 0,
  extension: 0,
  dialogue_design: 0,
};

export function summarizeCardSet(cardSet: CardSet): CardSetSummary {
  const byType = { ...EMPTY_BY_TYPE };
  cardSet.cards.forEach((card) => {
    byType[card.cardType] += 1;
  });

  return {
    total: cardSet.cards.length,
    byType,
    usable: cardSet.cards.filter((card) => card.isEnabled && card.knowledgeStatus !== "needs_review").length,
    needsConfirmation: cardSet.cards.filter(
      (card) =>
        (card.cardType === "dialogue_design" || card.cardType === "research") &&
        card.knowledgeStatus === "needs_review",
    ),
    weakCardCount: cardSet.cards.filter(
      (card) =>
        card.cardType !== "dialogue_design" &&
        card.cardType !== "research" &&
        card.knowledgeStatus === "needs_review",
    ).length,
  };
}

/** 교사가 읽을 수 있게 카드 묶음을 한 줄로 요약한다. */
export function formatCardSetSummary(summary: CardSetSummary): string {
  const parts: Array<[ThinkingCardType, string]> = [
    ["vocabulary", "낱말"],
    ["fact", "사실"],
    ["inference", "추론"],
    ["background", "배경"],
    ["research", "리서치"],
    ["expected_question", "예상 질문"],
    ["extension", "심화"],
    ["dialogue_design", "대화 설계"],
  ];
  const counted = parts
    .filter(([type]) => summary.byType[type] > 0)
    .map(([type, label]) => `${label} ${summary.byType[type]}`)
    .join(" · ");
  return counted ? `생각 카드 ${summary.total}장 (${counted})` : "만들어진 생각 카드가 없습니다.";
}
