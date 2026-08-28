const NOTION_API_BASE = "https://api.notion.com/v1";
const DEFAULT_NOTION_VERSION = "2022-06-28";
const MAX_BLOCK_DEPTH = 8;
const MAX_BLOCKS = 1000;

type JsonRecord = Record<string, unknown>;

export type NotionPageArtifact = {
  pageId: string;
  pageUrl: string;
  title: string;
  content: string;
  blockCount: number;
  truncated: boolean;
};

export class NotionPageImportError extends Error {}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function richTextToPlainText(value: unknown) {
  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      const record = asRecord(item);
      return asString(record?.plain_text);
    })
    .join("");
}

export function extractNotionPageId(input: string) {
  const compact = input.replace(/-/g, "");
  const matches = compact.match(/[0-9a-fA-F]{32}/g);
  const raw = matches?.at(-1);
  if (!raw) return null;

  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`.toLowerCase();
}

async function notionRequest(path: string) {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new NotionPageImportError("NOTION_API_KEY가 설정되어 있지 않습니다.");
  }

  let response: Response;
  try {
    response = await fetch(`${NOTION_API_BASE}/${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": process.env.NOTION_API_VERSION || DEFAULT_NOTION_VERSION,
      },
      cache: "no-store",
    });
  } catch {
    throw new NotionPageImportError("Notion API에 연결하지 못했습니다.");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    if (response.status === 401) {
      throw new NotionPageImportError("Notion 토큰이 올바르지 않습니다.");
    }
    if (response.status === 403 || response.status === 404) {
      throw new NotionPageImportError(
        "페이지를 읽을 수 없습니다. Notion 페이지의 공유 → 연결에서 이 앱의 통합을 추가해 주세요.",
      );
    }
    throw new NotionPageImportError(
      asString(asRecord(payload)?.message) || `Notion API 요청 실패: ${response.status}`,
    );
  }

  const record = asRecord(payload);
  if (!record) throw new NotionPageImportError("Notion API 응답 형식이 올바르지 않습니다.");
  return record;
}

function pageTitle(page: JsonRecord) {
  const properties = asRecord(page.properties) ?? {};
  for (const value of Object.values(properties)) {
    const property = asRecord(value);
    if (property?.type === "title") {
      const title = richTextToPlainText(property.title).trim();
      if (title) return title;
    }
  }
  return "제목 없는 Notion 결과물";
}

function blockToText(block: JsonRecord) {
  const type = asString(block.type);
  const value = asRecord(block[type]);
  if (!value) return "";

  const text = richTextToPlainText(value.rich_text).trim();
  if (text) {
    if (type.startsWith("heading_")) return `\n${text}`;
    if (type === "bulleted_list_item") return `• ${text}`;
    if (type === "numbered_list_item") return `- ${text}`;
    if (type === "to_do") return `${value.checked === true ? "☑" : "☐"} ${text}`;
    if (type === "quote") return `인용: ${text}`;
    if (type === "code") return `코드:\n${text}`;
    return text;
  }

  if (type === "child_page") return `[하위 페이지] ${asString(value.title)}`;
  if (type === "image") return "[이미지 첨부 — 이미지 내용은 별도 확인 필요]";
  if (type === "file" || type === "pdf") return `[${type.toUpperCase()} 첨부 — 파일 내용은 별도 확인 필요]`;
  if (type === "bookmark" || type === "embed") return asString(value.url);
  if (type === "divider") return "---";
  return "";
}

async function readBlockChildren(blockId: string, depth: number, state: { count: number; truncated: boolean }) {
  if (depth > MAX_BLOCK_DEPTH || state.count >= MAX_BLOCKS) {
    state.truncated = true;
    return [] as string[];
  }

  const lines: string[] = [];
  let cursor = "";

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const page = await notionRequest(`blocks/${blockId}/children?${query.toString()}`);
    const results = Array.isArray(page.results) ? page.results : [];

    for (const item of results) {
      if (state.count >= MAX_BLOCKS) {
        state.truncated = true;
        break;
      }
      const block = asRecord(item);
      if (!block) continue;
      state.count += 1;
      const line = blockToText(block);
      if (line) lines.push(line);

      if (block.has_children === true) {
        lines.push(...(await readBlockChildren(asString(block.id), depth + 1, state)));
      }
    }

    cursor = page.has_more === true ? asString(page.next_cursor) : "";
  } while (cursor && state.count < MAX_BLOCKS);

  return lines;
}

export async function importNotionPageArtifact(input: string, maxContentLength: number): Promise<NotionPageArtifact> {
  const pageId = extractNotionPageId(input);
  if (!pageId) throw new NotionPageImportError("Notion 페이지 링크 또는 ID 형식이 올바르지 않습니다.");

  const page = await notionRequest(`pages/${pageId}`);
  const state = { count: 0, truncated: false };
  const lines = await readBlockChildren(pageId, 0, state);
  const fullContent = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!fullContent) {
    throw new NotionPageImportError("페이지에서 평가할 본문을 찾지 못했습니다.");
  }

  return {
    pageId,
    pageUrl: asString(page.url) || input,
    title: pageTitle(page),
    content: fullContent.slice(0, maxContentLength),
    blockCount: state.count,
    truncated: state.truncated || fullContent.length > maxContentLength,
  };
}
