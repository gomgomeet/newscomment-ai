import type { Json } from "@/lib/db/types";

function asRecord(value: Json) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : null;
}

function readHttpsUrl(value: Json | undefined) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function readNotionResultMetadata(metadata: Json) {
  const record = asRecord(metadata);
  const lastEditedAt =
    typeof record?.notion_last_edited_time === "string"
      ? record.notion_last_edited_time
      : null;

  return {
    pageUrl: readHttpsUrl(record?.notion_page_url),
    lastEditedAt,
    isRevision:
      typeof record?.notion_revision_of === "string" && record.notion_revision_of.length > 0,
  };
}
