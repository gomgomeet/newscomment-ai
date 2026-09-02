import { DEFAULT_ANTHROPIC_EVALUATION_MODEL, evaluateCommentWithClaude } from "@/lib/anthropic/evaluate-comment";
import type { AiEvaluationInput, AiEvaluationResult } from "@/lib/evaluation/ai-draft-contract";
import { DEFAULT_OPENAI_EVALUATION_MODEL, evaluateCommentWithOpenAI } from "@/lib/openai/evaluate-comment";

export type AiDraftProvider = "anthropic" | "openai";

export type AiDraftProviderStatus = {
  provider: AiDraftProvider | null;
  label: string;
  model: string;
  configured: boolean;
};

// AI_EVALUATION_PROVIDER로 고정할 수 있고, 비워 두면 키가 있는 제공자를 쓴다.
// 둘 다 있으면 Claude를 우선한다.
export function resolveAiDraftProvider(): AiDraftProvider | null {
  const requested = process.env.AI_EVALUATION_PROVIDER;
  if (requested === "anthropic" || requested === "openai") {
    return requested;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  return null;
}

export function getAiDraftProviderStatus(): AiDraftProviderStatus {
  const provider = resolveAiDraftProvider();
  if (provider === "anthropic") {
    return {
      provider,
      label: "Claude",
      model: process.env.ANTHROPIC_EVALUATION_MODEL || DEFAULT_ANTHROPIC_EVALUATION_MODEL,
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
    };
  }
  if (provider === "openai") {
    return {
      provider,
      label: "OpenAI",
      model: process.env.OPENAI_EVALUATION_MODEL || DEFAULT_OPENAI_EVALUATION_MODEL,
      configured: Boolean(process.env.OPENAI_API_KEY),
    };
  }
  return { provider: null, label: "설정 안 됨", model: "-", configured: false };
}

export async function evaluateCommentDraft(input: AiEvaluationInput): Promise<AiEvaluationResult> {
  const provider = resolveAiDraftProvider();
  if (provider === "anthropic") {
    return evaluateCommentWithClaude(input);
  }
  if (provider === "openai") {
    return evaluateCommentWithOpenAI(input);
  }
  throw new Error("AI 초안을 만들려면 ANTHROPIC_API_KEY 또는 OPENAI_API_KEY를 설정해 주세요.");
}
