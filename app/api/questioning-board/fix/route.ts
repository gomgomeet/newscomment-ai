/**
 * 미리보기 중 답변 고치기
 *
 * 교사가 학생인 척 챗봇을 돌려 보다 이상한 답을 만났을 때, 그 자리에서 고친다.
 * 보드로 돌아가 메모를 고치고 ⑧을 다시 누르는 왕복이 없어야 고칠 거리를 잊지 않는다.
 *
 * 세 갈래:
 *   answer — 올바른 답을 적는다 → 교사 답변 카드(verified)
 *   rule   — 말투·방식 규칙을 적는다 → 대화 설계 카드
 *   disable— 이 답에 쓰인 카드를 끈다
 *
 * 학생이 주소를 알아내도 못 고쳐야 한다. UI 노출은 힌트일 뿐이고 실제 차단은
 * 연결 저장 암호로 여기서 한다.
 */

import {
  addTeacherAnswerCard,
  addTeacherRuleCard,
  isCardStorageConfigured,
  resolveDocumentIdForLesson,
  updateCardEnabled,
} from "@/lib/questioning-card-store";

type FixRequest = {
  lessonCode?: unknown;
  setupToken?: unknown;
  mode?: unknown;
  question?: unknown;
  answer?: unknown;
  rule?: unknown;
  cardIds?: unknown;
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FixRequest;
    assertSetupAllowed(body.setupToken);

    const lessonCode = optionalText(body.lessonCode);
    if (!lessonCode) {
      return Response.json({ error: "수업 코드를 찾지 못했습니다." }, { status: 400 });
    }
    if (!isCardStorageConfigured()) {
      return Response.json({ error: "Supabase 저장소가 설정되어 있지 않습니다." }, { status: 400 });
    }

    const documentId = await resolveDocumentIdForLesson(lessonCode);
    if (!documentId) {
      return Response.json(
        { error: "이 수업의 생각 카드를 찾지 못했습니다. 보드에서 ⑧을 먼저 눌러 주세요." },
        { status: 400 },
      );
    }

    const mode = optionalText(body.mode);
    const question = optionalText(body.question);

    if (mode === "answer") {
      const answer = optionalText(body.answer);
      if (!answer) {
        return Response.json({ error: "올바른 답을 적어 주세요." }, { status: 400 });
      }
      await addTeacherAnswerCard({ documentId, question, answer });
      return Response.json({ ok: true, applied: "answer" });
    }

    if (mode === "rule") {
      const rule = optionalText(body.rule);
      if (!rule) {
        return Response.json({ error: "고칠 내용을 적어 주세요." }, { status: 400 });
      }
      await addTeacherRuleCard({ documentId, triggerQuestion: question, rule });
      return Response.json({ ok: true, applied: "rule" });
    }

    if (mode === "disable") {
      const cardIds = Array.isArray(body.cardIds)
        ? body.cardIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      if (cardIds.length === 0) {
        return Response.json({ error: "끌 카드가 없습니다." }, { status: 400 });
      }
      await updateCardEnabled(cardIds, false);
      return Response.json({ ok: true, applied: "disable", count: cardIds.length });
    }

    return Response.json({ error: "무엇을 고칠지 알 수 없습니다." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "고치지 못했습니다.";
    const status = message.includes("암호") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
