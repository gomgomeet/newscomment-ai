import type { Database } from "@/lib/db/types";

export type AiDraftCriterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];

export type AiEvaluationResult = {
  model: string;
  feedback: string;
  evaluation_forward: string;
  confidence: number;
  review_reasons: string[];
  scores: {
    criterion_id: string;
    score: number;
    evidence_quote: string;
    rationale: string;
  }[];
  raw: unknown;
};

export type AiEvaluationInput = {
  projectTitle: string;
  rubricTitle: string;
  comment: string;
  criteria: AiDraftCriterion[];
  evaluationGoal?: string;
  achievementStandards?: unknown;
};

export const AI_DRAFT_REVIEW_REASONS = [
  "근거 부족",
  "루브릭 기준 간 모순",
  "점수 경계에 가까움",
  "결과물이 너무 짧거나 손상됨",
  "학생 식별자 누락",
  "기존 교사 평가와 큰 차이",
] as const;

export function isEvaluationPayload(value: unknown): value is Omit<AiEvaluationResult, "model" | "raw"> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as {
    feedback?: unknown;
    evaluation_forward?: unknown;
    confidence?: unknown;
    review_reasons?: unknown;
    scores?: unknown;
  };
  return (
    typeof payload.feedback === "string" &&
    typeof payload.evaluation_forward === "string" &&
    typeof payload.confidence === "number" &&
    payload.confidence >= 0 &&
    payload.confidence <= 1 &&
    Array.isArray(payload.review_reasons) &&
    payload.review_reasons.every((reason) => typeof reason === "string") &&
    Array.isArray(payload.scores) &&
    payload.scores.every((score) => {
      if (typeof score !== "object" || score === null) {
        return false;
      }

      const item = score as { criterion_id?: unknown; score?: unknown; evidence_quote?: unknown; rationale?: unknown };
      return (
        typeof item.criterion_id === "string" &&
        typeof item.score === "number" &&
        Number.isFinite(item.score) &&
        typeof item.evidence_quote === "string" &&
        typeof item.rationale === "string"
      );
    })
  );
}
