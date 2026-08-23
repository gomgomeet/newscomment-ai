import { answerQuestionWithOpenAI } from "@/lib/openai/questioning-board";
import type { MaterialAnalysis, RubricCriterion } from "@/lib/questioning-board";

type ChatRequest = {
  standard?: unknown;
  targetGrade?: unknown;
  subjectUnit?: unknown;
  material?: unknown;
  rubric?: unknown;
  question?: unknown;
};

function isMaterialAnalysis(value: unknown): value is MaterialAnalysis {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const material = value as Partial<MaterialAnalysis>;
  return typeof material.summary === "string" && Array.isArray(material.keyConcepts);
}

function isRubric(value: unknown): value is RubricCriterion[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const criterion = item as Partial<RubricCriterion>;
    return typeof criterion.key === "string" && typeof criterion.label === "string";
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!question) {
      return Response.json({ error: "학생 질문을 입력해 주세요." }, { status: 400 });
    }

    if (!isMaterialAnalysis(body.material)) {
      return Response.json({ error: "수업 자료 요약을 먼저 준비해 주세요." }, { status: 400 });
    }

    if (!isRubric(body.rubric)) {
      return Response.json({ error: "평가 루브릭을 먼저 준비해 주세요." }, { status: 400 });
    }

    const result = await answerQuestionWithOpenAI({
      standard: typeof body.standard === "string" ? body.standard : "",
      targetGrade: typeof body.targetGrade === "string" ? body.targetGrade : "",
      subjectUnit: typeof body.subjectUnit === "string" ? body.subjectUnit : "",
      material: body.material,
      rubric: body.rubric,
      question,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "챗봇 응답 생성에 실패했습니다.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
