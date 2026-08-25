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
