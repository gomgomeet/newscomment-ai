const NOTION_API_BASE = "https://api.notion.com/v1";
const DEFAULT_NOTION_VERSION = "2022-06-28";
const NOTION_PAGE_SIZE = 100;
const MAX_BLOCK_DEPTH = 6;

export type NotionContentMode = "property" | "page_body";

export class NotionImportError extends Error {
  readonly availableProperties: string[];

  constructor(message: string, availableProperties: string[] = []) {
    super(message);
    this.name = "NotionImportError";
    this.availableProperties = availableProperties;
  }
}

export type NotionCommentRow = {
  student_name: string | null;
  content: string;
  page_id: string;
  page_url: string | null;
  topic: string | null;
  created_time: string | null;
  last_edited_time: string | null;
};

export type NotionImportResult = {
  databaseId: string;
  dataSourceId: string | null;
  availableProperties: string[];
  rows: NotionCommentRow[];
  truncated: boolean;
};

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function richTextToPlainText(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((item) => asString(asRecord(item)?.plain_text)).join("");
}

function namesToPlainText(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => asString(asRecord(item)?.name))
    .filter(Boolean)
    .join(", ");
}

export function propertyToPlainText(property: unknown): string {
  const record = asRecord(property);
  if (!record) {
    return "";
  }

  const type = asString(record.type);
  const value = record[type];

  switch (type) {
    case "title":
    case "rich_text":
      return richTextToPlainText(value);
    case "select":
    case "status":
      return asString(asRecord(value)?.name);
    case "multi_select":
    case "people":
    case "files":
      return namesToPlainText(value);
    case "string":
    case "url":
    case "email":
    case "phone_number":
    case "created_time":
    case "last_edited_time":
      return asString(value);
    case "number":
      return typeof value === "number" ? String(value) : "";
    case "checkbox":
    case "boolean":
      return typeof value === "boolean" ? String(value) : "";
    case "date":
      return asString(asRecord(value)?.start);
    case "created_by":
    case "last_edited_by":
      return asString(asRecord(value)?.name);
    case "unique_id": {
      const uniqueId = asRecord(value);
      const prefix = asString(uniqueId?.prefix);
      const number = typeof uniqueId?.number === "number" ? String(uniqueId.number) : "";
      return prefix && number ? `${prefix}-${number}` : number;
    }
    case "formula":
      return propertyToPlainText(value);
    case "rollup": {
      const rollup = asRecord(value);
      if (Array.isArray(rollup?.array)) {
        return rollup.array.map(propertyToPlainText).filter(Boolean).join(", ");
      }

      return propertyToPlainText(value);
    }
    default:
      return "";
  }
}

export function extractNotionDatabaseId(rawInput: string) {
  const input = rawInput.trim();
  if (!input) {
    return null;
  }

  let candidate = input;

  if (/^https?:\/\//i.test(input)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }

    candidate = decodeURIComponent(url.pathname);
  }

  const matches = candidate.replace(/-/g, "").match(/[0-9a-fA-F]{32}/g);
  const id = matches?.at(-1);
  if (!id) {
    return null;
  }

  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)]
    .join("-")
    .toLowerCase();
}

function findPropertyKey(properties: Record<string, unknown>, requestedName: string) {
  const keys = Object.keys(properties);
  const exact = keys.find((key) => key === requestedName);
  if (exact) {
    return exact;
  }

  const normalized = requestedName.trim().toLowerCase();
  return keys.find((key) => key.trim().toLowerCase() === normalized) ?? null;
}

