import "server-only";

/**
 * Teacher AI — 배경·심화·리서치 카드 생성
 *
 * 지문에서 기계적으로 뽑을 수 있는 카드(낱말·사실·추론·예상 질문·대화 설계)는
 * `lib/questioning-cards.ts`가 AI 없이 만든다. 이 파일은 **지문 밖 지식**을 맡는다.
 *
 * 원칙 하나: 출처를 밝히는 카드의 URL은 **실제 검색 결과에서만** 받는다. 모델이
 * 기억으로 적어 낸 URL은 그럴듯하지만 없는 주소일 때가 많고, 그것을 A등급 출처로
 * 교사에게 보여 주는 것은 출처를 아예 안 다는 것보다 나쁘다. 그래서 배경·심화 카드는
 * 출처를 주장하지 않고(sourceType "ai"), 리서치 카드는 검색 근거가 있을 때만 만든다.
 */

import type { MaterialAnalysis } from "@/lib/questioning-board";
import type {
  CardSourceReliability,
  ThinkingCardDraft,
} from "@/lib/questioning-cards";

type GeminiApiPayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: unknown; title?: unknown; domain?: unknown };
      }>;
    };
  }>;
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  error?: { message?: string };
};

/** 검색으로 확인된 출처 한 건. URL은 모델이 아니라 검색 결과에서 온 것만 담는다. */
export type GroundedSource = {
  url: string;
  title: string;
  domain: string;
};

function getModel(modelOverride?: string) {
  return modelOverride?.trim() || process.env.GEMINI_QUESTIONING_MODEL || "gemini-2.5-flash";
}

function getApiKey(apiKeyOverride?: string) {
  const key = apiKeyOverride?.trim() || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API 키가 설정되어 있지 않습니다.");
  return key;
}

// ---------------------------------------------------------------------------
// 출처 등급
// ---------------------------------------------------------------------------

/**
 * A 정부·공공·국제기구·학술 / B 주요 언론·전문기관 / C 일반 웹 / D 미검증.
 *
 * 학생 답변에는 A·B만 기본으로 쓴다. 위키·블로그·카페는 누구나 고칠 수 있어
 * D로 두고, 확인 화면에서도 꺼진 채로 보여 준다.
 */
const RELIABILITY_RULES: Array<{ test: RegExp; grade: CardSourceReliability }> = [
  { test: /(^|\.)(go\.kr|gov|gov\.[a-z]{2}|ac\.kr|edu|re\.kr)$/i, grade: "A" },
  { test: /(^|\.)(who\.int|un\.org|unesco\.org|oecd\.org|doi\.org|kostat\.go\.kr)$/i, grade: "A" },
  { test: /(^|\.)(namu\.wiki|wikipedia\.org|tistory\.com|blog\.naver\.com|cafe\.naver\.com|brunch\.co\.kr|velog\.io)$/i, grade: "D" },
  {
    test: /(^|\.)(yna\.co\.kr|kbs\.co\.kr|mbc\.co\.kr|sbs\.co\.kr|ytn\.co\.kr|chosun\.com|donga\.com|hani\.co\.kr|khan\.co\.kr|joongang\.co\.kr|hankyung\.com|mk\.co\.kr|or\.kr)$/i,
    grade: "B",
  },
];

export function gradeSourceReliability(domainOrUrl: string): CardSourceReliability {
  const raw = domainOrUrl.trim().toLowerCase();
  if (!raw) return "D";

  let host = raw;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    // URL로 못 읽으면 도메인 문자열 그대로 본다.
  }
  host = host.replace(/^www\./, "");

  // 위키·블로그 규칙이 언론사 규칙보다 먼저 걸려야 한다(둘 다 co.kr일 수 있다).
  for (const rule of RELIABILITY_RULES) {
    if (rule.test.test(host)) return rule.grade;
  }
  return "C";
}

// ---------------------------------------------------------------------------
// 검색 근거 읽기
// ---------------------------------------------------------------------------

/**
 * 응답의 groundingMetadata에서 실제 출처만 뽑는다.
 *
 * 모델이 본문에 적은 URL은 무시한다. 여기 담긴 것만 실제로 검색된 문서다.
 */
