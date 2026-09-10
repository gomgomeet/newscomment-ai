import "server-only";

import { createHash, timingSafeEqual } from "crypto";

type LiteEngineAuthorization =
  | { ok: true; deploymentId: string }
  | { ok: false; status: 401 | 503; error: string };

function sameSecret(candidate: string, expected: string) {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export function authorizeLiteEngineRequest(request: Request): LiteEngineAuthorization {
  const expected = process.env.LITE_ENGINE_ACCESS_KEY?.trim() ?? "";
  if (expected.length < 32) {
    return {
      ok: false,
      status: 503,
      error: "기존 질문중심 챗봇의 경량앱 연결키가 아직 설정되지 않았습니다.",
    };
  }

  const candidate = request.headers.get("x-lite-engine-key")?.trim() ?? "";
  const deploymentId = request.headers.get("x-lite-deployment-id")?.trim() ?? "";
  if (!candidate || !sameSecret(candidate, expected) || !/^LD-[A-Za-z0-9_-]{16,64}$/.test(deploymentId)) {
    return {
      ok: false,
      status: 401,
      error: "허용된 경량 교사앱 연결인지 확인하지 못했습니다.",
    };
  }

  return { ok: true, deploymentId };
}
