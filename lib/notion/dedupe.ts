import type { Json } from "@/lib/db/types";
import type { NotionCommentRow } from "@/lib/notion/import-comments";

/**
 * Reads the Notion page IDs already stored on a project's comments, so a repeated
 * import can skip rows it has seen before.
 */
export function collectImportedNotionPageIds(comments: { metadata: Json }[]) {
  const pageIds = new Set<string>();

  for (const comment of comments) {
    const metadata = comment.metadata;
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      continue;
    }

    const pageId = (metadata as Record<string, Json | undefined>).notion_page_id;
    if (typeof pageId === "string" && pageId) {
      pageIds.add(pageId);
    }
  }

  return pageIds;
}

export function filterNewNotionRows(rows: NotionCommentRow[], importedPageIds: Set<string>) {
  return rows.filter((row) => !importedPageIds.has(row.page_id));
}

export function buildNotionCommentMetadata(row: NotionCommentRow, databaseId: string) {
  return {
    source: "notion",
    notion_page_id: row.page_id,
    notion_page_url: row.page_url,
    notion_database_id: databaseId,
    notion_created_time: row.created_time,
    topic: row.topic,
  };
}
