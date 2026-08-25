/**
 * 생각 카드 만들기·저장하기
 *
 * 교사용 보드의 ⑧ "챗봇에 적용하고 노션에 저장"이 이 라우트를 부른다.
 *
 * POST  — 지문에서 카드를 만들어 저장한다. 확인이 필요한 것이 있으면 함께 알려 준다.
 * PATCH — 교사가 확인 화면에서 켜고 끄고 고친 결과를 반영한다.
 */

import {
  attachAiCards,
  buildLocalCardSet,
  summarizeCardSet,
  type CardSet,
} from "@/lib/questioning-cards";
import { generateKnowledgeCardsWithGemini } from "@/lib/gemini/questioning-cards";
import {
  isCardStorageConfigured,
  loadCards,
  saveDocumentWithCards,
  updateCardEnabled,
  updateDialogueCard,
} from "@/lib/questioning-card-store";
import type { MaterialAnalysis } from "@/lib/questioning-board";

type CardsRequest = {
  material?: unknown;
  lessonCode?: unknown;
  standard?: unknown;
  targetGrade?: unknown;
  subjectUnit?: unknown;
  setupToken?: unknown;
  geminiApiKey?: unknown;
  geminiModel?: unknown;
  /** 웹 리서치까지 할지. 키가 없으면 무시된다. */
  useAi?: unknown;
};

type CardsPatchRequest = {
  documentId?: unknown;
  setupToken?: unknown;
  /** 교사가 켠 카드 / 끈 카드 */
  enabledCardIds?: unknown;
  disabledCardIds?: unknown;
  /** 교사가 고친 발문 */
  dialogueEdits?: unknown;
};

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertSetupAllowed(setupToken: unknown) {
  const expectedToken = process.env.QUESTIONING_CONNECTION_SETUP_TOKEN?.trim();
  if (!expectedToken) return;
  if (optionalText(setupToken) !== expectedToken) {
    throw new Error("수업 연결 저장 암호가 올바르지 않습니다.");
  }
}

function isMaterialAnalysis(value: unknown): value is MaterialAnalysis {
  if (typeof value !== "object" || value === null) return false;
  const material = value as Partial<MaterialAnalysis>;
  return (
    typeof material.materialTitle === "string" &&
    typeof material.summary === "string" &&
    typeof material.visibleText === "string" &&
    Array.isArray(material.keyConcepts)
  );
}

function stringIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CardsRequest;
    assertSetupAllowed(body.setupToken);

    if (!isMaterialAnalysis(body.material)) {
      return Response.json({ error: "카드를 만들 질문 자료가 올바르지 않습니다." }, { status: 400 });
    }
    const material = body.material;
    const standard = optionalText(body.standard);
    const targetGrade = optionalText(body.targetGrade);

    // 지문에서 기계적으로 뽑는 카드가 먼저다. AI가 없어도 여기까지는 늘 만들어진다.
    let cardSet: CardSet = buildLocalCardSet(material);

    // 저장소 점검보다 이 검사가 먼저다. 지문이 비었을 때 교사가 할 일은 지문을
    // 채우는 것이지 서버 설정을 확인하는 것이 아니다.
    if (cardSet.cards.length === 0) {
      return Response.json(
        { error: "질문 자료가 비어 있어 만들 카드가 없습니다. 지문을 먼저 입력해 주세요." },
        { status: 400 },
      );
    }

    if (!isCardStorageConfigured()) {
      return Response.json({ error: "Supabase 저장소가 설정되어 있지 않습니다." }, { status: 400 });
    }

    // 배경·리서치 카드는 있으면 좋은 것이지 없으면 안 되는 것이 아니다. AI가 실패해도
    // 지역 카드로 저장을 마치고, 무엇이 실패했는지만 알려 준다.
    const geminiApiKey = optionalText(body.geminiApiKey);
    let aiCardCount = 0;
    let aiWarning = "";

    if (body.useAi !== false && geminiApiKey) {
      try {
        const generated = await generateKnowledgeCardsWithGemini({
          material,
          standard,
          targetGrade,
          apiKey: geminiApiKey,
          model: optionalText(body.geminiModel) || undefined,
        });
        cardSet = attachAiCards(cardSet, generated.cards);
        aiCardCount = generated.cards.length;
        if (generated.cards.length === 0) {
          aiWarning = "웹 리서치에서 출처를 확인한 내용을 찾지 못해 배경 카드를 만들지 않았습니다.";
        }
      } catch (error) {
        aiWarning = `배경·리서치 카드를 만들지 못했습니다: ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }`;
      }
    } else if (!geminiApiKey) {
      aiWarning = "Gemini 키가 없어 지문에서 뽑은 카드만 만들었습니다.";
    }

    const saved = await saveDocumentWithCards({
      lessonCode: optionalText(body.lessonCode),
      title: material.materialTitle || "질문 자료",
      bodyText: material.visibleText,
      summary: material.summary,
      targetGrade,
      subjectUnit: optionalText(body.subjectUnit),
      standard,
      teacherMemo: material.questionFocusMemo ?? "",
      cardSet,
    });

    // 확인 화면은 저장된 카드(uuid)를 다뤄야 하므로 저장 결과로 다시 요약한다.
    const summary = summarizeCardSet({ cards: saved.cards, relations: [] });

    return Response.json({
      documentId: saved.documentId,
      title: saved.title,
      total: summary.total,
      byType: summary.byType,
      usable: summary.usable,
      weakCardCount: summary.weakCardCount,
      aiCardCount,
      warning: aiWarning,
      // 교사에게 한 번 물을 것들. 비어 있으면 확인 창을 띄우지 않는다.
      needsConfirmation: summary.needsConfirmation.map((card) => ({
        id: card.localId,
        cardType: card.cardType,
        title: card.title,
        content: card.content,
        dialoguePrompt: card.dialoguePrompt,
        dialogueTrigger: card.dialogueTrigger,
        dialogueGoal: card.dialogueGoal,
        externalSourceUrl: card.externalSourceUrl,
        externalSourceTitle: card.externalSourceTitle,
        externalSourceOrganization: card.externalSourceOrganization,
        sourceReliability: card.sourceReliability,
        // 안전한 기본값: 메모 해석은 켜고, 등급이 낮은 리서치는 꺼 둔다.
        defaultEnabled: card.isEnabled,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "생각 카드를 만들지 못했습니다.";
    const status = message.includes("암호") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as CardsPatchRequest;
    assertSetupAllowed(body.setupToken);

    const documentId = optionalText(body.documentId);
    if (!documentId) {
      return Response.json({ error: "어떤 지문의 카드인지 알 수 없습니다." }, { status: 400 });
    }
    if (!isCardStorageConfigured()) {
      return Response.json({ error: "Supabase 저장소가 설정되어 있지 않습니다." }, { status: 400 });
    }

    const enabledCardIds = stringIdArray(body.enabledCardIds);
    const disabledCardIds = stringIdArray(body.disabledCardIds);

    const dialogueEdits = Array.isArray(body.dialogueEdits)
      ? body.dialogueEdits
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          .map((item) => ({
            id: optionalText(item.id),
            dialoguePrompt: optionalText(item.dialoguePrompt),
          }))
          .filter((item) => item.id && item.dialoguePrompt)
      : [];

    await updateCardEnabled(enabledCardIds, true);
    await updateCardEnabled(disabledCardIds, false);
    for (const edit of dialogueEdits) {
      await updateDialogueCard(edit.id, edit.dialoguePrompt);
    }

    const cards = await loadCards(documentId, { enabledOnly: true });
    return Response.json({
      documentId,
      enabledCount: cards.length,
      updated: enabledCardIds.length + disabledCardIds.length + dialogueEdits.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "확인 결과를 저장하지 못했습니다.";
    const status = message.includes("암호") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