async function notionRequest(path: string, init?: { method?: string; body?: unknown }) {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new NotionImportError("NOTION_API_KEY가 설정되어 있지 않습니다.");
  }

  let response: Response;
  try {
    response = await fetch(`${NOTION_API_BASE}/${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": process.env.NOTION_API_VERSION || DEFAULT_NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new NotionImportError("Notion API에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.");
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    if (response.status === 401) {
      throw new NotionImportError("Notion 토큰이 올바르지 않습니다. NOTION_API_KEY를 확인해 주세요.");
    }

    if (response.status === 404) {
      throw new NotionImportError(
        "Notion 데이터베이스를 찾을 수 없습니다. 데이터베이스 URL과 통합(Integration) 연결 권한을 확인해 주세요.",
      );
    }

    const message = asString(asRecord(payload)?.message);
    throw new NotionImportError(message || `Notion API 요청 실패: ${response.status}`);
  }

  const record = asRecord(payload);
  if (!record) {
    throw new NotionImportError("Notion API 응답 형식이 올바르지 않습니다.");
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

function blockToPlainText(block: Record<string, unknown>) {
  const type = asString(block.type);
  const value = asRecord(block[type]);
  if (!value) {
    return "";
  }

  const richText = richTextToPlainText(value.rich_text).trim();
  if (richText) {
    return richText;
  }

  if (type === "child_page" || type === "child_database") {
    return asString(value.title).trim();
  }

  if (type === "equation") {
    return asString(value.expression).trim();
  }

  if (type === "table_row" && Array.isArray(value.cells)) {
    return value.cells.map(richTextToPlainText).map((cell) => cell.trim()).filter(Boolean).join(" | ");
  }

  if (type === "bookmark" || type === "embed" || type === "link_preview") {
    return asString(value.url).trim();
  }

  if (type === "image" || type === "video" || type === "audio" || type === "file" || type === "pdf") {
    const caption = richTextToPlainText(value.caption).trim();
    return caption ? `[${type}] ${caption}` : "";
  }

  return "";
}

async function readBlockChildrenText(
  blockId: string,
  maxLength: number,
  depth = 0,
): Promise<string> {
  if (!blockId || maxLength <= 0 || depth > MAX_BLOCK_DEPTH) {
    return "";
  }

  const lines: string[] = [];
  let currentLength = 0;
  let startCursor: string | null = null;

  do {
    const query = new URLSearchParams({ page_size: String(NOTION_PAGE_SIZE) });
    if (startCursor) {
      query.set("start_cursor", startCursor);
    }

    const page = await notionRequest(`blocks/${blockId}/children?${query.toString()}`);
    const results = Array.isArray(page.results) ? page.results : [];

    for (const item of results) {
      const block = asRecord(item);
      if (!block) {
        continue;
      }

      const ownText = blockToPlainText(block);
      if (ownText) {
        lines.push(ownText);
        currentLength += ownText.length + 1;
      }

      if (block.has_children === true && currentLength < maxLength) {
        const nestedText = await readBlockChildrenText(
          asString(block.id),
          maxLength - currentLength,
          depth + 1,
        );
        if (nestedText) {
          lines.push(nestedText);
          currentLength += nestedText.length + 1;
        }
      }

      if (currentLength >= maxLength) {
        return lines.join("\n").slice(0, maxLength);
      }
    }

    startCursor = page.has_more === true ? asString(page.next_cursor) || null : null;
  } while (startCursor && currentLength < maxLength);

  return lines.join("\n").slice(0, maxLength).trim();
}

export async function importCommentsFromNotionDatabase({
  databaseInput,
  contentMode,
  contentProperty,
  studentProperty,
  topicProperty,
  maxRows,
  maxContentLength,
}: {
  databaseInput: string;
  contentMode: NotionContentMode;
  contentProperty: string;
  studentProperty: string;
  topicProperty: string;
  maxRows: number;
  maxContentLength: number;
}): Promise<NotionImportResult> {
  const databaseId = extractNotionDatabaseId(databaseInput);
  if (!databaseId) {
    throw new NotionImportError("Notion 데이터베이스 URL 또는 ID 형식이 올바르지 않습니다.");
  }

  const database = await notionRequest(`databases/${databaseId}`);
  const dataSourceId = firstDataSourceId(database);

  const schemaSource = dataSourceId ? await notionRequest(`data_sources/${dataSourceId}`) : database;
  const properties = asRecord(schemaSource.properties) ?? {};
  const availableProperties = Object.keys(properties);

  const contentKey = contentMode === "property" ? findPropertyKey(properties, contentProperty) : null;
  if (contentMode === "property" && !contentKey) {
    throw new NotionImportError(
      `Notion 데이터베이스에 "${contentProperty}" 속성이 없습니다.`,
      availableProperties,
    );
  }

  const studentKey = studentProperty ? findPropertyKey(properties, studentProperty) : null;
  if (studentProperty && !studentKey) {
    throw new NotionImportError(
      `Notion 데이터베이스에 "${studentProperty}" 속성이 없습니다.`,
      availableProperties,
    );
  }

  const topicKey = topicProperty ? findPropertyKey(properties, topicProperty) : null;
  if (topicProperty && !topicKey) {
    throw new NotionImportError(
      `Notion 데이터베이스에 "${topicProperty}" 속성이 없습니다.`,
      availableProperties,
    );
  }

  const queryPath = dataSourceId
    ? `data_sources/${dataSourceId}/query`
    : `databases/${databaseId}/query`;
  const rows: NotionCommentRow[] = [];
  let startCursor: string | null = null;
  let truncated = false;

  do {
    const page = await notionRequest(queryPath, {
      method: "POST",
      body: {
        page_size: NOTION_PAGE_SIZE,
        sorts: [{ timestamp: "created_time", direction: "ascending" }],
        ...(startCursor ? { start_cursor: startCursor } : {}),
      },
    });

    const results = Array.isArray(page.results) ? page.results : [];

    for (const result of results) {
      const notionPage = asRecord(result);
      const pageProperties = asRecord(notionPage?.properties);
      if (!notionPage || !pageProperties) {
        continue;
      }

      const pageId = asString(notionPage.id);
      const content = contentMode === "page_body"
        ? await readBlockChildrenText(pageId, maxContentLength)
        : contentKey
          ? propertyToPlainText(pageProperties[contentKey]).trim()
          : "";
      if (!content) {
        continue;
      }

      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }

      const studentName = studentKey ? propertyToPlainText(pageProperties[studentKey]).trim() : "";
      const topic = topicKey ? propertyToPlainText(pageProperties[topicKey]).trim() : "";

      rows.push({
        student_name: studentName || null,
        content: content.slice(0, maxContentLength),
        page_id: pageId,
        page_url: asString(notionPage.url) || null,
        topic: topic || null,
        created_time: asString(notionPage.created_time) || null,
        last_edited_time: asString(notionPage.last_edited_time) || null,
      });
    }

    const hasMore = page.has_more === true;
    startCursor = hasMore ? asString(page.next_cursor) || null : null;

    if (rows.length >= maxRows && startCursor) {
      truncated = true;
      startCursor = null;
    }
  } while (startCursor);

  return {
    databaseId,
    dataSourceId,
    availableProperties,
    rows,
    truncated,
  };
}
