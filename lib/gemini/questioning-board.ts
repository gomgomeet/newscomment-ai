import "server-only";

import type {
  ChatResult,
  MaterialAnalysis,
  QuestioningChatbotBehavior,
  RubricCriterion,
} from "@/lib/questioning-board";

type GeminiApiPayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: unknown;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  error?: {
    message?: string;
  };
};

type GeminiPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    };

type JsonSchema = Record<string, unknown>;

function getModel(modelOverride?: string) {
  return modelOverride?.trim() || process.env.GEMINI_QUESTIONING_MODEL || "gemini-2.5-flash";
}

function getApiKey(apiKeyOverride?: string) {
  const key = apiKeyOverride?.trim() || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Gemini API 키가 설정되어 있지 않습니다.");
  }

  return key;
}

function extractOutputText(response: GeminiApiPayload) {
  const textParts = response.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean);

  return textParts?.length ? textParts.join("") : null;
}

function parseJsonObject(outputText: string) {
  const parsed = JSON.parse(outputText) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Gemini 응답이 JSON 객체 형식이 아닙니다.");
  }
  return parsed as Record<string, unknown>;
}

function parseImageDataUrl(imageDataUrl: string) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(imageDataUrl);
  const mimeType = match?.[1];
  const data = match?.[2];

  if (!mimeType?.startsWith("image/") || !data) {
    throw new Error("Gemini에 보낼 이미지 데이터 형식이 올바르지 않습니다.");
  }

  return { mimeType, data };
}

async function requestGeminiJson({
  apiKey,
  model,
  systemInstruction,
  parts,
  responseSchema,
  maxOutputTokens,
}: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  parts: GeminiPart[];
  responseSchema: JsonSchema;
  maxOutputTokens: number;
}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        maxOutputTokens,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
      },
      store: false,
    }),
  });

  const rawText = await response.text();
  let raw: GeminiApiPayload;

  try {
    raw = JSON.parse(rawText) as GeminiApiPayload;
  } catch {
    throw new Error("Gemini API가 읽을 수 없는 응답을 반환했습니다.");
  }

  if (!response.ok) {
    throw new Error(raw.error?.message || "Gemini API 요청에 실패했습니다.");
  }

  const outputText = extractOutputText(raw);
  if (!outputText) {
    const blockedReason = raw.promptFeedback?.blockReasonMessage || raw.promptFeedback?.blockReason;
    const finishReason = raw.candidates?.[0]?.finishReason;
    throw new Error(
      blockedReason ||
        (finishReason ? `Gemini가 응답 생성을 마쳤지만 결과가 비어 있습니다. (${finishReason})` : "Gemini 응답에서 결과 텍스트를 찾을 수 없습니다."),
    );
  }

  return parseJsonObject(outputText);
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
    value === "extension" ||
    value === "reflection" ||
    value === "off_topic" ||
    value === "safety"
  );
}

const materialAnalysisSchema: JsonSchema = {
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
};

const chatResponseSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "answer",
    "followUpQuestion",
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
    followUpQuestion: { type: "string" },
    questionType: {
      type: "string",
      enum: ["fact", "inference", "application", "extension", "reflection", "off_topic", "safety"],
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
};

