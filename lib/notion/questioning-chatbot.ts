import { extractNotionDatabaseId } from "@/lib/notion/import-comments";
import type {
  ChatResult,
  MaterialAnalysis,
  QuestioningChatbotConfig,
  RubricCriterion,
  StandardAssessmentAnalysis,
} from "@/lib/questioning-board";

const NOTION_API_BASE = "https://api.notion.com/v1";
const DEFAULT_NOTION_VERSION = "2022-06-28";
const NOTION_TEXT_LIMIT = 1900;
const NOTION_CHILDREN_BATCH_SIZE = 90;

export class NotionQuestioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionQuestioningError";
  }
}

export type NotionQuestioningSaveResult = {
  ok: boolean;
  skipped?: boolean;
  pageId?: string;
  pageUrl?: string;
  warning?: string;
};

export type NotionQuestioningCredentials = {
  apiKey: string;
  prepDatabaseId?: string;
  resultDatabaseId?: string;
  apiVersion?: string;
};

type NotionRequestContext = {
  credentials?: NotionQuestioningCredentials;
};

type NotionSchema = {
  databaseId: string;
  dataSourceId: string | null;
  properties: Record<string, unknown>;
  titlePropertyKey: string;
};

export type NotionQuestioningDatabaseDiscovery = {
  prepDatabaseId: string;
  resultDatabaseId: string;
  prepDatabaseTitle: string;
  resultDatabaseTitle: string;
};

type StudentProfileForNotion = {
  school: string;
  classroom: string;
  number: string;
};

type ConversationEntry = {
  role: "student" | "assistant";
  content: string;
};

type NotionBlock = Record<string, unknown>;

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function plainText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return typeof value === "string" ? value : String(value);
}

function truncateText(value: string, maxLength = NOTION_TEXT_LIMIT) {
  return value.trim().slice(0, maxLength);
}

function splitText(value: string, maxLength = NOTION_TEXT_LIMIT) {
  const text = value.trim();
  if (!text) {
    return [];
  }

  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxLength) {
    chunks.push(text.slice(index, index + maxLength));
  }
  return chunks;
}

function richText(value: string) {
  const chunks = splitText(value).slice(0, 4);
  return chunks.map((content) => ({
    type: "text",
    text: { content },
  }));
}

function headingBlock(level: 2 | 3, text: string): NotionBlock {
  const type = `heading_${level}`;
  return {
    object: "block",
    type,
    [type]: {
      rich_text: richText(text),
    },
  };
}

function paragraphBlocks(text: string): NotionBlock[] {
  const chunks = splitText(text);
  return chunks.map((content) => ({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: richText(content),
    },
  }));
}

function bulletBlock(text: string): NotionBlock {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: richText(text),
    },
  };
}

function propertySchemaType(schema: unknown) {
  return asString(asRecord(schema)?.type);
}

function findPropertyKey(properties: Record<string, unknown>, candidates: string[]) {
  const keys = Object.keys(properties);

  for (const candidate of candidates) {
    const exact = keys.find((key) => key === candidate);
    if (exact) {
      return exact;
    }
  }

  const normalizedCandidates = candidates.map((candidate) => candidate.trim().toLowerCase());
  return (
    keys.find((key) => normalizedCandidates.includes(key.trim().toLowerCase())) ??
    keys.find((key) =>
      normalizedCandidates.some((candidate) => key.trim().toLowerCase().includes(candidate)),
    ) ??
    null
  );
}

function buildPropertyValue(type: string, value: unknown) {
  const text = plainText(value);

  switch (type) {
    case "title":
      return { title: richText(truncateText(text)) };
    case "rich_text":
      return { rich_text: richText(truncateText(text)) };
    case "select":
      return text.trim() ? { select: { name: truncateText(text, 90) } } : null;
    case "status":
      return text.trim() ? { status: { name: truncateText(text, 90) } } : null;
    case "multi_select":
      return {
        multi_select: text
          .split(/[,|\n]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 10)
          .map((name) => ({ name: truncateText(name, 90) })),
      };
    case "number": {
      const numberValue = typeof value === "number" ? value : Number(text);
      return Number.isFinite(numberValue) ? { number: numberValue } : null;
    }
    case "checkbox":
      return { checkbox: Boolean(value) };
    case "url": {
      if (!/^https?:\/\//i.test(text)) {
        return null;
      }
      return { url: text };
    }
    case "date":
      return text ? { date: { start: text } } : null;
    default:
      return null;
  }
}

