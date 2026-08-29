import type { Database } from "@/lib/db/types";

export { AI_EVALUATION_PROMPT_VERSION } from "@/lib/evaluation/ai-evaluation-version";

type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];

export type RubricScoreLevels = Record<"4" | "3" | "2" | "1", string>;

const EVALUATION_AUTOMATION_GUIDELINES = [
  "Treat the provided rubric as the teacher-approved rubric. Do not create, replace, or reinterpret competing criteria.",
  "Evaluate the student's answer against the assessment material, question, achievement standard, goal, and rubric.",
  "When a criterion includes score_levels, choose exactly one of the listed 4, 3, 2, or 1 point levels by matching the student's observable evidence to that descriptor. Do not use the database rubric maximum or invent an intermediate score.",
  "Return one score for every provided criterion and no scores for criteria that were not provided for this question.",
  "When teacher_guidance is provided, treat it as an authoritative calibration for this question and apply it consistently to both scores and narrative feedback while staying within the supplied score levels.",
  "For every criterion, quote a short exact phrase from the student's answer before assigning a score. Never invent evidence and do not score generously when evidence is absent.",
  "Use the assessment source internally to check understanding, but keep student-facing feedback focused on the student's answer.",
  "Write three or four concise Korean sentences at the provided target grade level: praise one observable strength, explain one improvement, and include a usable example sentence.",
  "Write evaluation_forward as one friendly next challenge ending in '~해 보면 어떨까요?'.",
  "Do not add generic caveats such as 'the original text was not provided' or 'accuracy is difficult to verify'. When source material is empty, evaluate only observable features of the answer without apologizing for missing context.",
  "Lower confidence and add a review reason when the answer is too short, weakly related, lacks direct evidence, falls near a score boundary, or is difficult to distinguish between two levels.",
  "This is an AI draft for teacher review. Never present the score or feedback as the teacher's final decision.",
].join(" ");

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

export async function evaluateCommentWithOpenAI({
  projectTitle,
  rubricTitle,
  comment,
  criteria,
  evaluationGoal,
  achievementStandards,
  assessmentTitle,
  assessmentSourceText,
  assessmentPrompt,
  targetGrade,
  criterionScoreLevels,
  teacherGuidance,
}: {
  projectTitle: string;
  rubricTitle: string;
  comment: string;
  criteria: Criterion[];
  evaluationGoal?: string;
  achievementStandards?: unknown;
  assessmentTitle?: string;
  assessmentSourceText?: string;
  assessmentPrompt?: string;
  targetGrade?: string;
  criterionScoreLevels?: Record<string, RubricScoreLevels>;
  teacherGuidance?: string;
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
          content: EVALUATION_AUTOMATION_GUIDELINES,
        },
        {
          role: "user",
          content: JSON.stringify({
            project_title: projectTitle,
            rubric_title: rubricTitle,
            comment,
            assessment_title: assessmentTitle || null,
            assessment_source_text: assessmentSourceText?.slice(0, 50000) || null,
            assessment_prompt: assessmentPrompt || null,
            target_grade: targetGrade || null,
            teacher_guidance: teacherGuidance || null,
            evaluation_goal: evaluationGoal || null,
            achievement_standards: achievementStandards ?? null,
            criteria: criteria.map((criterion) => ({
              criterion_id: criterion.id,
              label: criterion.label,
              description: criterion.description,
              max_score: criterionScoreLevels?.[criterion.id] ? 4 : criterion.max_score,
              score_levels: criterionScoreLevels?.[criterion.id] ?? null,
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
                  enum: [
                    "근거 부족",
                    "루브릭 기준 간 모순",
                    "점수 경계에 가까움",
                    "결과물이 너무 짧거나 손상됨",
                    "학생 식별자 누락",
                    "기존 교사 평가와 큰 차이",
                    "평가지 연결 불명확",
                    "답안이 주제와 관련이 약함",
                    "영역별 점수 차이가 큼",
                    "두 수준 사이 판단 필요",
                  ],
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
