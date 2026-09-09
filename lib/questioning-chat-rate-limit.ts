import "server-only";

import { createHash } from "crypto";

type RateEntry = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_ADDRESS_REQUESTS_PER_WINDOW = 120;
const rateEntries = new Map<string, RateEntry>();

function hashedRateKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function clientKeys(request: Request, lessonCode: string, sessionId?: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || request.headers.get("x-real-ip")?.trim() || "local";
  // Apps Script 경량앱은 base64url 세션 ID를 사용하므로 `_`도 정상 문자로 받는다.
  // 이를 거부하면 여러 학생이 공유하는 UrlFetch 출구 IP 하나로 묶여 반 전체 제한이 된다.
  const sessionKey = sessionId && /^[A-Za-z0-9_-]{8,64}$/.test(sessionId) ? sessionId : address;
  const lesson = lessonCode || "local";
  return {
    session: `${lesson}:session:${hashedRateKey(sessionKey)}`,
    address: `${lesson}:address:${hashedRateKey(address)}`,
  };
}

function consumeRateEntry(key: string, maximum: number, now: number) {
  const current = rateEntries.get(key);
  if (!current || current.resetAt <= now) {
    rateEntries.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= maximum) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function checkQuestioningChatRateLimit(request: Request, lessonCode: string, sessionId?: string) {
  const now = Date.now();
  const keys = clientKeys(request, lessonCode, sessionId);
  const addressResult = consumeRateEntry(keys.address, MAX_ADDRESS_REQUESTS_PER_WINDOW, now);
  if (!addressResult.allowed) return addressResult;
  return consumeRateEntry(keys.session, MAX_REQUESTS_PER_WINDOW, now);
}
