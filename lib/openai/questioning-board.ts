import type { ChatResult, MaterialAnalysis, RubricCriterion } from "@/lib/questioning-board";

type ResponsesApiPayload = {
  output_text?: unknown;
  output?: unknown;
  error?: {
    message?: string;
  };
};

function getModel() {
  return process.env.OPENAI_QUESTIONING_MODEL || process.env.OPENAI_EVALUATION_MODEL || "gpt-5.6";
}

function extractOutputText(response: ResponsesApiPayload) {
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

function parseJsonObject(outputText: string) {
  const parsed = JSON.parse(outputText) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("AI 응답이 JSON 객체 형식이 아닙니다.");
  }
  return parsed as Record<string, unknown>;
}

function ensureStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function isChatQuestionType(value: unknown): value is ChatResult["questionType"] {
  return (
    value === "fact" ||
    value === "inference" ||
    value === "application" ||
    value === "reflection" ||
    value === "off_topic" ||
    value === "safety"
  );
}

export async function analyzeMaterialImageWithOpenAI({
  imageDataUrl,
  standard,
  targetGrade,
  subjectUnit,
  teacherNotes,
}: {
  imageDataUrl: string;
  standard: string;
  targetGrade: string;
  subjectUnit: string;
  teacherNotes: string;
}): Promise<MaterialAnalysis & { model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const model = getModel();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1600,
      input: [
        {
          role: "system",
          content:
            "You help Korean teachers turn classroom source-material images into safe source-bounded knowledge for a questioning chatbot. Return Korean JSON only.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                task:
                  "이미지 속 수업 자료를 분석해 질문하기 수업용 챗봇 지식베이스로 쓸 수 있게 정리하세요. 사진 속 학생 개인정보나 식별 정보는 기록하지 마세요.",
                targetGrade,
                subjectUnit,
                standard,
                teacherNotes,
              }),
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "auto",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "questioning_material_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "materialTitle",
              "summary",
              "visibleText",
              "keyConcepts",
              "possibleMisconceptions",
              "questionSeeds",
              "sourceLimit",
              "safetyNotice",
            ],
            properties: {
              materialTitle: { type: "string" },
              summary: { type: "string" },
              visibleText: { type: "string" },
              keyConcepts: { type: "array", items: { type: "string" } },
              possibleMisconceptions: { type: "array", items: { type: "string" } },
              questionSeeds: { type: "array", items: { type: "string" } },
              sourceLimit: { type: "string" },
              safetyNotice: { type: "string" },
            },
          },
        },
      },
    }),
  });

  const raw = (await response.json()) as ResponsesApiPayload;
  if (!response.ok) {
    throw new Error(raw.error?.message || "이미지 분석 요청에 실패했습니다.");
  }

  const outputText = extractOutputText(raw);
  if (!outputText) {
    throw new Error("이미지 분석 응답에서 결과 텍스트를 찾을 수 없습니다.");
  }

  const parsed = parseJsonObject(outputText);
  return {
    materialTitle: typeof parsed.materialTitle === "string" ? parsed.materialTitle : "수업 자료",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    visibleText: typeof parsed.visibleText === "string" ? parsed.visibleText : "",
    keyConcepts: ensureStringArray(parsed.keyConcepts),
    possibleMisconceptions: ensureStringArray(parsed.possibleMisconceptions),
    questionSeeds: ensureStringArray(parsed.questionSeeds),
    sourceLimit:
      typeof parsed.sourceLimit === "string"
        ? parsed.sourceLimit
        : "분석된 수업 자료 범위 안에서만 답합니다.",
    safetyNotice:
      typeof parsed.safetyNotice === "string"
        ? parsed.safetyNotice
        : "개인정보와 학생 식별 정보는 입력하지 않습니다.",
    model,
  };
}

