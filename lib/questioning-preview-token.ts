import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { normalizeLessonCode } from "@/lib/questioning-lesson-connections";

const PREVIEW_TOKEN_VERSION = "v1";
const PREVIEW_TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;

type PreviewTokenPayload = {
  lessonCode: string;
  expiresAt: number;
  purpose: "teacher_preview";
};

function getSigningSecret() {
  const secret = process.env.QUESTIONING_SECRET_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("교사 미리보기 서명 키가 준비되지 않았습니다.");
  }
  return secret;
}

function signPayload(payloadText: string) {
  return createHmac("sha256", getSigningSecret()).update(payloadText).digest("base64url");
}

export function createQuestioningPreviewToken(lessonCodeInput: string) {
  const lessonCode = normalizeLessonCode(lessonCodeInput);
  if (!lessonCode) {
    throw new Error("교사 미리보기용 수업 코드가 올바르지 않습니다.");
  }

  const payload: PreviewTokenPayload = {
    lessonCode,
    expiresAt: Date.now() + PREVIEW_TOKEN_LIFETIME_MS,
    purpose: "teacher_preview",
  };
  const payloadText = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${PREVIEW_TOKEN_VERSION}.${payloadText}.${signPayload(payloadText)}`;
}

export function verifyQuestioningPreviewToken(tokenInput: unknown, lessonCodeInput: string) {
  if (typeof tokenInput !== "string" || !tokenInput.trim()) return false;

  const lessonCode = normalizeLessonCode(lessonCodeInput);
  const [version, payloadText, signatureText] = tokenInput.trim().split(".");
  if (version !== PREVIEW_TOKEN_VERSION || !payloadText || !signatureText || !lessonCode) return false;

  const expectedSignature = Buffer.from(signPayload(payloadText), "utf8");
  const receivedSignature = Buffer.from(signatureText, "utf8");
  if (
    expectedSignature.length !== receivedSignature.length ||
    !timingSafeEqual(expectedSignature, receivedSignature)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadText, "base64url").toString("utf8")) as PreviewTokenPayload;
    return (
      payload.purpose === "teacher_preview" &&
      payload.lessonCode === lessonCode &&
      Number.isFinite(payload.expiresAt) &&
      payload.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}
