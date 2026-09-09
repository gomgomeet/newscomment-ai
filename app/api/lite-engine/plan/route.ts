import { checkQuestioningChatRateLimit } from "@/lib/questioning-chat-rate-limit";
import {
  createLiteEnginePlan,
  LITE_ENGINE_POLICY_VERSION,
  LITE_ENGINE_SCHEMA_VERSION,
} from "@/lib/lite-engine-plan";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 60_000;

export function GET() {
  return Response.json(
    {
      ok: true,
      schemaVersion: LITE_ENGINE_SCHEMA_VERSION,
      policyVersion: LITE_ENGINE_POLICY_VERSION,
      storesConversation: false,
      acceptsTeacherApiKey: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_LENGTH) {
      return Response.json(
        { error: "요청 내용이 비어 있거나 너무 깁니다." },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "요청 JSON을 확인해 주세요." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const candidate = body as { lesson?: { lessonId?: unknown }; sessionKey?: unknown };
    const lessonKey = typeof candidate.lesson?.lessonId === "string"
      ? candidate.lesson.lessonId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)
      : "lite";
    const sessionKey = typeof candidate.sessionKey === "string" ? candidate.sessionKey : undefined;
    const rateLimit = checkQuestioningChatRateLimit(request, lessonKey || "lite", sessionKey);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "질문이 한꺼번에 들어오고 있어요. 잠시 뒤 다시 보내 주세요." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }
    return Response.json(createLiteEnginePlan(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "중앙 정책 계획을 만들지 못했습니다.";
    return Response.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