export function extractGroundedSources(payload: GeminiApiPayload): GroundedSource[] {
  const chunks = payload.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: GroundedSource[] = [];
  const seen = new Set<string>();

  chunks.forEach((chunk) => {
    const uri = typeof chunk.web?.uri === "string" ? chunk.web.uri.trim() : "";
    if (!uri || seen.has(uri)) return;
    seen.add(uri);

    const title = typeof chunk.web?.title === "string" ? chunk.web.title.trim() : "";
    const domain = typeof chunk.web?.domain === "string" ? chunk.web.domain.trim() : title;
    sources.push({ url: uri, title: title || domain, domain: domain || title });
  });

  return sources;
}

// ---------------------------------------------------------------------------
// AI 카드 초안 검증
// ---------------------------------------------------------------------------

/** 모델이 돌려준 카드 한 장의 날것 형태. 무엇 하나 믿지 않고 검사한다. */
type RawAiCard = {
  kind?: unknown;
  title?: unknown;
  summary?: unknown;
  content?: unknown;
  keywords?: unknown;
  relatedQuestions?: unknown;
  sourceIndex?: unknown;
  // 낱말 카드 전용 — 사전적 뜻, 이 글에서의 뜻, 아이 눈높이 예문
  term?: unknown;
  dictionaryMeaning?: unknown;
  contextualMeaning?: unknown;
  example?: unknown;
};

function text(value: unknown, limit = 400): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function stringArray(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, 40))
    .filter((item) => item.length > 0)
    .slice(0, limit);
}

function baseDraft(base: Partial<ThinkingCardDraft> & Pick<ThinkingCardDraft, "localId" | "cardType" | "title">): ThinkingCardDraft {
  return {
    summary: "",
    content: "",
    sourceType: "ai",
    sourceText: "",
    sourceLocation: "",
    reasoningType: null,
    confidence: 0.6,
    knowledgeStatus: "inferred",
    studentLevel: null,
    difficulty: null,
    keywords: [],
    relatedQuestions: [],
    questionIntent: null,
    relatedLocalIds: [],
    externalSourceUrl: null,
    externalSourceTitle: null,
    externalSourceOrganization: null,
    externalSourceDate: null,
    sourceReliability: null,
    dialogueTrigger: null,
    dialoguePrompt: null,
    dialogueGoal: null,
    isEnabled: true,
    ...base,
  };
}

/**
 * 모델 응답을 카드로 옮긴다. 검증이 이 파일의 핵심이다.
 *
 * - 제목이나 내용이 비면 버린다
 * - `research`를 자처해도 검색 근거가 없으면 **버린다** — 출처 없는 리서치 카드는
 *   배경 카드로 슬쩍 바꿔 두지 않는다. 교사가 "리서치했다"고 읽게 되기 때문이다
 * - C·D 등급 출처는 카드로 만들되 꺼 둔다. 교사가 확인 화면에서 켤 수 있다
 */
