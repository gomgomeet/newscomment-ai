import Anthropic from "@anthropic-ai/sdk";
import {
  AI_DRAFT_REVIEW_REASONS,
  isEvaluationPayload,
  type AiDraftCriterion,
  type AiEvaluationInput,
  type AiEvaluationResult,
} from "@/lib/evaluation/ai-draft-contract";

export const DEFAULT_ANTHROPIC_EVALUATION_MODEL = "claude-fable-5-1";

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
type EffortLevel = (typeof EFFORT_LEVELS)[number];

// Fable 5.1은 thinking이 항상 켜져 있으므로 `thinking` 파라미터를 보내지 않는다.
// 깊이는 output_config.effort로만 조절한다. 기본값(high)이면 생략한다.
function readEffort(): EffortLevel | undefined {
  const value = process.env.ANTHROPIC_EVALUATION_EFFORT;
  return EFFORT_LEVELS.includes(value as EffortLevel) ? (value as EffortLevel) : undefined;
}

const SYSTEM_INSTRUCTION =
  "You help teachers draft evidence-grounded evaluations of student work. For each criterion, quote a short exact passage from the student work before assigning a score. Never invent evidence. Score conservatively against the provided rubric and never exceed a criterion's max_score. Write feedback and rationale in Korean. If evidence is weak, lower confidence and add a review reason. The teacher makes the final decision.";

// 구조화 출력 스키마. Fable 5.1에서는 강제 도구 호출(tool_choice any/tool)이 거부되므로
// JSON이 필요하면 output_config.format을 쓴다. 숫자 범위 제약은 스키마가 아니라
// isEvaluationPayload에서 검사한다.
function buildOutputSchema(criteria: AiDraftCriterion[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["feedback", "evaluation_forward", "confidence", "review_reasons", "scores"],
    properties: {
      feedback: { type: "string", description: "학생에게 전달할 한국어 피드백 초안" },
      evaluation_forward: { type: "string", description: "교사가 확인할 평가 포워드(다음 지도 방향)" },
      confidence: { type: "number", description: "0과 1 사이의 확신도" },
      review_reasons: {
        type: "array",
        items: { type: "string", enum: [...AI_DRAFT_REVIEW_REASONS] },
      },
      scores: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["criterion_id", "score", "evidence_quote", "rationale"],
          properties: {
            criterion_id: { type: "string", enum: criteria.map((criterion) => criterion.id) },
            score: { type: "number" },
            evidence_quote: { type: "string", description: "학생 결과물에서 그대로 인용한 짧은 근거" },
            rationale: { type: "string", description: "점수를 준 이유(한국어)" },
          },
        },
      },
    },
  };
}

export async function evaluateCommentWithClaude({
  projectTitle,
  rubricTitle,
  comment,
  criteria,
  evaluationGoal,
  achievementStandards,
}: AiEvaluationInput): Promise<AiEvaluationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_EVALUATION_MODEL || DEFAULT_ANTHROPIC_EVALUATION_MODEL;
  const effort = readEffort();

  // 루브릭 컨텍스트는 같은 수업활동의 댓글 전체에 공통이므로 system 블록에 두고
  // 캐시 경계를 잡는다. 댓글마다 달라지는 내용은 user 메시지에만 넣는다.
  const rubricContext = JSON.stringify({
    project_title: projectTitle,
    rubric_title: rubricTitle,
    evaluation_goal: evaluationGoal || null,
    achievement_standards: achievementStandards ?? null,
    criteria: criteria.map((criterion) => ({
      criterion_id: criterion.id,
      label: criterion.label,
      description: criterion.description,
      max_score: criterion.max_score,
    })),
  });

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    // 안전 분류기가 요청을 거절하면 서버가 추천 대체 모델로 같은 요청을 다시 실행한다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      ...(effort ? { effort } : {}),
      format: { type: "json_schema", schema: buildOutputSchema(criteria) },
    },
    system: [
      { type: "text", text: SYSTEM_INSTRUCTION },
      { type: "text", text: `Rubric context:\n${rubricContext}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: `Student work:\n${comment}` }],
  });

  if (response.stop_reason === "refusal") {
    const explanation = response.stop_details?.explanation;
    throw new Error(explanation ? `Claude가 평가 요청을 거절했습니다: ${explanation}` : "Claude가 평가 요청을 거절했습니다.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude 평가 응답이 길이 제한에 걸려 잘렸습니다.");
  }

  const outputText = response.content.find((block) => block.type === "text")?.text;
  if (!outputText) {
    throw new Error("Claude 평가 응답에서 결과 텍스트를 찾을 수 없습니다.");
  }

  const parsed = JSON.parse(outputText) as unknown;
  if (!isEvaluationPayload(parsed)) {
    throw new Error("Claude 평가 응답 형식이 올바르지 않습니다.");
  }

  return {
    // fallback이 작동했으면 실제로 답한 모델이 기록되도록 응답의 model을 쓴다.
    model: response.model,
    feedback: parsed.feedback,
    evaluation_forward: parsed.evaluation_forward,
    confidence: parsed.confidence,
    review_reasons: parsed.review_reasons,
    scores: parsed.scores,
    raw: { response, parsed },
  };
}
