import { answerQuestionWithGemini } from "@/lib/gemini/questioning-board";
import {
  normalizeQuestioningChatbotBehavior,
  type MaterialAnalysis,
  type RubricCriterion,
} from "@/lib/questioning-board";

type ChatRequest = {
  standard?: unknown;
  targetGrade?: unknown;
  subjectUnit?: unknown;
  material?: unknown;
  rubric?: unknown;
  behavior?: unknown;
  question?: unknown;
  conversation?: unknown;
  apiKey?: unknown;
  model?: unknown;
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

function normalizeConversation(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      role: item.role === "assistant" ? ("assistant" as const) : ("student" as const),
      content: typeof item.content === "string" ? item.content.trim().slice(0, 1200) : "",
    }))
    .filter((item) => item.content)
    .slice(-8);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!question) {
      return Response.json({ error: "학생 질문을 입력해 주세요." }, { status: 400 });
    }

    if (!isMaterialAnalysis(body.material)) {
      return Response.json({ error: "질문 자료를 먼저 준비해 주세요." }, { status: 400 });
    }

    if (!isRubric(body.rubric)) {
      return Response.json({ error: "평가 루브릭을 먼저 준비해 주세요." }, { status: 400 });
    }

    const result = await answerQuestionWithGemini({
      standard: typeof body.standard === "string" ? body.standard : "",
      targetGrade: typeof body.targetGrade === "string" ? body.targetGrade : "",
      subjectUnit: typeof body.subjectUnit === "string" ? body.subjectUnit : "",
      material: body.material,
      rubric: body.rubric,
      behavior: normalizeQuestioningChatbotBehavior(body.behavior),
      question,
      conversation: normalizeConversation(body.conversation),
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "챗봇 응답 생성에 실패했습니다.";
    const status = message.includes("API 키") || message.includes("GEMINI_API_KEY") ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
