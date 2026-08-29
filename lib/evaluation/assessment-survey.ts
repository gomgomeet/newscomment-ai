import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
export {
  readAssessmentSurveyConfig,
  type AssessmentRubricLevels,
  type AssessmentSurveyConfig,
} from "@/lib/evaluation/assessment-survey-config";

function signingSecret() {
  const secret = process.env.EVALUATION_SECRET_ENCRYPTION_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("학생 설문 링크를 만들 서버 비밀키가 설정되어 있지 않습니다.");
  return secret;
}

export function createAssessmentSurveyToken(projectId: string, versionId: string) {
  return createHmac("sha256", signingSecret())
    .update(`${projectId}:${versionId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyAssessmentSurveyToken(projectId: string, versionId: string, token: string) {
  const expected = createAssessmentSurveyToken(projectId, versionId);
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(token);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}
