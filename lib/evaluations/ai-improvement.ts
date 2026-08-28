import type { Json } from "@/lib/db/types";

export type AiImprovementSuggestion = {
  criterion_id: string;
  priority: "high" | "medium" | "maintain";
  reason: string;
  suggestion: string;
  success_check: string;
};

function asRecord(value: Json | undefined) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : null;
}

export function readAiImprovementPlan(rawOutput: Json) {
  const root = asRecord(rawOutput);
  const candidates = root?.improvement_suggestions;
  const suggestions: AiImprovementSuggestion[] = [];

  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const item = asRecord(candidate);
      const criterionId = item?.criterion_id;
      const priority = item?.priority;
      const reason = item?.reason;
      const suggestion = item?.suggestion;
      const successCheck = item?.success_check;
      if (
        typeof criterionId === "string" &&
        (priority === "high" || priority === "medium" || priority === "maintain") &&
        typeof reason === "string" &&
        typeof suggestion === "string" &&
        typeof successCheck === "string"
      ) {
        suggestions.push({
          criterion_id: criterionId,
          priority,
          reason,
          suggestion,
          success_check: successCheck,
        });
      }
    }
  }

  return {
    suggestions,
    revisionPrompt: typeof root?.revision_prompt === "string" ? root.revision_prompt : null,
  };
}