export function buildAiCards(rawCards: unknown, sources: GroundedSource[]): ThinkingCardDraft[] {
  if (!Array.isArray(rawCards)) return [];

  const cards: ThinkingCardDraft[] = [];
  let backgroundIndex = 0;
  let researchIndex = 0;
  let extensionIndex = 0;

  let vocabularyIndex = 0;

  rawCards.forEach((entry) => {
    if (typeof entry !== "object" || entry === null) return;
    const raw = entry as RawAiCard;

    const kind = text(raw.kind, 20);

    // 낱말 카드는 제목·내용 대신 낱말·뜻으로 판정한다.
    if (kind === "vocabulary") {
      const term = text(raw.term ?? raw.title, 30);
      const dictionaryMeaning = text(raw.dictionaryMeaning, 400);
      const contextualMeaning = text(raw.contextualMeaning, 300);
      // 사전 뜻이 없는 낱말 카드는 뜻풀이가 아니다. 버린다.
      if (!term || !dictionaryMeaning) return;

      const example = text(raw.example, 200);
      const contentParts = [
        contextualMeaning ? `이 글에서는 ${contextualMeaning}` : "",
        example ? `예문: ${example}` : "",
      ].filter(Boolean);

      cards.push(
        baseDraft({
          localId: `ai-vocabulary-${vocabularyIndex}`,
          cardType: "vocabulary",
          title: term,
          summary: dictionaryMeaning,
          content: contentParts.join("\n"),
          sourceType: "ai",
          // 사전 뜻은 확정된 지식이라 위험이 낮다. 다만 AI가 푼 것이므로 1.0은 아니다.
          confidence: 0.7,
          knowledgeStatus: "inferred",
          keywords: [term, ...stringArray(raw.keywords, 4)],
          relatedQuestions: [`${term}이 무슨 뜻이에요?`],
        }),
      );
      vocabularyIndex += 1;
      return;
    }

    const title = text(raw.title, 80);
    const content = text(raw.content, 600);
    if (!title || !content) return;
    const summary = text(raw.summary, 200);
    const keywords = stringArray(raw.keywords);
    const relatedQuestions = stringArray(raw.relatedQuestions, 4);

    if (kind === "research") {
      const index = typeof raw.sourceIndex === "number" ? raw.sourceIndex : -1;
      const source = sources[index];
      // 검색 근거가 없으면 리서치 카드가 아니다. 만들지 않는다.
      if (!source) return;

      const grade = gradeSourceReliability(source.domain || source.url);
      cards.push(
        baseDraft({
          localId: `research-${researchIndex}`,
          cardType: "research",
          title,
          summary,
          content,
          sourceType: "external",
          sourceText: source.title,
          sourceLocation: source.domain,
          confidence: grade === "A" ? 0.9 : grade === "B" ? 0.8 : 0.6,
          knowledgeStatus: "researched",
          keywords,
          relatedQuestions,
          externalSourceUrl: source.url,
          externalSourceTitle: source.title,
          externalSourceOrganization: source.domain,
          sourceReliability: grade,
          // A·B만 기본으로 켠다. C·D는 교사가 보고 켜도록 꺼 둔다.
          isEnabled: grade === "A" || grade === "B",
        }),
      );
      researchIndex += 1;
      return;
    }

    if (kind === "extension") {
      cards.push(
        baseDraft({
          localId: `extension-${extensionIndex}`,
          cardType: "extension",
          title,
          summary,
          content,
          keywords,
          relatedQuestions,
          confidence: 0.6,
        }),
      );
      extensionIndex += 1;
      return;
    }

    // 나머지는 배경 지식으로 본다. 출처를 주장하지 않는다.
    cards.push(
      baseDraft({
        localId: `background-${backgroundIndex}`,
        cardType: "background",
        title,
        summary,
        content,
        keywords,
        relatedQuestions,
        confidence: 0.6,
      }),
    );
    backgroundIndex += 1;
  });

  return cards;
}

// ---------------------------------------------------------------------------
// 호출
// ---------------------------------------------------------------------------

const CARD_INSTRUCTION = [
  "You prepare background knowledge for a Korean elementary questioning chatbot.",
  "Research vocabulary thoroughly: for every term a student might stumble on, give the precise dictionary sense,",
  "the sense selected by this exact passage, and one example sentence a child would understand.",
  "Search the web when the passage needs outside knowledge, and ground every research card in a real search result.",
  "Write all card text in Korean at the given grade level.",
  "Never state a fact the passage does not support unless a search result backs it.",
  "Return only a JSON array named cards, with no prose around it.",
].join(" ");

function buildCardTask(material: MaterialAnalysis, standard: string, targetGrade: string) {
  return JSON.stringify({
    task: [
      "아래 지문으로 수업할 때 필요한 지식을 카드로 만드세요.",
      "kind는 vocabulary(낱말 뜻), background(지문 이해에 필요한 배경 지식), research(웹에서 확인한 사실), extension(더 나아가는 질문거리) 중 하나입니다.",
      "① 낱말부터 꼼꼼하게: 학생이 막힐 만한 낱말을 지문에서 모두 찾아 vocabulary 카드로 만드세요.",
      "dictionaryMeaning에는 정확하고 상세한 사전적 뜻을(뜻이 여러 갈래면 이 글과 맞는 갈래를 분명히), contextualMeaning에는 이 지문에서 실제로 쓰인 뜻을, example에는 아이 눈높이 예문 한 문장을 쓰세요.",
      "'석 달'처럼 띄어 쓴 말, 세는 말, 관용 표현도 낱말로 다루세요.",
      "② 지문 전체의 맥락: 이 글이 어떤 상황·배경에서 나온 이야기인지 background 카드 한 장으로 정리하세요.",
      "③ 관련 내용 리서치: 지문 주제와 이어지는 사실을 웹에서 검색해 research 카드로 만드세요.",
      "research 카드는 실제로 검색한 결과에 근거할 때만 만들고, 그 결과가 몇 번째였는지 sourceIndex(0부터)에 적으세요.",
      "검색하지 않았거나 근거를 댈 수 없으면 research 카드를 만들지 마세요. 지어낸 출처는 없느니만 못합니다.",
      "배경 카드는 출처를 적지 말고, 학년 수준에서 이해할 수 있는 말로 쓰세요.",
      "낱말 카드는 8장까지, 나머지는 모두 합쳐 8장을 넘지 마세요.",
    ].join(" "),
    targetGrade,
    standard,
    materialTitle: material.materialTitle,
    passage: material.visibleText.slice(0, 4000),
    keyConcepts: material.keyConcepts,
    teacherMemo: material.questionFocusMemo ?? "",
    responseShape: {
      cards: [
        {
          kind: "vocabulary | background | research | extension",
          title: "카드 제목 (vocabulary는 낱말 그대로)",
          term: "vocabulary일 때 — 낱말",
          dictionaryMeaning: "vocabulary일 때 — 상세한 사전적 뜻",
          contextualMeaning: "vocabulary일 때 — 이 글에서 쓰인 뜻",
          example: "vocabulary일 때 — 아이 눈높이 예문 한 문장",
          summary: "한 줄 요약",
          content: "학생에게 설명할 내용",
          keywords: ["핵심어"],
          relatedQuestions: ["이 카드가 답해 주는 질문"],
          sourceIndex: "research일 때만, 검색 결과 번호(0부터)",
        },
      ],
    },
  });
}

