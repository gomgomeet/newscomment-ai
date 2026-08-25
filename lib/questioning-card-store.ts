import "server-only";

/**
 * 생각 카드 저장·조회
 *
 * 지금까지 생각 카드는 만들어지자마자 프롬프트 텍스트로 녹아 사라졌다. 이 계층이
 * 붙으면 카드가 표에 남아, 학생 질문이 들어왔을 때 필요한 카드만 찾아 쓸 수 있다.
 *
 * 학생 브라우저는 이 표들에 직접 접근하지 않는다. RLS를 켜고 service_role에만
 * 권한을 주었으므로(마이그레이션 004), 반드시 서버를 거친다.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CardRelationDraft,
  CardSet,
  ThinkingCardDraft,
} from "@/lib/questioning-cards";

export type SavedCard = ThinkingCardDraft & { id: string };

export type SavedDocument = {
  documentId: string;
  title: string;
  cards: SavedCard[];
};

export type SaveDocumentInput = {
  lessonCode?: string;
  title: string;
  bodyText: string;
  summary: string;
  targetGrade?: string;
  subjectUnit?: string;
  standard?: string;
  teacherMemo?: string;
  cardSet: CardSet;
};

export function isCardStorageConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

// ---------------------------------------------------------------------------
// 행 ↔ 카드
// ---------------------------------------------------------------------------

type CardRow = {
  id: string;
  card_type: string;
  title: string;
  summary: string;
  content: string;
  source_type: string;
  source_text: string;
  source_location: string;
  reasoning_type: string | null;
  confidence: number;
  knowledge_status: string;
  student_level: string | null;
  difficulty: number | null;
  keywords: string[];
  related_questions: string[];
  question_intent: string | null;
  related_card_ids: string[];
  external_source_url: string | null;
  external_source_title: string | null;
  external_source_organization: string | null;
  external_source_date: string | null;
  source_reliability: string | null;
  dialogue_trigger: string | null;
  dialogue_prompt: string | null;
  dialogue_goal: string | null;
  is_enabled: boolean;
};

const CARD_COLUMNS =
  "id, card_type, title, summary, content, source_type, source_text, source_location, reasoning_type, confidence, knowledge_status, student_level, difficulty, keywords, related_questions, question_intent, related_card_ids, external_source_url, external_source_title, external_source_organization, external_source_date, source_reliability, dialogue_trigger, dialogue_prompt, dialogue_goal, is_enabled";

function toCardRow(card: ThinkingCardDraft, documentId: string) {
  return {
    document_id: documentId,
    card_type: card.cardType,
    title: card.title,
    summary: card.summary,
    content: card.content,
    source_type: card.sourceType,
    source_text: card.sourceText,
    source_location: card.sourceLocation,
    reasoning_type: card.reasoningType,
    confidence: card.confidence,
    knowledge_status: card.knowledgeStatus,
    student_level: card.studentLevel,
    difficulty: card.difficulty,
    keywords: card.keywords,
    related_questions: card.relatedQuestions,
    question_intent: card.questionIntent,
    external_source_url: card.externalSourceUrl,
    external_source_title: card.externalSourceTitle,
    external_source_organization: card.externalSourceOrganization,
    external_source_date: card.externalSourceDate,
    source_reliability: card.sourceReliability,
    dialogue_trigger: card.dialogueTrigger,
    dialogue_prompt: card.dialoguePrompt,
    dialogue_goal: card.dialogueGoal,
    is_enabled: card.isEnabled,
  };
}

/**
 * 행을 카드로 되돌린다.
 *
 * `localId`에는 저장된 uuid를 넣는다. 저장하기 전의 임시 id(`fact-0` 같은 것)는
 * 문서마다 겹치므로 다시 쓰면 안 된다.
 */