function applyProperty(
  properties: Record<string, unknown>,
  schema: Record<string, unknown>,
  candidates: string[],
  value: unknown,
) {
  const key = findPropertyKey(schema, candidates);
  if (!key) {
    return;
  }

  const propertyValue = buildPropertyValue(propertySchemaType(schema[key]), value);
  if (propertyValue) {
    properties[key] = propertyValue;
  }
}

async function notionRequest(
  path: string,
  init?: { method?: string; body?: unknown },
  context?: NotionRequestContext,
) {
  const apiKey = context?.credentials?.apiKey?.trim() || process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new NotionQuestioningError("NOTION_API_KEY가 설정되어 있지 않습니다.");
  }

  let response: Response;
  try {
    response = await fetch(`${NOTION_API_BASE}/${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": context?.credentials?.apiVersion || process.env.NOTION_API_VERSION || DEFAULT_NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new NotionQuestioningError("Notion API에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.");
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    if (response.status === 401) {
      throw new NotionQuestioningError("Notion 토큰이 올바르지 않습니다. NOTION_API_KEY를 확인해 주세요.");
    }

    if (response.status === 404) {
      throw new NotionQuestioningError(
        "Notion 데이터베이스를 찾을 수 없습니다. DB ID와 통합 연결 권한을 확인해 주세요.",
      );
    }

    const message = asString(asRecord(payload)?.message);
    throw new NotionQuestioningError(message || `Notion API 요청 실패: ${response.status}`);
  }

  const record = asRecord(payload);
  if (!record) {
    throw new NotionQuestioningError("Notion API 응답 형식이 올바르지 않습니다.");
  }

  return record;
}

function firstDataSourceId(database: Record<string, unknown>) {
  const dataSources = database.data_sources;
  if (!Array.isArray(dataSources)) {
    return null;
  }

  return asString(asRecord(dataSources[0])?.id) || null;
}

function resolveNotionVersion(context?: NotionRequestContext) {
  return context?.credentials?.apiVersion || process.env.NOTION_API_VERSION || DEFAULT_NOTION_VERSION;
}

function usesDataSourceApi(context?: NotionRequestContext) {
  return resolveNotionVersion(context) >= "2025-09-03";
}

function notionTitleText(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      const text = asRecord(record?.text);
      return asString(record?.plain_text) || asString(text?.content);
    })
    .join("")
    .trim();
}

function normalizeTitle(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function searchResultDatabaseId(result: Record<string, unknown>) {
  const parent = asRecord(result.parent);
  return asString(parent?.database_id) || asString(result.database_id) || asString(result.id);
}

function searchResultTitle(result: Record<string, unknown>) {
  return notionTitleText(result.title) || asString(result.name);
}

async function searchSharedQuestioningDatabases(context: NotionRequestContext) {
  const filterValue = usesDataSourceApi(context) ? "data_source" : "database";
  const queries = ["챗봇 수업", "질문 챗봇", ""];
  const seen = new Set<string>();
  const databases: Array<{ databaseId: string; title: string }> = [];

  for (const query of queries) {
    const body: Record<string, unknown> = {
      filter: { property: "object", value: filterValue },
      page_size: 100,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    };

    if (query) {
      body.query = query;
    }

    const response = await notionRequest("search", { method: "POST", body }, context);
    const results = Array.isArray(response.results) ? response.results : [];

    for (const item of results) {
      const result = asRecord(item);
      if (!result) {
        continue;
      }

      const databaseId = searchResultDatabaseId(result);
      const title = searchResultTitle(result);

      if (!databaseId || !title || seen.has(databaseId)) {
        continue;
      }

      seen.add(databaseId);
      databases.push({ databaseId, title });
    }
  }

  return databases;
}

function pickDatabase(
  databases: Array<{ databaseId: string; title: string }>,
  candidates: string[],
) {
  const normalizedCandidates = candidates.map(normalizeTitle);
  return databases.find((database) => {
    const title = normalizeTitle(database.title);
    return normalizedCandidates.some((candidate) => title === candidate || title.includes(candidate));
  });
}

export async function discoverQuestioningDatabasesFromNotion(
  credentials: Pick<NotionQuestioningCredentials, "apiKey" | "apiVersion">,
): Promise<NotionQuestioningDatabaseDiscovery> {
  if (!credentials.apiKey.trim()) {
    throw new NotionQuestioningError("Notion API 토큰을 입력해 주세요.");
  }

  const context = { credentials };
  const databases = await searchSharedQuestioningDatabases(context);
  const prepDatabase = pickDatabase(databases, [
    "챗봇 수업 준비 DB",
    "질문 챗봇 수업 준비 DB",
    "수업 준비 DB",
  ]);
  const resultDatabase = pickDatabase(databases, [
    "챗봇 수업 결과 DB",
    "질문 챗봇 수업 결과 DB",
    "수업 결과 DB",
  ]);

  if (!prepDatabase || !resultDatabase) {
    throw new NotionQuestioningError(
      "Notion에서 챗봇 수업 준비 DB와 결과 DB를 자동으로 찾지 못했습니다. 템플릿 페이지에 Integration을 연결했고 DB 이름이 그대로인지 확인해 주세요.",
    );
  }

  return {
    prepDatabaseId: prepDatabase.databaseId,
    resultDatabaseId: resultDatabase.databaseId,
    prepDatabaseTitle: prepDatabase.title,
    resultDatabaseTitle: resultDatabase.title,
  };
}

function normalizeDatabaseInput(value: string | undefined) {
  const input = value?.trim();
  if (!input) {
    return null;
  }

  return extractNotionDatabaseId(input) ?? input;
}

async function loadSchema(databaseInput: string, context?: NotionRequestContext): Promise<NotionSchema> {
  const databaseId = normalizeDatabaseInput(databaseInput);
  if (!databaseId) {
    throw new NotionQuestioningError("Notion 데이터베이스 ID 또는 URL 형식이 올바르지 않습니다.");
  }

  const database = await notionRequest(`databases/${databaseId}`, undefined, context);
  const dataSourceId = firstDataSourceId(database);
  const schemaSource = dataSourceId ? await notionRequest(`data_sources/${dataSourceId}`, undefined, context) : database;
  const properties = asRecord(schemaSource.properties) ?? {};
  const titlePropertyKey = Object.keys(properties).find((key) => propertySchemaType(properties[key]) === "title");

  if (!titlePropertyKey) {
    throw new NotionQuestioningError("Notion 데이터베이스에 제목 속성이 없습니다.");
  }

  return {
    databaseId,
    dataSourceId,
    properties,
    titlePropertyKey,
  };
}

async function appendBlocks(pageId: string, blocks: NotionBlock[], context?: NotionRequestContext) {
  for (let index = 0; index < blocks.length; index += NOTION_CHILDREN_BATCH_SIZE) {
    const children = blocks.slice(index, index + NOTION_CHILDREN_BATCH_SIZE);
    await notionRequest(`blocks/${pageId}/children`, {
      method: "PATCH",
      body: { children },
    }, context);
  }
}

async function createPage({
  schema,
  properties,
  children,
  context,
}: {
  schema: NotionSchema;
  properties: Record<string, unknown>;
  children: NotionBlock[];
  context?: NotionRequestContext;
}) {
  const page = await notionRequest("pages", {
    method: "POST",
    body: {
      parent: schema.dataSourceId && usesDataSourceApi(context)
        ? { data_source_id: schema.dataSourceId }
        : { database_id: schema.databaseId },
      properties,
    },
  }, context);

  const pageId = asString(page.id);
  if (!pageId) {
    throw new NotionQuestioningError("Notion 페이지 생성 응답에 page id가 없습니다.");
  }

  if (children.length) {
    await appendBlocks(pageId, children, context);
  }

  return {
    pageId,
    pageUrl: asString(page.url) || undefined,
  };
}

async function findPageByTitle(schema: NotionSchema, title: string, context?: NotionRequestContext) {
  const queryPath = schema.dataSourceId
    ? `data_sources/${schema.dataSourceId}/query`
    : `databases/${schema.databaseId}/query`;
  const result = await notionRequest(queryPath, {
    method: "POST",
    body: {
      page_size: 1,
      filter: {
        property: schema.titlePropertyKey,
        title: { equals: title },
      },
    },
  }, context);
  const firstPage = Array.isArray(result.results) ? asRecord(result.results[0]) : null;

  return firstPage
    ? {
        pageId: asString(firstPage.id),
        pageUrl: asString(firstPage.url) || undefined,
      }
    : null;
}

async function updatePageProperties(
  pageId: string,
  properties: Record<string, unknown>,
  context?: NotionRequestContext,
) {
  await notionRequest(`pages/${pageId}`, {
    method: "PATCH",
    body: { properties },
  }, context);
}

function assessmentAnalysisText(analysis?: StandardAssessmentAnalysis) {
  if (!analysis) {
    return "";
  }

  return [
    `핵심 성취: ${analysis.coreAchievement}`,
    `내용 요소: ${analysis.contentTargets.join(", ")}`,
    `수행 행동: ${analysis.performanceBehaviors.join(", ")}`,
    `학생 산출물: ${analysis.studentProducts.join(", ")}`,
    `루브릭 설계 메모: ${analysis.rubricDesignNotes.join(", ")}`,
  ].join("\n");
}

function rubricText(rubric: RubricCriterion[]) {
  return rubric
    .map((criterion) => {
      const levels = criterion.levels
        .map((level) => `  - ${level.score}점 ${level.label}: ${level.descriptor}`)
        .join("\n");
      return [
        `${criterion.label}`,
        `설명: ${criterion.description}`,
        `관찰 증거: ${criterion.observableEvidence}`,
        `다음 피드백: ${criterion.feedbackForward}`,
        levels,
      ].join("\n");
    })
    .join("\n\n");
}

function materialText(material: MaterialAnalysis) {
  return [
    `자료 이름: ${material.materialTitle}`,
    `질문 자료 전체 내용:\n${material.visibleText || material.summary}`,
    material.questionFocusMemo ? `챗봇 질문 성격 메모: ${material.questionFocusMemo}` : "",
    material.keyConcepts.length ? `핵심 개념: ${material.keyConcepts.join(", ")}` : "",
    material.possibleMisconceptions.length ? `주의할 오개념: ${material.possibleMisconceptions.join(", ")}` : "",
    material.sourceLimit ? `자료 범위: ${material.sourceLimit}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildPreparationProperties({
  schema,
  config,
  studentChatbotUrl,
}: {
  schema: NotionSchema;
  config: QuestioningChatbotConfig;
  studentChatbotUrl: string;
}) {
  const properties: Record<string, unknown> = {};
  const title = `${config.material.materialTitle || config.subjectUnit || "질문 챗봇 수업"} - ${new Date().toLocaleString("ko-KR")}`;

  properties[schema.titlePropertyKey] = buildPropertyValue("title", title);
  applyProperty(properties, schema.properties, ["대상", "학년", "targetGrade"], config.targetGrade);
  applyProperty(properties, schema.properties, ["교과/단원", "교과", "단원", "subjectUnit"], config.subjectUnit);
  applyProperty(properties, schema.properties, ["성취기준", "standard"], config.standard);
  applyProperty(properties, schema.properties, ["질문 자료", "수업 자료", "자료 이름"], config.material.materialTitle);
  applyProperty(properties, schema.properties, ["학생용 주소", "챗봇 주소", "studentChatbotUrl"], studentChatbotUrl);
  applyProperty(
    properties,
    schema.properties,
    ["질문 성격 메모", "챗봇 질문 성격 메모", "질문 초점", "questionFocusMemo"],
    config.material.questionFocusMemo || "",
  );
  applyProperty(properties, schema.properties, ["상태", "status"], "준비 완료");
  applyProperty(properties, schema.properties, ["저장일", "작성일", "date"], new Date().toISOString());
  applyProperty(properties, schema.properties, ["루브릭", "평가 루브릭"], rubricText(config.rubric));
  applyProperty(properties, schema.properties, ["챗봇 PRD", "PRD"], config.prdText);

  return properties;
}

function buildPreparationBlocks(config: QuestioningChatbotConfig, studentChatbotUrl: string) {
  return [
    headingBlock(2, "수업 기본 정보"),
    bulletBlock(`대상: ${config.targetGrade || "미정"}`),
    bulletBlock(`교과/단원: ${config.subjectUnit || "미정"}`),
    bulletBlock(`성취기준: ${config.standard || "미정"}`),
    bulletBlock(`학생용 챗봇 주소: ${studentChatbotUrl}`),
    headingBlock(2, "성취기준 분석"),
    ...paragraphBlocks(assessmentAnalysisText(config.assessmentAnalysis) || "성취기준 분석 없음"),
    headingBlock(2, "질문 자료"),
    ...paragraphBlocks(materialText(config.material)),
    headingBlock(2, "평가 루브릭"),
    ...paragraphBlocks(rubricText(config.rubric)),
    headingBlock(2, "챗봇 제작 PRD"),
    ...paragraphBlocks(config.prdText || "PRD 없음"),
  ];
}

export async function saveQuestioningPreparationToNotion({
  config,
  studentChatbotUrl,
  credentials,
}: {
  config: QuestioningChatbotConfig;
  studentChatbotUrl: string;
  credentials?: NotionQuestioningCredentials;
}): Promise<NotionQuestioningSaveResult> {
  const databaseInput =
    credentials?.prepDatabaseId ??
    process.env.NOTION_QUESTIONING_PREP_DATABASE_ID ??
    process.env.NOTION_QUESTIONING_PREPARATION_DATABASE_ID;

  if (!databaseInput?.trim()) {
    return {
      ok: false,
      skipped: true,
      warning: "NOTION_QUESTIONING_PREP_DATABASE_ID가 설정되어 있지 않습니다.",
    };
  }

  const context = credentials ? { credentials } : undefined;
  const schema = await loadSchema(databaseInput, context);
  const page = await createPage({
    schema,
    properties: buildPreparationProperties({ schema, config, studentChatbotUrl }),
    children: buildPreparationBlocks(config, studentChatbotUrl),
    context,
  });

  return { ok: true, ...page };
}

function studentIdentifier(profile: StudentProfileForNotion) {
  return [profile.school, profile.classroom, profile.number]
    .map((item) => item.trim().replace(/\s+/g, ""))
    .filter(Boolean)
    .join("_");
}

function scoreByCriterionLabel(result: ChatResult, rubric: RubricCriterion[], label: string) {
  const criterion = rubric.find((item) => item.label === label);
  const score = result.rubricScores.find((item) => item.criterionKey === criterion?.key);
  return score?.score ?? "";
}

function scoreSummary(result: ChatResult, rubric: RubricCriterion[]) {
  return result.rubricScores
    .map((score) => {
      const label = rubric.find((criterion) => criterion.key === score.criterionKey)?.label ?? score.criterionKey;
      return `${label}: ${score.score}점 - ${score.rationale}`;
    })
    .join("\n");
}

function totalScore(result: ChatResult) {
  return result.rubricScores.reduce((sum, item) => sum + item.score, 0);
}

function buildResultProperties({
  schema,
  studentId,
  config,
  result,
  questionLog,
  answerLog,
}: {
  schema: NotionSchema;
  studentId: string;
  config: QuestioningChatbotConfig;
  result: ChatResult;
  questionLog: string;
  answerLog: string;
}) {
  const properties: Record<string, unknown> = {};

  properties[schema.titlePropertyKey] = buildPropertyValue("title", studentId);
  applyProperty(properties, schema.properties, ["학교_반_번호", "학생", "학생 식별값"], studentId);
  applyProperty(properties, schema.properties, ["수업 자료", "질문 자료", "자료 이름"], config.material.materialTitle);
  applyProperty(properties, schema.properties, ["성취기준", "standard"], config.standard);
  applyProperty(properties, schema.properties, ["질문 유형", "질문유형"], result.typeLabel);
  applyProperty(
    properties,
    schema.properties,
    ["성취기준·자료 연결"],
    scoreByCriterionLabel(result, config.rubric, "성취기준·자료 연결"),
  );
  applyProperty(
    properties,
    schema.properties,
    ["자료 근거 확인"],
    scoreByCriterionLabel(result, config.rubric, "자료 근거 확인"),
  );
  applyProperty(
    properties,
    schema.properties,
    ["질문 유형 확장"],
    scoreByCriterionLabel(result, config.rubric, "질문 유형 확장"),
  );
  applyProperty(
    properties,
    schema.properties,
    ["질문 다시 쓰기·성찰"],
    scoreByCriterionLabel(result, config.rubric, "질문 다시 쓰기·성찰"),
  );
  applyProperty(properties, schema.properties, ["총점", "total"], totalScore(result));
  applyProperty(properties, schema.properties, ["점수 근거", "평가 근거"], scoreSummary(result, config.rubric));
  applyProperty(properties, schema.properties, ["질문모음", "질문 모음"], questionLog);
  applyProperty(properties, schema.properties, ["챗봇 답변모음", "챗봇 답변 모음"], answerLog);
  applyProperty(properties, schema.properties, ["세특용 피드백", "피드백"], result.teacherFeedback);
  applyProperty(properties, schema.properties, ["업데이트", "저장일", "작성일"], new Date().toISOString());

  return properties;
}

function buildResultBlocks({
  question,
  result,
  questionLog,
  answerLog,
  config,
}: {
  question: string;
  result: ChatResult;
  questionLog: string;
  answerLog: string;
  config: QuestioningChatbotConfig;
}) {
  return [
    headingBlock(2, `질문 활동 기록 - ${new Date().toLocaleString("ko-KR")}`),
    bulletBlock(`수업 자료: ${config.material.materialTitle || "미정"}`),
    bulletBlock(`질문 유형: ${result.typeLabel}`),
    bulletBlock(`총점: ${totalScore(result)}`),
    headingBlock(3, "이번 질문"),
    ...paragraphBlocks(question),
    headingBlock(3, "챗봇 답변"),
    ...paragraphBlocks(result.studentReply),
    headingBlock(3, "대화 정책 기록"),
    bulletBlock(`스키마·프롬프트: v${result.schemaVersion} / ${result.promptVersion}`),
    bulletBlock(`제공자: ${result.provider}`),
    bulletBlock(`중심 동작: ${result.primaryMove}`),
    bulletBlock(`참여 상태: ${result.engagementState}`),
    bulletBlock(`교육과정 관계: ${result.curriculumRelation}`),
    bulletBlock(`지원 수준: ${result.supportLevel}`),
    bulletBlock(`자료 상태: ${result.sourceStatus}`),
    ...(result.sourceCue ? [bulletBlock(`자료 단서: ${result.sourceCue}`)] : []),
    headingBlock(3, "평가 분석"),
    ...paragraphBlocks([result.typeReason, result.evidencePrompt, result.revisionSuggestion, scoreSummary(result, config.rubric)].filter(Boolean).join("\n\n")),
    headingBlock(3, "누적 질문모음"),
    ...paragraphBlocks(questionLog || question),
    headingBlock(3, "누적 챗봇 답변모음"),
    ...paragraphBlocks(answerLog || result.studentReply),
    headingBlock(3, "세특용 피드백"),
    ...paragraphBlocks(result.teacherFeedback || "피드백 없음"),
  ];
}

export async function saveQuestioningResultToNotion({
  config,
  studentProfile,
  question,
  result,
  conversation,
  credentials,
}: {
  config: QuestioningChatbotConfig;
  studentProfile: StudentProfileForNotion;
  question: string;
  result: ChatResult;
  conversation: ConversationEntry[];
  credentials?: NotionQuestioningCredentials;
}): Promise<NotionQuestioningSaveResult> {
  const databaseInput = credentials?.resultDatabaseId ?? process.env.NOTION_QUESTIONING_RESULT_DATABASE_ID;

  if (!databaseInput?.trim()) {
    return {
      ok: false,
      skipped: true,
      warning: "NOTION_QUESTIONING_RESULT_DATABASE_ID가 설정되어 있지 않습니다.",
    };
  }

  const studentId = studentIdentifier(studentProfile);
  if (!studentId) {
    return {
      ok: false,
      skipped: true,
      warning: "학생의 학교_반_번호가 없어 Notion 결과 DB 저장을 건너뛰었습니다.",
    };
  }

  const context = credentials ? { credentials } : undefined;
  const schema = await loadSchema(databaseInput, context);
  const studentQuestions = conversation.filter((item) => item.role === "student").map((item) => item.content);
  const assistantAnswers = conversation.filter((item) => item.role === "assistant").map((item) => item.content);
  const questionLog = [...studentQuestions, question].filter(Boolean).join("\n\n");
  const answerLog = [...assistantAnswers, result.studentReply].filter(Boolean).join("\n\n");
  const properties = buildResultProperties({
    schema,
    studentId,
    config,
    result,
    questionLog,
    answerLog,
  });
  const blocks = buildResultBlocks({
    question,
    result,
    questionLog,
    answerLog,
    config,
  });
  const existingPage = await findPageByTitle(schema, studentId, context);

  if (existingPage?.pageId) {
    await updatePageProperties(existingPage.pageId, properties, context);
    await appendBlocks(existingPage.pageId, blocks, context);
    return { ok: true, pageId: existingPage.pageId, pageUrl: existingPage.pageUrl };
  }

  const page = await createPage({
    schema,
    properties,
    children: blocks,
    context,
  });

  return { ok: true, ...page };
}