/** 응답 본문에서 JSON 배열을 건져 낸다. 검색을 켜면 구조화 출력을 쓸 수 없어서 필요하다. */
export function parseCardsFromText(outputText: string): unknown {
  const direct = outputText.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(direct);
  const candidate = fenced ? fenced[1] : direct;

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)) {
      return (parsed as { cards: unknown[] }).cards;
    }
  } catch {
    // 아래에서 배열만 다시 찾아본다.
  }

  const arrayMatch = /\[[\s\S]*\]/.exec(candidate);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 배경·리서치·심화 카드를 만든다.
 *
 * 검색을 켜기 위해 구조화 출력(responseJsonSchema) 대신 텍스트 응답을 받아 파싱한다.
 * 두 기능은 함께 쓸 수 없다. 파싱에 실패하면 빈 배열을 돌려주고, 호출한 쪽은
 * 지역 카드만으로 계속 진행한다 — AI가 실패해도 수업 준비가 멈추지는 않아야 한다.
 */
export async function generateKnowledgeCardsWithGemini({
  material,
  standard,
  targetGrade,
  apiKey: apiKeyOverride,
  model: modelOverride,
}: {
  material: MaterialAnalysis;
  standard: string;
  targetGrade: string;
  apiKey?: string;
  model?: string;
}): Promise<{ cards: ThinkingCardDraft[]; sources: GroundedSource[]; model: string }> {
  const apiKey = getApiKey(apiKeyOverride);
  const model = getModel(modelOverride);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: CARD_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: buildCardTask(material, standard, targetGrade) }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 6000, temperature: 0.3 },
      store: false,
    }),
  });

  const rawText = await response.text();
  let payload: GeminiApiPayload;
  try {
    payload = JSON.parse(rawText) as GeminiApiPayload;
  } catch {
    throw new Error("Gemini API가 읽을 수 없는 응답을 반환했습니다.");
  }
  if (!response.ok) {
    throw new Error(payload.error?.message || "Gemini API 요청에 실패했습니다.");
  }

  const outputText = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");

  const sources = extractGroundedSources(payload);
  return { cards: buildAiCards(parseCardsFromText(outputText), sources), sources, model };
}

// ---------------------------------------------------------------------------
// 수업 중 실시간 리서치
// ---------------------------------------------------------------------------

export type LiveResearchAnswer = {
  answer: string;
  sourceOrganization: string;
  sourceUrl: string;
  reliability: CardSourceReliability;
};

/**
 * 자료에 없지만 주제와 이어지는 학생 질문을 웹에서 찾아 답한다.
 *
 * 원칙은 리서치 카드와 같다 — **검색 근거가 있을 때만** 답하고, 출처 등급 A·B가
 * 아니면 답하지 않는다(null). 아이에게 나가는 답이므로 카드보다 기준이 더 엄격해야
 * 하면 했지 느슨해선 안 된다. null이면 부른 쪽이 기존의 정직한 "자료에 없어요"
 * 응답을 그대로 쓴다.
 */