function toCard(row: CardRow): SavedCard {
  return {
    id: row.id,
    localId: row.id,
    cardType: row.card_type as ThinkingCardDraft["cardType"],
    title: row.title,
    summary: row.summary,
    content: row.content,
    sourceType: row.source_type as ThinkingCardDraft["sourceType"],
    sourceText: row.source_text,
    sourceLocation: row.source_location,
    reasoningType: row.reasoning_type as ThinkingCardDraft["reasoningType"],
    confidence: Number(row.confidence),
    knowledgeStatus: row.knowledge_status as ThinkingCardDraft["knowledgeStatus"],
    studentLevel: row.student_level,
    difficulty: row.difficulty,
    keywords: row.keywords ?? [],
    relatedQuestions: row.related_questions ?? [],
    questionIntent: row.question_intent,
    relatedLocalIds: row.related_card_ids ?? [],
    externalSourceUrl: row.external_source_url,
    externalSourceTitle: row.external_source_title,
    externalSourceOrganization: row.external_source_organization,
    externalSourceDate: row.external_source_date,
    sourceReliability: row.source_reliability as ThinkingCardDraft["sourceReliability"],
    dialogueTrigger: row.dialogue_trigger,
    dialoguePrompt: row.dialogue_prompt,
    dialogueGoal: row.dialogue_goal,
    isEnabled: row.is_enabled,
  };
}

// ---------------------------------------------------------------------------
// 저장
// ---------------------------------------------------------------------------

/**
 * 지문과 카드를 함께 저장한다.
 *
 * 카드끼리의 연결(`relatedLocalIds`, relations)은 임시 id로 되어 있으므로, 카드를
 * 먼저 넣어 uuid를 받은 뒤 임시 id → uuid 표로 바꿔 다시 기록한다. 순서를 지키지
 * 않으면 없는 카드를 가리키는 연결이 남는다.
 *
 * ⑧을 다시 누르면 **새 지문 행이 생긴다.** 덮어쓰지 않는 것은 교사가 자료를 고쳐 가며
 * 여러 번 저장하기 때문이다 — 이전 판을 지워 버리면 되돌릴 수 없다. 챗봇은
 * `loadLatestDocumentId`로 가장 최근 것만 보므로 카드가 두 벌 쓰이지는 않는다.
 */
export async function saveDocumentWithCards(input: SaveDocumentInput): Promise<SavedDocument> {
  if (!isCardStorageConfigured()) {
    throw new Error("Supabase 저장소가 설정되어 있지 않습니다.");
  }
  if (!input.title.trim()) {
    throw new Error("지문 제목이 비어 있습니다.");
  }

  const supabase = createAdminClient();

  const { data: document, error: documentError } = await supabase
    .from("questioning_documents")
    .insert({
      lesson_code: input.lessonCode?.trim() || null,
      title: input.title.trim(),
      body_text: input.bodyText,
      summary: input.summary,
      target_grade: input.targetGrade?.trim() || null,
      subject_unit: input.subjectUnit?.trim() || null,
      standard: input.standard?.trim() || null,
      teacher_memo: input.teacherMemo ?? "",
    })
    .select("id, title")
    .single();

  if (documentError || !document) {
    throw new Error(`지문 저장 실패: ${documentError?.message ?? "알 수 없는 오류"}`);
  }

  const saved = await replaceCards(document.id, input.cardSet);
  return { documentId: document.id, title: document.title, cards: saved };
}

/** 지문에 딸린 카드를 통째로 갈아 끼운다. 연결은 카드가 지워질 때 함께 지워진다. */
export async function replaceCards(documentId: string, cardSet: CardSet): Promise<SavedCard[]> {
  const supabase = createAdminClient();

  const { error: deleteError } = await supabase
    .from("questioning_thinking_cards")
    .delete()
    .eq("document_id", documentId);
  if (deleteError) {
    throw new Error(`이전 카드 삭제 실패: ${deleteError.message}`);
  }

  if (cardSet.cards.length === 0) return [];

  const { data: rows, error: insertError } = await supabase
    .from("questioning_thinking_cards")
    .insert(cardSet.cards.map((card) => toCardRow(card, documentId)))
    .select(CARD_COLUMNS);

  if (insertError || !rows) {
    throw new Error(`카드 저장 실패: ${insertError?.message ?? "알 수 없는 오류"}`);
  }

  // insert는 보낸 순서대로 돌려주므로 임시 id와 uuid를 짝지을 수 있다.
  const idByLocalId = new Map<string, string>();
  cardSet.cards.forEach((card, index) => {
    const row = rows[index];
    if (row) idByLocalId.set(card.localId, row.id);
  });

  await linkCards(cardSet, idByLocalId);
  return (rows as CardRow[]).map(toCard);
}

