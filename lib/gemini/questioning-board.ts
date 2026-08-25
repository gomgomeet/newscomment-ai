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

function removeDisallowedQuestionSentences(reply: string) {
  const sentences = reply.match(/[^.!?？]+[.!?？]?/g) ?? [reply];
  const kept = sentences.filter((sentence) => !/[?？]/.test(sentence)).join(" ").trim();

  return kept || "말해 준 생각을 잘 들었어요. 지금은 여기까지 차분히 정리해도 괜찮아요.";
}

function sanitizeStudentReply(
  value: unknown,
  studentTurn = "",
  options: { allowQuestion?: boolean } = {},
) {
  const allowQuestion = options.allowQuestion ?? true;
  const raw = typeof value === "string" ? value.trim().slice(0, 700) : "";
  if (!raw) {
    return "말해 준 생각을 잘 들었어요. 지금 눈에 들어온 자료의 한 부분부터 천천히 이어 가도 괜찮아요.";
  }

  // 모델이 학생 말을 그대로 돌려보내는 일이 드물게 있다. 복창은 응답이 아니다.
  const compactReply = raw.replace(/[\s?？!.,'"'"]/g, "");
  const compactTurn = studentTurn.replace(/[\s?？!.,'"'"]/g, "");
  if (compactTurn.length >= 6 && compactReply === compactTurn) {
    return allowQuestion
      ? "좋은 질문이에요. 그 부분은 자료에서 함께 확인해 볼게요. 자료의 어느 문장이 이 질문과 이어져 보이나요?"
      : "좋은 질문이에요. 그 부분은 자료에서 함께 확인해 볼게요.";
  }

  if (/(primaryMove|engagementState|curriculumRelation|supportLevel|rubricScores|루브릭\s*점수)/i.test(raw)) {
    return "말해 준 생각을 잘 들었어요. 지금 눈에 들어온 자료의 한 부분부터 천천히 이어 가도 괜찮아요.";
  }

  let questionMarkSeen = false;
  const sanitized = raw.replace(/[?？]/g, () => {
    if (questionMarkSeen) {
      return ".";
    }
    questionMarkSeen = true;
    return "?";
  });

  return allowQuestion ? sanitized : removeDisallowedQuestionSentences(sanitized);
}

function compactKoreanTurn(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function asksToAvoidPersonalInformation(value: string) {
  const compact = compactKoreanTurn(value);
  const personalInfo = "(이름|실명|전화번호|주소|개인정보|사진|얼굴)";
  const avoidAction = "(말하지않아도|안말해도|빼도|가려도|숨겨도|익명|안써도|쓰지않아도|넣지않아도)";
  return (
    new RegExp(`${personalInfo}.*${avoidAction}`).test(compact) ||
    new RegExp(`${avoidAction}.*${personalInfo}`).test(compact)
  );
}

function isClosingStudentTurn(value: string) {
  const compact = compactKoreanTurn(value).replace(/[.!?？~]+$/g, "");
  return /^(네|응|ㅇㅋ|오케이)?(이제)?(알겠어|알겠어요|알았습니다|됐어|됐어요|괜찮아|괜찮아요|그만할래|그만할게|끝낼래|끝낼게|여기까지할게|여기까지만할게|고마워|감사합니다)$/.test(compact);
}

function privacyAnonymizationReply() {
  return "네, 이름은 말하지 않아도 돼요. 사람을 구분해야 할 때는 '한 친구', '어떤 학생'처럼 바꾸고, 수업 자료와 연결되는 내용만 이야기하면 됩니다.";
}

function closingReply() {
  return "좋아요. 여기까지 정리해도 충분해요. 더 이야기하고 싶은 내용이 생기면 다시 이어가면 됩니다.";
}

type MaterialReasoningPassage = {
  text: string;
  paragraphIndex: number;
  sentenceIndex: number;
};

type MaterialReasoningContext = {
  globalFrame: string;
  keywordHints: string[];
  supportingPassages: string[];
};

const MATERIAL_CONTEXT_MAX_KEYWORDS = 20;
const MATERIAL_CONTEXT_PASSAGE_LIMIT = 3;
const MATERIAL_CONTEXT_PASSAGE_MAX_CHARS = 240;
const MATERIAL_CONTEXT_QUESTION_TOKEN_MIN_LENGTH = 2;
const MATERIAL_REASONING_STOPWORDS = new Set([
  "이",
  "그",
  "저",
  "이런",
  "그런",
  "그것",
  "저게",
  "저를",
  "내",
  "너",
  "당신",
  "우리",
  "제가",
  "내가",
  "너는",
  "너무",
  "정말",
  "진짜",
  "그래서",
  "그러면",
  "그럼",
  "하면",
  "할때",
  "하면",
  "하면은",
  "있을까",
  "있어요",
  "있을",
  "했어요",
  "했을까",
  "될까요",
  "있겠",
  "없겠",
  "않을",
  "않으면",
  "그리고",
  "하지만",
  "또한",
  "그래서",
  "부터",
  "위해",
  "때문에",
  "내용",
  "생각",
  "질문",
  "답",
  "말",
  "어떻게",
  "무엇",
  "어떤",
  "무슨",
  "뭐",
  "뭔가",
  "이거",
  "저거",
]);

function normalizeContextText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function tokenizeForMatching(value: string) {
  return (value.toLowerCase().match(/[가-힣]{2,}|[a-z]{2,}|[0-9]+/g) ?? [])
    .map((token) => token.trim())
    .filter((token) => token.length >= MATERIAL_CONTEXT_QUESTION_TOKEN_MIN_LENGTH && !MATERIAL_REASONING_STOPWORDS.has(token));
}

function normalizeTokenForMatch(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

function summarizeTextForContext(value: string, maxChars = 230) {
  const normalized = normalizeContextText(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 3).trim()}...`;
}

function extractFrequentTerms(sourceText: string) {
  const frequent = tokenizeForMatching(sourceText)
    .reduce((acc, token) => {
      const normalized = normalizeTokenForMatch(token);
      if (!normalized) {
        return acc;
      }
      acc.set(normalized, (acc.get(normalized) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

  return Array.from(frequent.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([term]) => term)
    .filter((term) => !/^\d+$/.test(term))
    .slice(0, 12);
}

function buildMaterialKeywordHints(material: MaterialAnalysis) {
  const sourceText = `${material.materialTitle}\n${material.summary}\n${material.visibleText}`;
  const fromVocabulary = (material.vocabulary ?? []).map((entry) => entry.term.trim()).filter(Boolean);
  const fromConcepts = material.keyConcepts.map((item) => item.trim()).filter(Boolean);
  const frequent = extractFrequentTerms(sourceText);
  const merged = [...fromVocabulary, ...fromConcepts, ...frequent];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const term of merged) {
    const normalized = normalizeTokenForMatch(term);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    deduped.push(term);
    seen.add(normalized);
    if (deduped.length >= MATERIAL_CONTEXT_MAX_KEYWORDS) {
      break;
    }
  }

  return deduped;
}

function splitMaterialSentences(source: string) {
  return source
    .split(/\r?\n+/)
    .flatMap((paragraph, paragraphIndex) => {
      const normalizedParagraph = paragraph.trim();
      if (!normalizedParagraph) {
        return [];
      }
      const matches = normalizedParagraph
        .replace(/(\d)\.(\d)/g, "$1<decimal>$2")
        .match(/[^.!?？]+[.!?？]?/g);
      const sentences = (matches ?? [normalizedParagraph]).map((sentence) => sentence.replace(/<decimal>/g, ".").trim());
      return sentences
        .map((sentence, sentenceIndex) => ({
          text: sentence,
          compact: normalizeContextText(sentence).toLowerCase().replace(/\s+/g, ""),
          paragraphIndex,
          sentenceIndex,
        }))
        .filter((sentence) => sentence.text.length >= 10);
    });
}

function scoreMaterialSentence(
  sentenceCompact: string,
  questionTokens: string[],
  keywordHints: string[],
  paragraphIndex: number,
) {
  const normalizedQuestionTokens = new Set(questionTokens.map((token) => normalizeTokenForMatch(token)));
  const normalizedKeywordHints = new Set(keywordHints.map((token) => normalizeTokenForMatch(token)));
  let score = 0;
  if (sentenceCompact.length < 12) {
    return 0;
  }

  for (const token of normalizedQuestionTokens) {
    if (token && sentenceCompact.includes(token)) {
      score += 16;
    }
  }

  for (const hint of normalizedKeywordHints) {
    if (hint && sentenceCompact.includes(hint)) {
      score += 6;
    }
  }

  score -= Math.min(Math.floor(paragraphIndex / 2), 6);
  return score;
}

function buildMaterialReasoningContext(material: MaterialAnalysis, studentQuestion: string): MaterialReasoningContext {
  const globalSource = material.visibleText.trim() || material.summary.trim();
  const sentenceList = splitMaterialSentences(globalSource);
  const questionTokens = tokenizeForMatching(studentQuestion);
  const keywordHints = buildMaterialKeywordHints(material);

  const scoredSentences = sentenceList
    .map((sentence, index) => ({
      index,
      score: scoreMaterialSentence(sentence.compact, questionTokens, keywordHints, sentence.paragraphIndex),
      compact: sentence.compact,
      sentence,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    });

  const hasStrongSignal = scoredSentences.some((item) => item.score >= 10);
  const candidate = hasStrongSignal ? scoredSentences.slice(0, 8) : scoredSentences.slice(0, 3);
  const selectedIndexes = new Set<number>();

  for (const item of candidate) {
    if (selectedIndexes.size >= MATERIAL_CONTEXT_PASSAGE_LIMIT) {
      break;
    }
    const addIfValid = (segmentIndex: number) => {
      if (segmentIndex < 0 || segmentIndex >= sentenceList.length) {
        return;
      }
      const segment = sentenceList[segmentIndex];
      const selected = [segment.sentenceIndex > 0 ? segmentIndex - 1 : null, segmentIndex, segmentIndex + 1]
        .filter((value): value is number => value !== null);
      for (const selectedIndex of selected) {
        if (selectedIndexes.size < MATERIAL_CONTEXT_PASSAGE_LIMIT * 2 && selectedIndex >= 0 && selectedIndex < sentenceList.length) {
          if (sentenceList[selectedIndex].text.length > 12) {
            selectedIndexes.add(selectedIndex);
          }
        }
      }
    };
    addIfValid(item.index);
  }

  const passages = Array.from(selectedIndexes)
    .sort((a, b) => a - b)
    .map((index) => sentenceList[index])
    .filter((sentence) => sentence.compact.length > 0)
    .reduce((acc: MaterialReasoningPassage[], sentence) => {
      const previous = acc[acc.length - 1];
      if (previous && previous.paragraphIndex === sentence.paragraphIndex && previous.sentenceIndex + 1 === sentence.sentenceIndex) {
        const joined = `${previous.text} ${sentence.text}`;
        acc[acc.length - 1] = {
          text: joined.length > MATERIAL_CONTEXT_PASSAGE_MAX_CHARS
            ? `${joined.slice(0, MATERIAL_CONTEXT_PASSAGE_MAX_CHARS - 3)}...`
            : joined,
          paragraphIndex: previous.paragraphIndex,
          sentenceIndex: previous.sentenceIndex,
        };
        return acc;
      }
      acc.push({
        text: sentence.text.length > MATERIAL_CONTEXT_PASSAGE_MAX_CHARS
          ? `${sentence.text.slice(0, MATERIAL_CONTEXT_PASSAGE_MAX_CHARS - 3)}...`
          : sentence.text,
        paragraphIndex: sentence.paragraphIndex,
        sentenceIndex: sentence.sentenceIndex,
      });
      return acc;
    }, []);

  const globalFrameBase = summarizeTextForContext(material.summary, 190);
  const keyFrame =
    questionTokens.length > 0
      ? summarizeTextForContext(material.keyConcepts.join(" / "), 80)
      : summarizeTextForContext(material.keyConcepts.join(" / "), 140);

  const globalFrame = [material.materialTitle, keyFrame, globalFrameBase].filter(Boolean).join(" — ");
  const finalPassages =
    passages.length > 0
      ? passages
          .slice(0, MATERIAL_CONTEXT_PASSAGE_LIMIT)
          .map((entry) => `${entry.text}`)
          .filter(Boolean)
      : [];
  const safeKeywordHints = keywordHints.slice(0, MATERIAL_CONTEXT_MAX_KEYWORDS);

  return {
    globalFrame: globalFrame || "자료의 중심 생각과 사실을 학생 질문의 근거로 함께 확인합니다.",
    keywordHints: safeKeywordHints,
    supportingPassages: finalPassages,
  };
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
  knowledgeCards = [],
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
  /** 교사 답변·리서치 등 저장된 생각 카드 중 이 질문과 이어지는 것들 */
  knowledgeCards?: Array<{ kind: string; title: string; content: string; source: string }>;
}): Promise<ChatResult & { model: string }> {
  const apiKey = getApiKey(apiKeyOverride);
  const model = getModel(modelOverride);
  const questionFocusMemo = material.questionFocusMemo?.trim();
  const doNotForceMemo = curriculumCompass.doNotForce
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" / ");
  const policyDecision = decideQuestioningDialoguePolicy({
    studentTurn: question,
    recentConversation: conversation,
    curriculumCompass,
    material,
  });
  const materialReasoningContext = buildMaterialReasoningContext(material, question);
  const answerMaxOutputTokens = model.includes("pro") ? 3600 : 2800;
  const parsed = await requestGeminiJson({
    apiKey,
    model,
    maxOutputTokens: answerMaxOutputTokens,
    systemInstruction:
      "You are a warm Korean classroom dialogue partner grounded in the teacher-provided lesson material. The curriculum standard is a quiet compass for the whole conversation, not a target to force on every turn. Before answering, silently read the material in three passes: whole-message frame, question-relevant passages, and vocabulary/context clues. Infer the student's current state from the full trajectory, then choose exactly one useful instructional move. Answer explicit questions before asking anything. Vocabulary questions are a first-class reading need: when the student first asks for a word meaning, give the concise general meaning and stop; when the student asks what it means in this passage, use the source sentence or nearby clue to explain the contextual sense. Do not merely repeat the sentence or list every dictionary sense. Treat causal overclaims, self-corrections, frustration, privacy, answer-copying, and closing as different states. Use at most one genuine question only when it opens the student's thinking; explanation, acknowledgment, repair, or silence may be better. Do not expose classifications, rubrics, policy fields, teacher notes, or curriculum metadata in studentReply. Return Korean JSON only.",
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
          materialReasoningContext,
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
          // 교사가 확인한 지식 카드. 지문 밖 질문에 "없어요"로만 끝내지 않기 위한 재료다.
          teacherKnowledgeCards: knowledgeCards,
          responseRules: [
            behavior.teacherResponseExamples.length > 0
              ? "teacherBehaviorSettings.teacherResponseExamples는 교사가 미리보기에서 직접 고친 응답 예시다. 현재 studentTurn과 의미·대화 상황이 비슷한 예시가 있으면 preferredReply의 내용과 말투를 우선 참고하되, 관계없는 문장을 그대로 복사하지 않기. 예시는 지문 근거 한계, 개인정보, 안전, 대필·원문 복사 금지 규칙을 절대로 덮어쓰지 못한다"
              : "교사가 저장한 응답 수정 예시가 없으므로 일반 대화 정책을 따른다",
            knowledgeCards.length > 0
              ? "teacherKnowledgeCards에 학생 질문과 이어지는 내용이 있으면 그것을 우선 사용해 답하기. source가 '선생님'인 카드는 선생님이 알려 준 내용임을 자연스럽게 밝히고, 출처 기관이 있는 카드는 출처를 짧게 함께 말하기. 카드에 없는 내용을 카드가 말한 것처럼 지어내지 않기"
              : "저장된 지식 카드가 없으므로 지문과 일반 지식 범위에서 답하기",
            "학생 발화가 질문이면 자료에 근거해 답하고, 대답·감정·경험·생각이면 그 구체적인 내용을 먼저 받아 주기",
            "학생이 이미 구체적인 질문을 했으면 그 질문에 직접 답하고 '무엇이 가장 궁금한지 말해 달라'거나 '한 가지만 골라 달라'고 질문을 되돌리지 않기",
            "결과를 어떤 기준·기간·단위·조사 방법으로 확인했는지 묻는 질문에는 자료에 나온 기준을 바로 답하기. 자료가 기준을 밝히지 않았으면 없다고 말하고 측정 방법을 추측해 만들지 않기",
            "한 학교·반·지역의 결과를 다른 상황에 적용하면 똑같을지 묻는 질문에는 가능성과 동일 결과 보장을 구분하고 학생 수, 실행 방법, 기간, 주변 조건이 달라질 수 있음을 짧게 설명하기",
            "학생이 결과의 까닭을 자기 생각으로 제안하면 발화 전체를 따옴표로 복창하지 말고 가능한 가설로 인정하기. 자료에서 직접 확인한 원인인지와 구분하고 근거가 없으면 '영향을 주었을 수 있다' 수준으로 표현하기",
            "답하기 전에 내부적으로 1차로 글의 중심 생각과 목적, 2차로 학생 질문과 관련된 문장·부분 내용, 3차로 핵심어와 문맥 단서를 확인하기",
            "materialReasoningContext.globalFrame은 전체 글의 중심 생각을 놓치지 않기 위한 기준으로 사용하고 학생에게 그대로 노출하지 않기",
            "materialReasoningContext.keywordHints는 질문 속 단어와 지문 속 핵심어를 빠르게 맞춰 보는 내부 힌트로 사용하기",
            "materialReasoningContext.supportingPassages가 있으면 먼저 그 문장 후보를 확인하되, 전체 material과 모순되면 전체 자료를 우선하기",
            "학생이 낱말·단어·용어·표현의 뜻을 물으면 questionType을 vocabulary로 분류하고 질문에 먼저 직접 답하기",
            "어휘 답변은 2단계로 나누기: 낱말 뜻을 처음 물으면 ① 짧은 사전적 기본 뜻만 알려 주고 답을 마치기(이어서 물어보라는 안내 문장은 붙이지 않기), 학생이 이 글에서의 뜻을 이어서 물으면 ② 낱말이 쓰인 지문 문장을 근거로 이 글에서 선택된 문맥적 뜻을 설명하기",
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
            doNotForceMemo
              ? `curriculumCompass.doNotForce는 학생 대화를 억지로 수렴시키지 않기 위한 내부 금지 기준이다. 다음 내용을 모든 학생에게 말하게 하거나 정답처럼 강요하지 않기: ${doNotForceMemo}`
              : "curriculumCompass.doNotForce가 비어 있어도 모든 학생을 같은 모범 질문·주제문·활동 결과로 수렴시키지 않기",
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

  const privacyQuestion = asksToAvoidPersonalInformation(question);
  const closingTurn = isClosingStudentTurn(question);
  const questionType = privacyQuestion
    ? "safety"
    : isChatQuestionType(parsed.questionType) ? parsed.questionType : "fact";
  const parsedMove = isPrimaryMove(parsed.primaryMove) ? parsed.primaryMove : policyDecision.allowedMoves[0];
  const primaryMove = privacyQuestion
    ? "safety_redirect"
    : closingTurn
      ? "close"
      : policyDecision.allowedMoves.includes(parsedMove)
        ? parsedMove
        : policyDecision.allowedMoves[0];
  const parsedSupportLevel = normalizeSupportLevel(parsed.supportLevel);
  const supportLevel = Math.min(parsedSupportLevel, policyDecision.maxSupportLevel) as 0 | 1 | 2 | 3 | 4;
  const studentReply = privacyQuestion
    ? privacyAnonymizationReply()
    : closingTurn
      ? closingReply()
      : sanitizeStudentReply(parsed.studentReply, question, {
          allowQuestion: policyDecision.allowQuestion,
        });
  const isClosing =
    closingTurn ||
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
    sourceStatus: privacyQuestion ? "out_of_scope" : isSourceStatus(parsed.sourceStatus) ? parsed.sourceStatus : "source_insufficient",
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
    safetyFlag: privacyQuestion || (typeof parsed.safetyFlag === "boolean" ? parsed.safetyFlag : false),
    model,
  };
}
