import { createHash } from "crypto";

type RateEntry = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_ADDRESS_REQUESTS_PER_WINDOW = 120;
const MAX_SCOPED_SOURCE_REQUESTS_PER_WINDOW = 360;
const MAX_RATE_ENTRIES = 5_000;
const rateEntries = new Map<string, RateEntry>();
let nextCleanupAt = 0;

function hashedRateKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function clientKeys(request: Request, lessonCode: string, sessionId?: string, addressScope?: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || request.headers.get("x-real-ip")?.trim() || "local";
  // Apps Script 경량앱은 base64url 세션 ID를 사용하므로 `_`도 정상 문자로 받는다.
  // 이를 거부하면 여러 학생이 공유하는 UrlFetch 출구 IP 하나로 묶여 반 전체 제한이 된다.
  const sessionKey = sessionId && /^[A-Za-z0-9_-]{8,64}$/.test(sessionId) ? sessionId : address;
  const lesson = lessonCode || "local";
  return {
    session: `${lesson}:session:${hashedRateKey(sessionKey)}`,
    // 기존 웹 챗봇은 서로 다른 수업이 같은 학교 NAT 한도를 공유하지 않게 수업별로 유지한다.
    address: `${lesson}:address:${hashedRateKey(address)}`,
    // 경량앱은 공개 입력인 lessonId를 바꾸어도 전체 상한을 우회하지 못하도록 별도 전역 IP 키도 쓴다.
    globalAddress: addressScope ? `address:${hashedRateKey(address)}` : "",
    scope: addressScope ? `scope:${hashedRateKey(addressScope)}` : "",
  };
}

function cleanupRateEntries(now: number) {
  if (now < nextCleanupAt && rateEntries.size <= MAX_RATE_ENTRIES) return;
  for (const [key, entry] of rateEntries) {
    if (entry.resetAt <= now) rateEntries.delete(key);
  }
  if (rateEntries.size > MAX_RATE_ENTRIES) {
    const oldest = [...rateEntries.entries()].sort((left, right) => left[1].resetAt - right[1].resetAt);
    for (let index = 0; index < oldest.length - MAX_RATE_ENTRIES; index += 1) {
      rateEntries.delete(oldest[index][0]);
    }
  }
  nextCleanupAt = now + WINDOW_MS;
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

export function checkQuestioningChatRateLimit(
  request: Request,
  lessonCode: string,
  sessionId?: string,
  options?: { addressScope?: string },
) {
  const now = Date.now();
  cleanupRateEntries(now);
  const keys = clientKeys(request, lessonCode, sessionId, options?.addressScope);
  const addressResult = consumeRateEntry(keys.address, MAX_ADDRESS_REQUESTS_PER_WINDOW, now);
  if (!addressResult.allowed) return addressResult;
  if (keys.scope) {
    // Apps Script 출구 IP는 여러 교사가 공유할 수 있어 전역 상한을 넓게 두되,
    // 위조 가능한 배포 식별자만 바꿔도 무제한이 되지 않도록 함께 적용한다.
    const globalAddressResult = consumeRateEntry(
      keys.globalAddress,
      MAX_SCOPED_SOURCE_REQUESTS_PER_WINDOW,
      now,
    );
    if (!globalAddressResult.allowed) return globalAddressResult;
    const scopeResult = consumeRateEntry(keys.scope, MAX_ADDRESS_REQUESTS_PER_WINDOW, now);
    if (!scopeResult.allowed) return scopeResult;
  }
  return consumeRateEntry(keys.session, MAX_REQUESTS_PER_WINDOW, now);
}