/** 카드끼리의 연결을 uuid로 바꿔 기록한다. */
async function linkCards(cardSet: CardSet, idByLocalId: Map<string, string>) {
  const supabase = createAdminClient();

  const relatedUpdates = cardSet.cards
    .filter((card) => card.relatedLocalIds.length > 0)
    .map((card) => ({
      id: idByLocalId.get(card.localId),
      related: card.relatedLocalIds
        .map((localId) => idByLocalId.get(localId))
        .filter((value): value is string => Boolean(value)),
    }))
    .filter((entry) => entry.id && entry.related.length > 0);

  for (const entry of relatedUpdates) {
    const { error } = await supabase
      .from("questioning_thinking_cards")
      .update({ related_card_ids: entry.related })
      .eq("id", entry.id as string);
    if (error) {
      throw new Error(`카드 연결 기록 실패: ${error.message}`);
    }
  }

  const relationRows: Array<{
    from_card_id: string;
    to_card_id: string;
    relation_type: string;
    note: string;
  }> = [];

  cardSet.relations.forEach((relation: CardRelationDraft) => {
    const fromId = idByLocalId.get(relation.fromLocalId);
    const toId = idByLocalId.get(relation.toLocalId);
    // 저장되지 않은 카드를 가리키는 연결과 자기 자신으로 도는 연결은 버린다.
    if (!fromId || !toId || fromId === toId) return;
    relationRows.push({
      from_card_id: fromId,
      to_card_id: toId,
      relation_type: relation.relationType,
      note: relation.note,
    });
  });

  if (relationRows.length === 0) return;

  const { error } = await supabase.from("questioning_card_relations").insert(relationRows);
  if (error) {
    throw new Error(`카드 관계 저장 실패: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

/**
 * 지문의 카드를 읽는다.
 *
 * `enabledOnly`는 학생 답변에 쓸 때 켠다. 꺼진 카드는 교사가 확인 화면에서 껐거나
 * 근거가 모자라 자동으로 꺼진 것이라, 답변에 쓰이면 안 된다.
 */
export async function loadCards(
  documentId: string,
  options: { enabledOnly?: boolean } = {},
): Promise<SavedCard[]> {
  if (!isCardStorageConfigured()) {
    throw new Error("Supabase 저장소가 설정되어 있지 않습니다.");
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("questioning_thinking_cards")
    .select(CARD_COLUMNS)
    .eq("document_id", documentId);

  if (options.enabledOnly) {
    query = query.eq("is_enabled", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`카드 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as CardRow[]).map(toCard);
}

/** 수업 코드로 가장 최근 지문을 찾는다. 교사가 자료를 다시 올리면 새 지문이 된다. */
export async function loadLatestDocumentId(lessonCode: string): Promise<string | null> {
  if (!isCardStorageConfigured()) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("questioning_documents")
    .select("id")
    .eq("lesson_code", lessonCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`지문 조회 실패: ${error.message}`);
  }
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// 확인 화면 결과 반영
// ---------------------------------------------------------------------------

/** 교사가 확인 화면에서 켜고 끈 결과를 반영한다. */
export async function updateCardEnabled(cardIds: string[], isEnabled: boolean) {
  if (cardIds.length === 0) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("questioning_thinking_cards")
    .update({ is_enabled: isEnabled })
    .in("id", cardIds);

  if (error) {
    throw new Error(`카드 사용 여부 저장 실패: ${error.message}`);
  }
}

/**
 * 교사가 고친 발문을 반영한다.
 *
 * 메모 해석은 우리가 한 것이라 needs_review로 저장된다. 교사가 문장을 확인하면
 * 그 카드는 교사가 쓴 것이 되므로 verified로 올린다.
 */
export async function updateDialogueCard(cardId: string, dialoguePrompt: string) {
  const prompt = dialoguePrompt.trim();
  if (!prompt) {
    throw new Error("발문이 비어 있습니다.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("questioning_thinking_cards")
    .update({
      dialogue_prompt: prompt,
      knowledge_status: "verified",
      confidence: 1,
      is_enabled: true,
    })
    .eq("id", cardId);

  if (error) {
    throw new Error(`발문 저장 실패: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 학생 질문 기록
// ---------------------------------------------------------------------------

/**
 * 학생이 물은 것과 챗봇이 답한 것을 남긴다.
 *
 * 목적은 평가가 아니라 **카드를 고치는 것**이다. 지문과 카드로 답하지 못한 질문이
 * 모이면, 교사는 다음 수업에 그 부분을 카드로 채울 수 있다. 실시간 검색이 매번
 * 도박인 것과 달리 이건 쌓인다.
 *
 * 실명은 저장하지 않는다. `학교_반_번호` 형태의 식별값만 쓴다.
 */
export async function recordStudentQuestion(input: {
  lessonCode?: string;
  studentKey?: string;
  rawQuestion: string;
  questionIntent?: string;
  answerText?: string;
  answerable: boolean;
  missingInformation?: string;
  usedCardIds?: string[];
}) {
  if (!isCardStorageConfigured()) return;
  if (!input.rawQuestion.trim()) return;

  const supabase = createAdminClient();
  const lessonCode = input.lessonCode?.trim() || null;
  const documentId = lessonCode ? await loadLatestDocumentId(lessonCode).catch(() => null) : null;

  const { error } = await supabase.from("questioning_student_questions").insert({
    document_id: documentId,
    lesson_code: lessonCode,
    student_key: input.studentKey?.trim() || null,
    raw_question: input.rawQuestion.trim().slice(0, 800),
    normalized_question: input.rawQuestion.trim().replace(/\s+/g, " ").slice(0, 800),
    question_intent: input.questionIntent ?? null,
    used_card_ids: input.usedCardIds ?? [],
    answer_text: (input.answerText ?? "").slice(0, 2000),
    answerable: input.answerable,
    missing_information: input.missingInformation ?? null,
  });

  if (error) {
    throw new Error(`학생 질문 기록 실패: ${error.message}`);
  }
}

export type UnansweredQuestion = {
  question: string;
  askedCount: number;
  questionIntent: string;
  lastAskedAt: string;
};

/**
 * 카드로 답하지 못한 질문을 모아 준다. 같은 뜻의 질문은 하나로 묶어 몇 명이
 * 물었는지 센다 — 한 아이가 궁금한 것과 반 전체가 궁금한 것은 무게가 다르다.
 */
export async function loadUnansweredQuestions(
  lessonCode: string,
  limit = 20,
): Promise<UnansweredQuestion[]> {
  if (!isCardStorageConfigured()) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("questioning_student_questions")
    .select("normalized_question, raw_question, question_intent, created_at")
    .eq("lesson_code", lessonCode)
    .eq("answerable", false)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) {
    throw new Error(`학생 질문 조회 실패: ${error.message}`);
  }

  // 교사 답변이나 리서치로 이미 카드가 된 질문은 다시 묻지 않는다.
  // 목록이 이미 답한 것으로 차면 교사는 진짜 빈 곳을 못 본다.
  const documentId = await loadLatestDocumentId(lessonCode).catch(() => null);
  const coveredQuestions = documentId
    ? (await loadCards(documentId, { enabledOnly: true }).catch(() => []))
        .flatMap((card) => [...card.relatedQuestions, card.title])
        .map((value) => value.replace(/[\s?？!.,]/g, "").toLowerCase())
        .filter((value) => value.length >= 6)
    : [];

  const grouped = new Map<string, UnansweredQuestion>();
  (data ?? []).forEach((row) => {
    // 문장부호와 띄어쓰기만 다른 질문은 같은 질문으로 본다.
    const key = (row.normalized_question || row.raw_question)
      .replace(/[\s?？!.,]/g, "")
      .toLowerCase();
    if (!key) return;
    if (coveredQuestions.some((covered) => key.includes(covered) || covered.includes(key))) return;

    const existing = grouped.get(key);
    if (existing) {
      existing.askedCount += 1;
      return;
    }
    grouped.set(key, {
      question: row.raw_question,
      askedCount: 1,
      questionIntent: row.question_intent ?? "",
      lastAskedAt: row.created_at,
    });
  });

  return Array.from(grouped.values())
    .sort((left, right) => right.askedCount - left.askedCount)
    .slice(0, limit);
}

/**
 * 교사가 직접 적어 준 답을 카드로 만든다.
 *
 * 이 카드가 가장 확실하다. 지문에서 뽑은 것도, AI가 찾은 것도 아니고 교사가 아이를
 * 보며 쓴 답이기 때문이다. 그래서 `verified` · confidence 1.0으로 둔다.
 *
 * 실시간으로 학생 화면에 밀어 넣지 않는다. 대신 카드로 남으므로 **그다음 질문부터**
 * 바로 쓰인다 — 같은 수업 중 다른 아이가 같은 것을 물으면 이미 답이 있다.
 */
export async function addTeacherAnswerCard(input: {
  documentId: string;
  question: string;
  answer: string;
}): Promise<SavedCard | null> {
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question || !answer) {
    throw new Error("질문과 답을 모두 적어 주세요.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("questioning_thinking_cards")
    .insert({
      document_id: input.documentId,
      card_type: "background",
      title: question.slice(0, 80),
      summary: "선생님이 직접 답해 준 내용",
      content: answer.slice(0, 2000),
      source_type: "teacher",
      source_text: question,
      source_location: "선생님 답변",
      confidence: 1,
      knowledge_status: "verified",
      related_questions: [question],
      is_enabled: true,
    })
    .select(CARD_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`선생님 답변 저장 실패: ${error?.message ?? "알 수 없는 오류"}`);
  }
  return toCard(data as CardRow);
}

/**
 * 수업 중 실시간 리서치로 답한 내용을 리서치 카드로 남긴다.
 *
 * 첫 학생은 검색을 기다리지만, 카드로 남으므로 같은 것을 묻는 다음 학생부터는
 * 쌓인 답을 쓸 수 있다. 실패해도 조용히 넘어간다 — 답은 이미 나갔다.
 */
export async function addLiveResearchCard(input: {
  lessonCode: string;
  question: string;
  answer: string;
  sourceOrganization: string;
  sourceUrl: string;
  reliability: "A" | "B" | "C" | "D";
}): Promise<void> {
  if (!isCardStorageConfigured()) return;

  const documentId = await loadLatestDocumentId(input.lessonCode).catch(() => null);
  if (!documentId) return;

  const supabase = createAdminClient();
  await supabase.from("questioning_thinking_cards").insert({
    document_id: documentId,
    card_type: "research",
    title: input.question.slice(0, 80),
    summary: "수업 중 학생 질문에 실시간 리서치로 답한 내용",
    content: input.answer.slice(0, 2000),
    source_type: "external",
    source_location: input.sourceOrganization,
    confidence: input.reliability === "A" ? 0.9 : 0.8,
    knowledge_status: "researched",
    related_questions: [input.question],
    external_source_url: input.sourceUrl,
    external_source_title: input.sourceOrganization,
    external_source_organization: input.sourceOrganization,
    source_reliability: input.reliability,
    is_enabled: true,
  });
}


// ---------------------------------------------------------------------------
// 답변에 쓸 카드 찾기 — 저장만 하던 카드가 여기서 비로소 쓰인다
// ---------------------------------------------------------------------------

function compactText(value: string): string {
  return value.replace(/[\s?？!.,·'"'"]/g, "").toLowerCase();
}

function simpleKeywords(value: string, limit = 8): string[] {
  const found = value
    .split(/[^가-힣A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  return Array.from(new Set(found)).slice(0, limit);
}

function inferQuestionIntent(question: string): SavedCard["cardType"] | "unknown" {
  const compact = compactText(question);
  if (/(뜻|의미|낱말|단어|용어|무슨말|뭐예요|뭔가요)/.test(compact)) return "vocabulary";
  if (/(왜|이유|까닭|원인|때문|어떻게된)/.test(compact)) return "inference";
  if (/(우리|나라면|실천|적용|해결|방법|하면되|할수있)/.test(compact)) return "extension";
  if (/(내질문|내생각|고칠|성찰|배운점)/.test(compact)) return "dialogue_design";
  if (/(누가|언제|어디|무엇|뭐|얼마|몇)/.test(compact)) return "fact";
  return "unknown";
}

function sourceReliabilityBonus(card: SavedCard) {
  if (card.sourceReliability === "A") return 1.5;
  if (card.sourceReliability === "B") return 1;
  if (card.sourceReliability === "C") return -1;
  if (card.sourceReliability === "D") return -3;
  return 0;
}

function knowledgeStatusBonus(card: SavedCard) {
  if (card.knowledgeStatus === "verified") return 3;
  if (card.knowledgeStatus === "researched") return 2;
  if (card.knowledgeStatus === "inferred") return 1;
  if (card.knowledgeStatus === "outdated") return -5;
  return -6;
}

function cardTypeIntentBonus(card: SavedCard, questionIntent: ReturnType<typeof inferQuestionIntent>) {
  if (questionIntent === "unknown") return 0;
  if (card.cardType === questionIntent) return 2.5;
  if (questionIntent === "inference" && card.cardType === "fact") return 1.5;
  if (questionIntent === "extension" && (card.cardType === "background" || card.cardType === "research")) return 2;
  if (questionIntent === "fact" && card.cardType === "inference") return -1;
  if (questionIntent === "vocabulary" && card.cardType !== "vocabulary") return -2;
  return 0;
}

function targetGradeBonus(card: SavedCard, targetGrade?: string) {
  if (!targetGrade?.trim() || !card.studentLevel?.trim()) return 0;
  const targetDigits = targetGrade.match(/\d+/g)?.join("") ?? "";
  const cardDigits = card.studentLevel.match(/\d+/g)?.join("") ?? "";
  if (targetDigits && cardDigits && targetDigits === cardDigits) return 1;
  if (targetDigits && cardDigits && targetDigits !== cardDigits) return -0.75;
  return card.studentLevel.includes(targetGrade.trim()) ? 1 : 0;
}

function difficultyBonus(card: SavedCard) {
  if (typeof card.difficulty !== "number") return 0;
  if (card.difficulty <= 2) return 0.5;
  if (card.difficulty >= 5) return -1;
  return 0;
}

function freshnessBonus(card: SavedCard) {
  if (card.cardType !== "research") return 0;
  if (!card.externalSourceDate) return -0.25;

  const sourceTime = Date.parse(card.externalSourceDate);
  if (!Number.isFinite(sourceTime)) return 0;

  const ageInYears = (Date.now() - sourceTime) / (1000 * 60 * 60 * 24 * 365);
  if (ageInYears > 6) return -2;
  if (ageInYears > 3) return -1;
  if (ageInYears >= 0 && ageInYears < 1) return 0.75;
  return 0;
}

/** 질문과 카드가 맞닿는 정도. 문장 단위 일치가 낱말 겹침보다 훨씬 확실하다. */
function scoreCardForQuestion(card: SavedCard, question: string, targetGrade?: string): number {
  const compactQuestion = compactText(question);
  const questionIntent = inferQuestionIntent(question);
  let score = 0;

  const declared = card.relatedQuestions.some((candidate) => {
    const compactCandidate = compactText(candidate);
    return (
      compactCandidate.length >= 6 &&
      (compactQuestion.includes(compactCandidate) || compactCandidate.includes(compactQuestion))
    );
  });
  if (declared) score += 10;

  const asked = new Set(simpleKeywords(question));
  score += card.keywords.filter((keyword) => asked.has(keyword)).length * 2;
  if (compactText(card.title).length >= 4 && compactQuestion.includes(compactText(card.title))) score += 4;

  score += knowledgeStatusBonus(card);
  score += sourceReliabilityBonus(card);
  score += cardTypeIntentBonus(card, questionIntent);
  score += targetGradeBonus(card, targetGrade);
  score += difficultyBonus(card);
  score += freshnessBonus(card);

  // 교사가 직접 쓴 답은 수업 의도와 가장 가깝다.
  if (card.sourceType === "teacher") score += 3;

  return score;
}

/**
 * 학생 질문과 이어지는 카드를 찾아 준다. 챗봇 답변 프롬프트에 실린다.
 *
 * 문턱(4점)을 두는 이유: 낱말 하나 겹친다고 아무 카드나 실으면, 모델이 엉뚱한
 * 카드를 근거로 답하는 더 나쁜 실패가 생긴다. 확실한 카드만 싣고, 없으면 없이 간다.
 */
export async function findRelevantCards(
  lessonCode: string,
  question: string,
  limit = 4,
  targetGrade?: string,
): Promise<SavedCard[]> {
  if (!isCardStorageConfigured() || !lessonCode.trim() || !question.trim()) return [];

  const documentId = await loadLatestDocumentId(lessonCode).catch(() => null);
  if (!documentId) return [];

  const cards = await loadCards(documentId, { enabledOnly: true }).catch(() => []);
  return cards
    .filter((card) => card.knowledgeStatus !== "needs_review" && card.knowledgeStatus !== "outdated")
    .map((card) => ({ card, score: scoreCardForQuestion(card, question, targetGrade) }))
    .filter((entry) => entry.score >= 4)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.card);
}

/**
 * 이 수업에서 질문한 학생 목록. 참여 현황을 노션에서 복사해 붙이지 않아도
 * 서버 기록만으로 채워진다.
 */
export async function loadParticipants(lessonCode: string): Promise<string[]> {
  if (!isCardStorageConfigured() || !lessonCode.trim()) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("questioning_student_questions")
    .select("student_key")
    .eq("lesson_code", lessonCode)
    .not("student_key", "is", null)
    .limit(2000);

  if (error) return [];
  return Array.from(
    new Set(
      (data ?? [])
        .map((row) => (row.student_key ?? "").trim())
        .filter((key) => key.length > 0),
    ),
  ).sort();
}


export type StudentQuestionStats = {
  studentKey: string;
  questionCount: number;
  /** 많이 나온 질문 유형 순 */
  intents: string[];
  sampleQuestions: string[];
  /** 평가 기록 표의 질문모음·답변모음 칸을 채우는 전체 목록 */
  questions: string[];
  answers: string[];
  answerableRate: number;
};

/**
 * 학생별로 질문 기록을 묶는다. 평가의 재료다 — 점수가 아니라
 * "무엇을 몇 번, 어떤 유형으로 물었는가"라는 관찰 사실만 계산한다.
 */
export async function loadStudentQuestionStats(lessonCode: string): Promise<StudentQuestionStats[]> {
  if (!isCardStorageConfigured() || !lessonCode.trim()) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("questioning_student_questions")
    .select("student_key, raw_question, answer_text, question_intent, answerable, created_at")
    .eq("lesson_code", lessonCode)
    .not("student_key", "is", null)
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) {
    throw new Error(`질문 기록 조회 실패: ${error.message}`);
  }

  const byStudent = new Map<string, { questions: string[]; answers: string[]; intents: Map<string, number>; answerable: number }>();
  (data ?? []).forEach((row) => {
    const key = (row.student_key ?? "").trim();
    if (!key) return;
    const entry =
      byStudent.get(key) ??
      { questions: [] as string[], answers: [] as string[], intents: new Map<string, number>(), answerable: 0 };
    entry.questions.push(row.raw_question);
    entry.answers.push((row.answer_text ?? "").slice(0, 160));
    if (row.question_intent) {
      entry.intents.set(row.question_intent, (entry.intents.get(row.question_intent) ?? 0) + 1);
    }
    if (row.answerable) entry.answerable += 1;
    byStudent.set(key, entry);
  });

  return Array.from(byStudent.entries())
    .map(([studentKey, entry]) => ({
      studentKey,
      questionCount: entry.questions.length,
      intents: Array.from(entry.intents.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([intent]) => intent)
        .slice(0, 3),
      sampleQuestions: entry.questions.slice(0, 3),
      questions: entry.questions.slice(0, 30),
      answers: entry.answers.slice(0, 30),
      answerableRate: entry.questions.length
        ? Math.round((entry.answerable / entry.questions.length) * 100)
        : 0,
    }))
    .sort((left, right) => left.studentKey.localeCompare(right.studentKey, "ko"));
}
