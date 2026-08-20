import type { Database } from "@/lib/db/types";

type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];

export type AiEvaluationResult = {
  model: string;
  feedback: string;
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

  const payload = value as { feedback?: unknown; scores?: unknown };
  return (
    typeof payload.feedback === "string" &&
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
            "You are an assistant helping teachers evaluate student news comments. Score conservatively against the provided rubric. Return Korean feedback.",
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
            required: ["feedback", "scores"],
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

  return {
    model,
    feedback: parsed.feedback,
    scores: parsed.scores,
    raw,
  };
}