export async function researchAnswerForStudent({
  questionText,
  materialTitle,
  materialSummary,
  targetGrade,
  apiKey: apiKeyOverride,
  model: modelOverride,
}: {
  questionText: string;
  materialTitle: string;
  materialSummary: string;
  targetGrade: string;
  apiKey?: string;
  model?: string;
}): Promise<LiveResearchAnswer | null> {
  const apiKey = getApiKey(apiKeyOverride);
  const model = getModel(modelOverride);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: [
              "You answer a Korean elementary student's question by searching the web.",
              "Search first, then answer in 2-3 short Korean sentences at the given grade level.",
              "State only what the search results support. No question marks — the answer must not ask anything back.",
              "If the search does not clearly support an answer, reply with the single word 모름.",
            ].join(" "),
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                question: questionText,
                lessonTopic: materialTitle,
                lessonSummary: materialSummary.slice(0, 300),
                targetGrade,
              }),
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 800, temperature: 0.2 },
      store: false,
    }),
  });

  const rawText = await response.text();
  let payload: GeminiApiPayload;
  try {
    payload = JSON.parse(rawText) as GeminiApiPayload;
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const answer = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
  if (!answer || answer === "모름" || answer.length < 10) return null;

  // 검색 근거가 없으면 모델이 기억으로 지어낸 것일 수 있다. 답하지 않는다.
  const sources = extractGroundedSources(payload);
  const graded = sources
    .map((source) => ({ ...source, grade: gradeSourceReliability(source.domain || source.url) }))
    .filter((source) => source.grade === "A" || source.grade === "B");
  if (graded.length === 0) return null;

  const best = graded[0];
  return {
    // 아이 화면에 물음표가 섞여 나가지 않게 한 번 더 걸러 둔다.
    answer: answer.replace(/[?？]/g, ".").slice(0, 400),
    sourceOrganization: best.domain || best.title,
    sourceUrl: best.url,
    reliability: best.grade,
  };
}

// ---------------------------------------------------------------------------
// 학생별 질문 분석 평가 문장
// ---------------------------------------------------------------------------

/**
 * 학생별 질문 기록을 근거로 평가(세특형) 문장을 쓴다.
 *
 * 원칙: 실제로 한 질문만 근거로 쓰고, 하지 않은 것을 지어내지 않는다.
 * 이름은 모른다 — student_key만 다룬다. 문장은 교사가 고칠 초안이다.
 */
export async function generateQuestionAnalysisWithGemini({
  students,
  standard,
  targetGrade,
  apiKey: apiKeyOverride,
  model: modelOverride,
}: {
  students: Array<{ studentKey: string; sampleQuestions: string[]; intents: string[]; questionCount: number }>;
  standard: string;
  targetGrade: string;
  apiKey?: string;
  model?: string;
}): Promise<Map<string, string>> {
  const apiKey = getApiKey(apiKeyOverride);
  const model = getModel(modelOverride);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: [
              "You write Korean assessment notes for a teacher based only on the questions each student actually asked.",
              "Two sentences per student at most, observation-based, no praise inflation, no invented behavior.",
              'Return a JSON array only: [{"studentKey": "...", "comment": "..."}].',
            ].join(" "),
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                task: "각 학생이 실제로 한 질문을 근거로, 성취기준과 연결한 평가 기록 초안을 학생마다 1~2문장으로 쓰세요. 질문을 그대로 인용하거나 요약해 근거를 남기고, 하지 않은 행동을 지어내지 마세요.",
                standard,
                targetGrade,
                students,
              }),
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.3, responseMimeType: "application/json" },
      store: false,
    }),
  });

  const rawText = await response.text();
  let payload: GeminiApiPayload;
  try {
    payload = JSON.parse(rawText) as GeminiApiPayload;
  } catch {
    return new Map();
  }
  if (!response.ok) return new Map();

  const outputText = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
  const parsed = parseCardsFromText(outputText);
  const comments = new Map<string, string>();
  if (Array.isArray(parsed)) {
    parsed.forEach((entry) => {
      if (typeof entry !== "object" || entry === null) return;
      const row = entry as { studentKey?: unknown; comment?: unknown };
      const key = typeof row.studentKey === "string" ? row.studentKey.trim() : "";
      const comment = typeof row.comment === "string" ? row.comment.trim().slice(0, 300) : "";
      if (key && comment) comments.set(key, comment);
    });
  }
  return comments;
}
