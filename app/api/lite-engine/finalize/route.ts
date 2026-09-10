import { checkQuestioningChatRateLimit } from "@/lib/questioning-chat-rate-limit";
import { authorizeLiteEngineRequest } from "@/lib/lite-engine-auth";
import { finalizeLiteEngineReply } from "@/lib/lite-engine-plan";

export const runtime = "nodejs";

// plan 입력에 모델 후보 답변·근거가 더해지는 정상 최댓값을 수용한다.
const MAX_BODY_LENGTH = 160_000;

export async function POST(request: Request) {
  try {
    const authorization = authorizeLiteEngineRequest(request);
    if (!authorization.ok) {
      return Response.json(
        { error: authorization.error },
        { status: authorization.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_LENGTH) {
      return Response.json(
        { error: "최종 확인 요청이 비어 있거나 너무 깁니다." },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "최종 확인 요청 JSON을 확인해 주세요." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const candidate = body as { lesson?: { lessonId?: unknown }; sessionKey?: unknown };
    const lessonKey = typeof candidate.lesson?.lessonId === "string"
      ? candidate.lesson.lessonId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)
      : "lite-finalize";
    const sessionKey = typeof candidate.sessionKey === "string" ? candidate.sessionKey : undefined;
    const rateLimit = checkQuestioningChatRateLimit(request, lessonKey || "lite-finalize", sessionKey, {
      addressScope: `lite:${authorization.deploymentId}`,
    });
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "최종 확인 요청이 한꺼번에 들어오고 있어요. 잠시 뒤 다시 보내 주세요." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }
    return Response.json(finalizeLiteEngineReply(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "개인 API 답변을 최종 확인하지 못했습니다.";
    return Response.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
