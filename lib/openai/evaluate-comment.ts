import type { Database } from "@/lib/db/types";

type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];

export type AiEvaluationResult = {
  model: string;
  feedback: string;
  improvement_suggestions: {
    criterion_id: string;
    priority: "high" | "medium" | "maintain";
    reason: string;
    suggestion: string;
    success_check: string;
  }[];
  revision_prompt: string;
  scores: {
    criterion_id: string;
    score: number;
    rationale: string;
  }[];
  raw: unknown;
};

function extractOutputText(response: { output_text?: unknown; output?: unknown }) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return null;
  }

  for (const outputItem of response.output) {
    if (
      typeof outputItem === "object" &&
      outputItem !== null &&
      "content" in outputItem &&
      Array.isArray(outputItem.content)
    ) {
      for (const contentItem of outputItem.content) {
        if (
          typeof contentItem === "object" &&
          contentItem !== null &&
          "text" in contentItem &&
          typeof contentItem.text === "string"
        ) {
          return contentItem.text;
        }
      }
    }
  }

  return null;
}

function isEvaluationPayload(value: unknown): value is Omit<AiEvaluationResult, "model" | "raw"> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as {
    feedback?: unknown;
    scores?: unknown;
    improvement_suggestions?: unknown;
    revision_prompt?: unknown;
  };
  return (
    typeof payload.feedback === "string" &&
    typeof payload.revision_prompt === "string" &&
    Array.isArray(payload.improvement_suggestions) &&
    payload.improvement_suggestions.every((suggestion) => {
      if (typeof suggestion !== "object" || suggestion === null) return false;
      const item = suggestion as {
        criterion_id?: unknown;
        priority?: unknown;
        reason?: unknown;
        suggestion?: unknown;
        success_check?: unknown;
      };
      return (
        typeof item.criterion_id === "string" &&
        ["high", "medium", "maintain"].includes(String(item.priority)) &&
        typeof item.reason === "string" &&
        typeof item.suggestion === "string" &&
        typeof item.success_check === "string"
      );
    }) &&
    Array.isArray(payload.scores) &&
    payload.scores.every((score) => {
      if (typeof score !== "object" || score === null) {
        return false;
      }

      const item = score as { criterion_id?: unknown; score?: unknown; rationale?: unknown };
      return (
        typeof item.criterion_id === "string" &&
        typeof item.score === "number" &&
        Number.isFinite(item.score) &&
        typeof item.rationale === "string"
      );
    })
  );
}

export async function evaluateCommentWithOpenAI({
  projectTitle,
  rubricTitle,
  comment,
  criteria,
}: {
  projectTitle: string;
  rubricTitle: string;
  comment: string;
  criteria: Criterion[];
}): Promise<AiEvaluationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const model = process.env.OPENAI_EVALUATION_MODEL || "gpt-5.6";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "system",
          content:
            "You help teachers evaluate student learning artifacts. Score conservatively against the rubric and return Korean feedback. For every criterion, propose a concrete improvement action the student can perform, explain why it matters, and give an observable success check. Do not rewrite the entire artifact for the student. If performance is already strong, suggest how to maintain or extend it. The revision prompt must be a short student-facing question that encourages independent revision.",
        },
        {
          role: "user",
          content: JSON.stringify({
            project_title: projectTitle,
            rubric_title: rubricTitle,
            comment,
            criteria: criteria.map((criterion) => ({
              criterion_id: criterion.id,
              label: criterion.label,
              description: criterion.description,
              max_score: criterion.max_score,
            })),
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "comment_evaluation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["feedback", "scores", "improvement_suggestions", "revision_prompt"],
            properties: {
              feedback: {
                type: "string",
              },
              scores: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["criterion_id", "score", "rationale"],
                  properties: {
                    criterion_id: {
                      type: "string",
                      enum: criteria.map((criterion) => criterion.id),
                    },
                    score: {
                      type: "number",
                    },
                    rationale: {
                      type: "string",
                    },
                  },
                },
              },
              improvement_suggestions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["criterion_id", "priority", "reason", "suggestion", "success_check"],
                  properties: {
                    criterion_id: {
                      type: "string",
                      enum: criteria.map((criterion) => criterion.id),
                    },
                    priority: {
                      type: "string",
                      enum: ["high", "medium", "maintain"],
                    },
                    reason: {
                      type: "string",
                    },
                    suggestion: {
                      type: "string",
                    },
                    success_check: {
                      type: "string",
                    },
                  },
                },
              },
              revision_prompt: {
                type: "string",
              },
            },
          },
        },
      },
    }),
  });

  const raw = (await response.json()) as { error?: { message?: string }; output_text?: unknown; output?: unknown };
  if (!response.ok) {
    throw new Error(raw.error?.message || "OpenAI 평가 요청에 실패했습니다.");
  }

  const outputText = extractOutputText(raw);
  if (!outputText) {
    throw new Error("OpenAI 평가 응답에서 결과 텍스트를 찾을 수 없습니다.");
  }

  const parsed = JSON.parse(outputText) as unknown;
  if (!isEvaluationPayload(parsed)) {
    throw new Error("OpenAI 평가 응답 형식이 올바르지 않습니다.");
  }

  const suggestionByCriterion = new Map(
    parsed.improvement_suggestions.map((suggestion) => [suggestion.criterion_id, suggestion]),
  );
  const scoreByCriterion = new Map(parsed.scores.map((score) => [score.criterion_id, score]));
  const normalizedSuggestions = criteria.map((criterion) => {
    const suggestion = suggestionByCriterion.get(criterion.id);
    if (suggestion) return suggestion;

    const score = scoreByCriterion.get(criterion.id)?.score ?? 0;
    const ratio = criterion.max_score > 0 ? score / criterion.max_score : 0;
    return {
      criterion_id: criterion.id,
      priority: ratio >= 0.8 ? "maintain" as const : ratio < 0.6 ? "high" as const : "medium" as const,
      reason: "이 기준의 구체적인 향상 제안이 생성되지 않아 교사의 추가 확인이 필요합니다.",
      suggestion: "평가 근거를 다시 확인하고, 이 기준과 직접 관련된 한 부분을 학생의 말로 구체화해 보세요.",
      success_check: "수정 전후의 차이를 기준 설명과 연결해 말할 수 있는지 확인합니다.",
    };
  });

  return {
    model,
    feedback: parsed.feedback,
    scores: parsed.scores,
    improvement_suggestions: normalizedSuggestions,
    revision_prompt: parsed.revision_prompt,
    raw,
  };
}