export async function answerQuestionWithOpenAI({
  standard,
  targetGrade,
  subjectUnit,
  material,
  rubric,
  question,
}: {
  standard: string;
  targetGrade: string;
  subjectUnit: string;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  question: string;
}): Promise<ChatResult & { model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const model = getModel();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1800,
      input: [
        {
          role: "system",
          content:
            "You are a Korean classroom question-coach chatbot. Answer only from the supplied lesson material. Do not write homework answers for students. Return Korean JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "학생 질문에 답하고, 사실/추론/적용/성찰/범위 밖/안전 확인 중 하나로 분류한 뒤, 교사가 평가와 피드백에 쓸 수 있는 자료를 만드세요.",
            targetGrade,
            subjectUnit,
            standard,
            material,
            rubric: rubric.map((criterion) => ({
              key: criterion.key,
              label: criterion.label,
              description: criterion.description,
              observableEvidence: criterion.observableEvidence,
              feedbackForward: criterion.feedbackForward,
            })),
            studentQuestion: question,
            responseRules: [
              "수업 자료 범위 안에서만 답하기",
              "답변은 2-4문장으로 짧게 하기",
              "자료 속 근거 확인을 반드시 요구하기",
              "자료 밖 질문은 추측하지 않고 수업 질문으로 전환하기",
              "개인정보, 정답 대필, 원문 전체 복사 요청은 거절하기",
              "성찰 질문은 자기 질문과 이해 과정을 돌아보게 하기",
            ],
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "questioning_chat_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "answer",
              "questionType",
              "typeLabel",
              "typeReason",
              "evidencePrompt",
              "revisionSuggestion",
              "evaluationSignals",
              "teacherFeedback",
              "rubricScores",
              "safetyFlag",
            ],
            properties: {
              answer: { type: "string" },
              questionType: {
                type: "string",
                enum: ["fact", "inference", "application", "reflection", "off_topic", "safety"],
              },
              typeLabel: { type: "string" },
              typeReason: { type: "string" },
              evidencePrompt: { type: "string" },
              revisionSuggestion: { type: "string" },
              evaluationSignals: { type: "array", items: { type: "string" } },
              teacherFeedback: { type: "string" },
              rubricScores: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["criterionKey", "score", "rationale"],
                  properties: {
                    criterionKey: { type: "string" },
                    score: { type: "number" },
                    rationale: { type: "string" },
                  },
                },
              },
              safetyFlag: { type: "boolean" },
            },
          },
        },
      },
    }),
  });

  const raw = (await response.json()) as ResponsesApiPayload;
  if (!response.ok) {
    throw new Error(raw.error?.message || "챗봇 응답 요청에 실패했습니다.");
  }

  const outputText = extractOutputText(raw);
  if (!outputText) {
    throw new Error("챗봇 응답에서 결과 텍스트를 찾을 수 없습니다.");
  }

  const parsed = parseJsonObject(outputText);
  const rubricScores = Array.isArray(parsed.rubricScores)
    ? parsed.rubricScores
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({
          criterionKey: typeof item.criterionKey === "string" ? item.criterionKey : "",
          score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : 1,
          rationale: typeof item.rationale === "string" ? item.rationale : "",
        }))
        .filter((item) => item.criterionKey)
    : [];

  const questionType = isChatQuestionType(parsed.questionType) ? parsed.questionType : "fact";

  return {
    answer: typeof parsed.answer === "string" ? parsed.answer : "",
    questionType,
    typeLabel: typeof parsed.typeLabel === "string" ? parsed.typeLabel : "",
    typeReason: typeof parsed.typeReason === "string" ? parsed.typeReason : "",
    evidencePrompt: typeof parsed.evidencePrompt === "string" ? parsed.evidencePrompt : "",
    revisionSuggestion: typeof parsed.revisionSuggestion === "string" ? parsed.revisionSuggestion : "",
    evaluationSignals: ensureStringArray(parsed.evaluationSignals),
    teacherFeedback: typeof parsed.teacherFeedback === "string" ? parsed.teacherFeedback : "",
    rubricScores,
    safetyFlag: typeof parsed.safetyFlag === "boolean" ? parsed.safetyFlag : false,
    model,
  };
}
