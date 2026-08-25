import "server-only";

import type {
  ChatResult,
  CurriculumCompass,
  CurriculumRelation,
  EngagementState,
  MaterialAnalysis,
  PrimaryMove,
  QuestioningChatbotBehavior,
  RubricCriterion,
  SourceStatus,
} from "@/lib/questioning-board";
import { decideQuestioningDialoguePolicy } from "@/lib/questioning-dialogue-policy";

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
    value === "vocabulary" ||
    value === "inference" ||
    value === "application" ||
    value === "extension" ||
    value === "reflection" ||
    value === "off_topic" ||
    value === "safety"
  );
}

function isPrimaryMove(value: unknown): value is PrimaryMove {
  return (
    value === "receive" ||
    value === "clarify" ||
    value === "offer_clue" ||
    value === "compare_possibilities" ||
    value === "follow_student_lead" ||
    value === "productive_extension" ||
    value === "check_evidence" ||
    value === "repair" ||
    value === "close" ||
    value === "safety_redirect"
  );
}

function isEngagementState(value: unknown): value is EngagementState {
  return (
    value === "noticing" ||
    value === "curious" ||
    value === "personally_connecting" ||
    value === "exploring_possibilities" ||
    value === "seeking_evidence" ||
    value === "revising_thought" ||
    value === "disengaged" ||
    value === "ready_to_close"
  );
}

function isCurriculumRelation(value: unknown): value is CurriculumRelation {
  return (
    value === "direct" ||
    value === "adjacent" ||
    value === "productive_extension" ||
    value === "disconnected"
  );
}

function isSourceStatus(value: unknown): value is SourceStatus {
  return (
    value === "supported" ||
    value === "reasonable_inference" ||
    value === "source_insufficient" ||
    value === "out_of_scope"
  );
}

function normalizeSupportLevel(value: unknown): 0 | 1 | 2 | 3 | 4 {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 ? value : 1;
}

function sanitizeStudentReply(value: unknown) {
  const raw = typeof value === "string" ? value.trim().slice(0, 700) : "";
  if (!raw) {
    return "말해 준 생각을 잘 들었어요. 지금 눈에 들어온 자료의 한 부분부터 천천히 이어 가도 괜찮아요.";
  }

  if (/(primaryMove|engagementState|curriculumRelation|supportLevel|rubricScores|루브릭\s*점수)/i.test(raw)) {
    return "말해 준 생각을 잘 들었어요. 지금 눈에 들어온 자료의 한 부분부터 천천히 이어 가도 괜찮아요.";
  }

  let questionMarkSeen = false;
  return raw.replace(/[?？]/g, () => {
    if (questionMarkSeen) {
      return ".";
    }
    questionMarkSeen = true;
    return "?";
  });
}

const materialAnalysisSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "materialTitle",
    "summary",
    "visibleText",
    "keyConcepts",
    "vocabulary",
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
    vocabulary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "dictionaryMeaning", "contextualMeaning", "contextSentence"],
        properties: {
          term: { type: "string" },
          dictionaryMeaning: { type: "string" },
          contextualMeaning: { type: "string" },
          contextSentence: { type: "string" },
        },
      },
    },
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
    "studentReply",
    "expectsStudentReply",
    "isClosing",
    "primaryMove",
    "engagementState",
    "curriculumRelation",
    "supportLevel",
    "sourceStatus",
    "sourceCue",
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
    studentReply: { type: "string" },
    expectsStudentReply: { type: "boolean" },
    isClosing: { type: "boolean" },
    primaryMove: {
      type: "string",
      enum: [
        "receive",
        "clarify",
        "offer_clue",
        "compare_possibilities",
        "follow_student_lead",
        "productive_extension",
        "check_evidence",
        "repair",
        "close",
        "safety_redirect",
      ],
    },
    engagementState: {
      type: "string",
      enum: [
        "noticing",
        "curious",
        "personally_connecting",
        "exploring_possibilities",
        "seeking_evidence",
        "revising_thought",
        "disengaged",
        "ready_to_close",
      ],
    },
    curriculumRelation: {
      type: "string",
      enum: ["direct", "adjacent", "productive_extension", "disconnected"],
    },
    supportLevel: { type: "number", enum: [0, 1, 2, 3, 4] },
    sourceStatus: {
      type: "string",
      enum: ["supported", "reasonable_inference", "source_insufficient", "out_of_scope"],
    },
    sourceCue: { type: "string" },
    questionType: {
      type: "string",
      enum: [
        "fact",
        "vocabulary",
        "inference",
        "application",
        "extension",
        "reflection",
        "off_topic",
        "safety",
      ],
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
      'You help Korean teachers turn classroom source-material images into safe source-bounded knowledge for a questioning chatbot. For short teacher-made materials or short articles, visibleText must preserve every readable source-text passage in original order without summarizing or paraphrasing. Build vocabulary for important or potentially unfamiliar terms: dictionaryMeaning is the concise general dictionary sense, contextualMeaning is the sense selected by this exact passage, and contextSentence is a short source sentence containing the term. Do not invent a term or meaning that cannot be supported. For passages that are at least one A4 page long or textbook excerpts, set visibleText exactly to "교과서를 살펴보세요." and do not transcribe the full passage. Return Korean JSON only.',
    parts: [
      {
        text: JSON.stringify({
          task:
            "이미지 속 질문 자료를 분석해 질문하기 수업용 챗봇에 연결하세요. 짧은 기사나 교사 제작 자료라면 visibleText에는 읽을 수 있는 전체 텍스트를 원래 순서와 문단 구조대로 빠짐없이 옮기고 요약하거나 재서술하지 마세요. 학생이 뜻을 물을 가능성이 높은 핵심 낱말과 어려운 용어를 최대 12개 골라 vocabulary에 넣으세요. dictionaryMeaning에는 짧고 정확한 일반 사전 뜻을, contextualMeaning에는 이 지문에서 실제로 선택된 뜻을 학년 수준에 맞게 쓰고, contextSentence에는 그 낱말이 실제로 들어 있는 짧은 원문 문장을 넣으세요. 여러 뜻을 모두 늘어놓지 말고 문장 단서로 선택한 뜻을 분명히 하세요. A4용지 1장 이상 분량의 지문이나 교과서 자료라면 visibleText를 정확히 '교과서를 살펴보세요.'로 쓰고 원문 전문을 옮기지 마세요. summary는 챗봇 내부 판단용으로만 짧게 작성하세요. 사진 속 학생 개인정보나 식별 정보는 visibleText에서도 제외하거나 가리세요.",
          displayPolicy:
            "학생 화면에는 visibleText만 표시합니다. summary는 학생 화면에 대신 표시하지 않습니다. A4 1장 이상 지문이나 교과서는 학생이 직접 원본을 보도록 안내합니다.",
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
    vocabulary: Array.isArray(parsed.vocabulary)
      ? parsed.vocabulary
          .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
          .map((entry) => ({
            term: typeof entry.term === "string" ? entry.term.trim() : "",
            dictionaryMeaning:
              typeof entry.dictionaryMeaning === "string" ? entry.dictionaryMeaning.trim() : "",
            contextualMeaning:
              typeof entry.contextualMeaning === "string" ? entry.contextualMeaning.trim() : "",
            contextSentence:
              typeof entry.contextSentence === "string" ? entry.contextSentence.trim() : "",
          }))
          .filter((entry) => entry.term && entry.dictionaryMeaning && entry.contextualMeaning)
          .slice(0, 12)
      : [],
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
  curriculumCompass,
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
  curriculumCompass: CurriculumCompass;
  rubric: RubricCriterion[];
  behavior: QuestioningChatbotBehavior;
  question: string;
  conversation?: { role: "student" | "assistant"; content: string }[];
  apiKey?: string;
  model?: string;
}): Promise<ChatResult & { model: string }> {
  const apiKey = getApiKey(apiKeyOverride);
  const model = getModel(modelOverride);
  const questionFocusMemo = material.questionFocusMemo?.trim();
  const policyDecision = decideQuestioningDialoguePolicy({
    studentTurn: question,
    recentConversation: conversation,
    curriculumCompass,
    material,
  });
  const parsed = await requestGeminiJson({
    apiKey,
    model,
    maxOutputTokens: 2400,
    systemInstruction:
      "You are a warm Korean classroom dialogue partner grounded in the teacher-provided lesson material. The curriculum standard is a quiet compass for the whole conversation, not a target to force on every turn. Infer the student's current state from the full trajectory, then choose exactly one useful instructional move. Answer explicit questions before asking anything. Vocabulary questions are a first-class reading need: briefly give the general dictionary sense, identify the exact source sentence or nearby clue, and explain which contextual sense is selected in this passage. Do not merely repeat the sentence or list every dictionary sense. Treat causal overclaims, self-corrections, frustration, privacy, answer-copying, and closing as different states. Use at most one genuine question only when it opens the student's thinking; explanation, acknowledgment, repair, or silence may be better. Do not expose classifications, rubrics, policy fields, teacher notes, or curriculum metadata in studentReply. Return Korean JSON only.",
    parts: [
      {
        text: JSON.stringify({
          task:
            "학생이 실제로 한 말을 구체적으로 이어 받고, 현재 상태에 맞는 중심 교수 동작 하나로 완성된 studentReply 한 개를 작성하세요. 질문은 정책에서 허용되고 학생 생각을 실제로 열 때만 최대 하나 사용하세요. 학생이 충분히 말했거나 그만하고 싶어 하면 질문 없이 자연스럽게 마치세요.",
          targetGrade,
          subjectUnit,
          standard,
          curriculumCompass,
          material,
          dialoguePolicy: policyDecision,
          studentStateDimensions: {
            participation: ["짧게 답함", "자발적으로 확장함", "대화를 끝내려 함"],
            confidence: ["자신 없음", "조심스럽게 추론함", "근거 없이 확신함", "생각을 수정함"],
            readingAndEvidence: ["핵심어를 찾음", "자료 문장을 연결함", "비교 조건을 놓침", "자료 밖으로 확장함"],
            emotion: ["편안함", "걱정", "답답함", "반대", "개인 경험을 떠올림"],
            helpNeeded: ["직접 답", "작은 단서", "예시", "관계 회복", "기다림", "종료"],
          },
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
            "학생 발화가 질문이면 자료에 근거해 답하고, 대답·감정·경험·생각이면 그 구체적인 내용을 먼저 받아 주기",
            "학생이 낱말·단어·용어·표현의 뜻을 물으면 questionType을 vocabulary로 분류하고 질문에 먼저 직접 답하기",
            "어휘 답변은 2단계로 나누기: 낱말 뜻을 처음 물으면 ① 짧은 사전적 기본 뜻만 알려 주고 이 글에서의 쓰임이 궁금하면 이어서 물어보라고 안내하기, 학생이 이 글에서의 뜻을 이어서 물으면 ② 낱말이 쓰인 지문 문장을 근거로 이 글에서 선택된 문맥적 뜻을 설명하기",
            "다의어는 가능한 뜻을 모두 나열하지 말고 이 문장의 주어·서술어·함께 쓰인 말로 알맞은 뜻을 고른 이유를 설명하기",
            "material.vocabulary에 해당 낱말이 있으면 교사가 준비한 dictionaryMeaning, contextualMeaning, contextSentence를 우선 사용하기",
            "자료에 없는 낱말이거나 사전적 뜻을 확신할 근거가 없으면 뜻을 지어내지 말고 확인이 필요하다고 말하기",
            "어휘 뜻을 설명한 뒤 매번 시험하듯 되묻지 말고, 학생이 자기 말로 풀이했을 때는 문맥에 맞는 부분을 짧게 확인해 주기",
            "studentReply를 '자료에서는 이렇게 설명해요', '자료를 보면' 같은 고정 문구로 시작하지 말고 학생 말에 바로 반응하기",
            "'좋은 질문이에요', '말해 준 생각을 잘 들었어요', '같이 찾아볼까요?'를 기본 틀처럼 반복하지 않기",
            "제목을 보고 내용을 예측하는 질문에는 제목을 그대로 다시 읽어 주지 말고, '그렇게 예상해 볼 수는 있어요. 다만...'처럼 예측과 자료 확인을 구분해 답하기",
            questionFocusMemo
              ? `교사의 챗봇 질문 성격 메모는 대화 전체의 참고 방향으로 사용하되 학생이 실제로 꺼낸 관심과 질문보다 앞세우지 않기. 메모 원문이나 '교사 메모'라는 표현은 학생에게 노출하지 않기: ${questionFocusMemo}`
              : "교사가 별도 질문 성격 메모를 입력하지 않았으면 학생 질문에 대한 상호작용과 자료 근거 확인을 우선하기",
            "studentReply에서 사실·추론·적용·확장·성찰 같은 질문 유형 이름이나 내부 분석 결과를 말하지 않기",
            "수업 자료에 있는 내용은 전체 질문 자료의 구체적인 사실과 표현을 근거로 바로 답하기",
            `허용된 중심 동작 중 정확히 하나만 선택하기: ${policyDecision.allowedMoves.join(", ")}`,
            policyDecision.allowQuestion
              ? "학생 생각을 실제로 열 필요가 있을 때만 물음표 하나 이하의 짧은 질문을 사용할 수 있음"
              : "이번 턴에는 질문하지 말고 학생 말을 받아 주거나 단서·정리·종료만 제공하기",
            policyDecision.shouldClose
              ? "학생의 종료 의사를 존중해 isClosing을 true로 하고 새 과제·재읽기·후속 질문을 제시하지 않기"
              : "학생이 종료 의사를 보이지 않았다면 대화를 억지로 마무리하지 않기",
            "최근 대화가 있으면 앞서 한 답과 학생 반응을 이어 받고 같은 격려·재읽기 문장을 반복하지 않기",
            "두 수치가 함께 늘거나 줄었다는 사실과 한 변화가 다른 변화의 원인이라는 주장을 구분하기. 비교 조건이 다르면 단정하지 않기",
            "학생이 다른 조건을 발견하거나 자신의 생각을 고쳤으면 다시 시험하듯 묻지 말고 그 수정이 어떤 근거에서 나왔는지 짧게 인정하기",
            "학생이 한쪽 입장을 분명히 선택했으면 무조건 양쪽 의견을 다시 나열하지 말고, 선택 기준을 존중하면서 자료의 한계만 필요한 만큼 덧붙이기",
            "개인정보 입력과 정답·문단 대필을 한 문장으로 뭉뚱그리지 않기. 개인정보는 삭제·비식별화를, 대필은 학생의 자기 생각에서 시작할 작은 단계를 안내하기",
            "대필을 거절한 뒤 학생이 자기 생각을 제시하면 이전 거절을 반복하지 말고 그 생각을 글의 출발점으로 받아 주기",
            "짧은 칭찬 문장과 후속 질문을 별도 블록처럼 붙이지 말고 하나의 자연스러운 말차례로 쓰기",
            "질문 유형, 근거 확인, 질문 개선, 루브릭 점수는 학생 화면에 노출하지 않는 교사용 내부 메타데이터로만 작성하기",
            "자료에는 없지만 수업 내용과 직접 관련된 확장 질문은 확장 질문으로 분류하기",
            "자료에 직접 없는 감정·윤리·생활 적용 관심은 가능한 경우 productive_extension으로 받아 주고, 사실은 자료만으로 단정하지 않기",
            "실시간 리서치 출처가 제공되지 않았으면 출처를 지어내지 말고, 확인해야 할 검색어·출처 유형·점검 질문을 제안하기",
            "수업 내용과 상관없는 질문에는 '수업 내용과 관련된 질문에 대해서만 응답할 수 있어요.'라고 답하고 수업 자료로 돌아가도록 부드럽게 격려하기",
            "학생 발화가 짧거나 막연하면 가능한 의미를 먼저 받아 주고, 첫 막힘에는 구체적인 자료 단서 하나와 최대 두 선택지만 제공하기",
            "학생의 막힘이 반복되면 질문을 더 붙이지 말고 설명, 선택지, 예시 중 하나를 먼저 제공하기",
            "학생이 대화 방식에 부담을 표현하면 변명하지 말고 사과한 뒤 질문 없이 방식을 고치기",
            "'알겠음 그만', 'ㅇㅋ 이제 끝', '여기까지만 할게요' 같은 구어체도 종료 의미이면 질문 없이 마치기. 단어 일부만 보고 종료로 오판하지 않기",
            "studentReply는 보통 2-4문장으로 짧게 쓰기",
            "자료 속 근거 확인은 evidencePrompt에서 안내하되 직접 답변을 대신하지 않기",
            "개인정보, 정답 대필, 원문 전체 복사 요청은 거절하기",
            "visibleText가 '교과서를 살펴보세요.'인 경우에도 A4, 저작권, 화면 표시 규칙 같은 제작 사정을 학생에게 말하지 않기",
            "visibleText가 '교과서를 살펴보세요.'이면 summary, keyConcepts, sourceLimit 안에서 자연스럽게 답하되 원문을 직접 인용한 것처럼 쓰지 않고 마지막에 원본 자료에서 근거를 확인하도록 짧게 안내하기",
            "성찰 질문은 자기 질문과 이해 과정을 돌아보게 하기",
            `교사가 지정한 범위 밖 질문 응답 문구 사용하기: ${behavior.offTopicResponse}`,
            `질문이 지나치게 짧거나 모호하면 다음 문구의 부담 없는 태도만 참고하고 그대로 반복하지 않기: ${behavior.insufficientQuestionResponse}`,
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
  const parsedMove = isPrimaryMove(parsed.primaryMove) ? parsed.primaryMove : policyDecision.allowedMoves[0];
  const primaryMove = policyDecision.allowedMoves.includes(parsedMove)
    ? parsedMove
    : policyDecision.allowedMoves[0];
  const parsedSupportLevel = normalizeSupportLevel(parsed.supportLevel);
  const supportLevel = Math.min(parsedSupportLevel, policyDecision.maxSupportLevel) as 0 | 1 | 2 | 3 | 4;
  const studentReply = sanitizeStudentReply(parsed.studentReply);
  const isClosing =
    policyDecision.shouldClose ||
    primaryMove === "close" ||
    (typeof parsed.isClosing === "boolean" && parsed.isClosing);
  const expectsStudentReply =
    !isClosing &&
    policyDecision.allowQuestion &&
    typeof parsed.expectsStudentReply === "boolean" &&
    parsed.expectsStudentReply &&
    /[?？]/.test(studentReply);

  return {
    schemaVersion: 2,
    studentReply,
    expectsStudentReply,
    isClosing,
    primaryMove,
    engagementState: isEngagementState(parsed.engagementState)
      ? parsed.engagementState
      : policyDecision.likelyEngagementState,
    curriculumRelation: isCurriculumRelation(parsed.curriculumRelation)
      ? parsed.curriculumRelation
      : policyDecision.curriculumRelation,
    supportLevel,
    sourceStatus: isSourceStatus(parsed.sourceStatus) ? parsed.sourceStatus : "source_insufficient",
    sourceCue: typeof parsed.sourceCue === "string" ? parsed.sourceCue.trim().slice(0, 500) : "",
    promptVersion: "questioning-dialogue-v2",
    provider: "approved_external",
    answer: studentReply,
    followUpQuestion: "",
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