export async function analyzeMaterialImageWithGemini({
  imageDataUrl,
  standard,
  targetGrade,
  subjectUnit,
  teacherNotes,
  apiKey: apiKeyOverride,
  model: modelOverride,
}: {
  imageDataUrl: string;
  standard: string;
  targetGrade: string;
  subjectUnit: string;
  teacherNotes: string;
  apiKey?: string;
  model?: string;
}): Promise<MaterialAnalysis & { model: string }> {
  const apiKey = getApiKey(apiKeyOverride);
  const model = getModel(modelOverride);
  const image = parseImageDataUrl(imageDataUrl);
  const parsed = await requestGeminiJson({
    apiKey,
    model,
    maxOutputTokens: 6000,
    systemInstruction:
      "You help Korean teachers turn classroom source-material images into safe source-bounded knowledge for a questioning chatbot. The visibleText field must preserve every readable source-text passage in original order without summarizing or paraphrasing. Return Korean JSON only.",
    parts: [
      {
        text: JSON.stringify({
          task:
            "이미지 속 질문 자료를 분석해 질문하기 수업용 챗봇에 연결하세요. visibleText에는 읽을 수 있는 전체 텍스트를 원래 순서와 문단 구조대로 빠짐없이 옮기고 요약하거나 재서술하지 마세요. summary는 챗봇 내부 판단용으로만 짧게 작성하세요. 사진 속 학생 개인정보나 식별 정보는 visibleText에서도 제외하거나 가리세요.",
          displayPolicy:
            "학생 화면에는 visibleText 전체를 생략 없이 표시하며 summary는 학생 화면에 대신 표시하지 않습니다.",
          targetGrade,
          subjectUnit,
          standard,
          teacherNotes,
        }),
      },
      {
        inlineData: image,
      },
    ],
    responseSchema: materialAnalysisSchema,
  });

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

export async function answerQuestionWithGemini({
  standard,
  targetGrade,
  subjectUnit,
  material,
  rubric,
  behavior,
  question,
  conversation = [],
  apiKey: apiKeyOverride,
  model: modelOverride,
}: {
  standard: string;
  targetGrade: string;
  subjectUnit: string;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  behavior: QuestioningChatbotBehavior;
  question: string;
  conversation?: { role: "student" | "assistant"; content: string }[];
  apiKey?: string;
  model?: string;
}): Promise<ChatResult & { model: string }> {
  const apiKey = getApiKey(apiKeyOverride);
  const model = getModel(modelOverride);
  const parsed = await requestGeminiJson({
    apiKey,
    model,
    maxOutputTokens: 2400,
    systemInstruction:
      "You are a Korean classroom dialogue partner grounded in the teacher's lesson material. Treat every student turn as a question, answer, or thought that deserves a concrete response. First acknowledge and respond to what the student actually said, then ask exactly one natural follow-up that helps the student think more clearly or deeply without naming question types or analyzing question quality. Classification and rubric fields are teacher-only metadata and must never appear in answer or followUpQuestion. Apply the teacher's behavior settings, but never let them override privacy, safety, copyright, or anti-answer-copying rules. Return Korean JSON only.",
    parts: [
      {
        text: JSON.stringify({
          task:
            "학생이 한 질문·대답·생각을 먼저 구체적으로 받아 주고 자료와 연결해 응답하세요. 이어지는 후속 질문 하나로 학생이 스스로 더 분명하고 깊게 묻게 하며, 질문 유형과 루브릭 정보는 교사용 내부 데이터로만 만드세요.",
          targetGrade,
          subjectUnit,
          standard,
          material,
          teacherBehaviorSettings: behavior,
          rubric: rubric.map((criterion) => ({
            key: criterion.key,
            label: criterion.label,
            description: criterion.description,
            observableEvidence: criterion.observableEvidence,
            feedbackForward: criterion.feedbackForward,
          })),
          recentConversation: conversation.slice(-8),
          studentTurn: question,
          responseRules: [
            "학생 발화가 질문이면 자료에 근거해 답하고, 대답이나 생각이면 그 구체적인 내용을 먼저 받아 주고 이어서 대화하기",
            "answer와 followUpQuestion에서 사실·추론·적용·확장·성찰 같은 질문 유형 이름이나 질문 분석 결과를 말하지 않기",
            "수업 자료에 있는 내용은 전체 질문 자료의 구체적인 사실과 표현을 근거로 바로 답하기",
            "followUpQuestion에는 학생이 자신의 생각을 이어 말하거나 새로운 궁금증을 만들 수 있는 짧고 자연스러운 질문을 정확히 하나만 쓰기",
            "최근 대화가 있으면 앞서 한 답과 후속 질문을 이어 받고 같은 안내를 기계적으로 반복하지 않기",
            "질문 유형, 근거 확인, 질문 개선, 루브릭 점수는 학생 화면에 노출하지 않는 교사용 내부 메타데이터로만 작성하기",
            "자료에는 없지만 수업 내용과 직접 관련된 확장 질문은 확장 질문으로 분류하기",
            "자료에 직접 없는 내용은 질문 유형 이름을 말하지 않고, 수업 주제와 연결되는 범위와 추가 확인이 필요함을 자연스럽게 설명하기",
            "실시간 리서치 출처가 제공되지 않았으면 출처를 지어내지 말고, 확인해야 할 검색어·출처 유형·점검 질문을 제안하기",
            "수업 내용과 상관없는 질문에는 '수업 내용과 관련된 질문에 대해서만 응답할 수 있어요.'라고 답하고 수업 자료와 연결해 다시 묻게 하기",
            "학생 발화가 짧거나 막연해도 가능한 의미를 먼저 받아 준 뒤, 후속 질문으로 내용을 구체화하도록 돕기",
            "답변은 2-4문장으로 짧게 하기",
            "자료 속 근거 확인은 evidencePrompt에서 안내하되 직접 답변을 대신하지 않기",
            "개인정보, 정답 대필, 원문 전체 복사 요청은 거절하기",
            "성찰 질문은 자기 질문과 이해 과정을 돌아보게 하기",
            `교사가 지정한 범위 밖 질문 응답 문구 사용하기: ${behavior.offTopicResponse}`,
            `질문이 지나치게 짧거나 모호하면 다음 격려와 힌트를 사용하기: ${behavior.insufficientQuestionResponse}`,
            `교사의 추가 챗봇 지시를 반영하기: ${behavior.additionalInstructions}`,
          ],
        }),
      },
    ],
    responseSchema: chatResponseSchema,
  });

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
    followUpQuestion:
      typeof parsed.followUpQuestion === "string"
        ? parsed.followUpQuestion
        : "이 답과 연결해 더 궁금한 점은 무엇인가요?",
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
