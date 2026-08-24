import "server-only";

import { createHash } from "crypto";

type RateEntry = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const rateEntries = new Map<string, RateEntry>();

function clientKey(request: Request, lessonCode: string, sessionId?: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || request.headers.get("x-real-ip")?.trim() || "local";
  const sessionKey = sessionId && /^[A-Za-z0-9-]{8,64}$/.test(sessionId) ? sessionId : address;
  const digest = createHash("sha256").update(sessionKey).digest("hex").slice(0, 16);
  return `${lessonCode || "local"}:${digest}`;
}

export function checkQuestioningChatRateLimit(request: Request, lessonCode: string, sessionId?: string) {
  const now = Date.now();
  const key = clientKey(request, lessonCode, sessionId);
  const current = rateEntries.get(key);

  if (!current || current.resetAt <= now) {
    rateEntries.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
