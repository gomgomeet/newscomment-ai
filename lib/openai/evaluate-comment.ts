import {
  AI_DRAFT_REVIEW_REASONS,
  isEvaluationPayload,
  type AiEvaluationInput,
  type AiEvaluationResult,
} from "@/lib/evaluation/ai-draft-contract";

export const DEFAULT_OPENAI_EVALUATION_MODEL = "gpt-5.6";

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

export async function evaluateCommentWithOpenAI({
  projectTitle,
  rubricTitle,
  comment,
  criteria,
  evaluationGoal,
  achievementStandards,
}: AiEvaluationInput): Promise<AiEvaluationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const model = process.env.OPENAI_EVALUATION_MODEL || DEFAULT_OPENAI_EVALUATION_MODEL;
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
            "You help teachers draft evidence-grounded evaluations. Find an exact short quote from the student work before assigning each score. Never invent evidence. Score conservatively against the provided rubric. Return Korean feedback. If evidence is weak, lower confidence and add a review reason. The teacher makes the final decision.",
        },
        {
          role: "user",
          content: JSON.stringify({
            project_title: projectTitle,
            rubric_title: rubricTitle,
            comment,
            evaluation_goal: evaluationGoal || null,
            achievement_standards: achievementStandards ?? null,
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
            required: ["feedback", "evaluation_forward", "confidence", "review_reasons", "scores"],
            properties: {
              feedback: {
                type: "string",
              },
              evaluation_forward: {
                type: "string",
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              review_reasons: {
                type: "array",
                items: {
                  type: "string",
                  enum: [...AI_DRAFT_REVIEW_REASONS],
                },
              },
              scores: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["criterion_id", "score", "evidence_quote", "rationale"],
                  properties: {
                    criterion_id: {
                      type: "string",
                      enum: criteria.map((criterion) => criterion.id),
                    },
                    score: {
                      type: "number",
                    },
                    evidence_quote: {
                      type: "string",
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
    evaluation_forward: parsed.evaluation_forward,
    confidence: parsed.confidence,
    review_reasons: parsed.review_reasons,
    scores: parsed.scores,
    raw: { response: raw, parsed },
  };
}
