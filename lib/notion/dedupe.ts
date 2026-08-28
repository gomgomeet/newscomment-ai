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

export function classifyNotionRows(
  rows: NotionCommentRow[],
  comments: { id: string; metadata: Json }[],
) {
  const revisionsByPage = new Map<string, Set<string>>();
  const latestCommentByPage = new Map<string, string>();

  for (const comment of comments) {
    if (typeof comment.metadata !== "object" || comment.metadata === null || Array.isArray(comment.metadata)) continue;
    const metadata = comment.metadata as Record<string, Json | undefined>;
    const pageId = typeof metadata.notion_page_id === "string" ? metadata.notion_page_id : "";
    if (!pageId) continue;

    const editedTime = typeof metadata.notion_last_edited_time === "string"
      ? metadata.notion_last_edited_time
      : "legacy";
    const revisions = revisionsByPage.get(pageId) ?? new Set<string>();
    revisions.add(editedTime);
    revisionsByPage.set(pageId, revisions);
    latestCommentByPage.set(pageId, comment.id);
  }

  const fresh: NotionCommentRow[] = [];
  const updated: Array<{ row: NotionCommentRow; previousCommentId: string }> = [];
  const unchanged: NotionCommentRow[] = [];

  for (const row of rows) {
    const existingRevisions = revisionsByPage.get(row.page_id);
    const revisionKey = row.last_edited_time || "legacy";
    if (!existingRevisions) {
      fresh.push(row);
    } else if (existingRevisions.has(revisionKey)) {
      unchanged.push(row);
    } else {
      updated.push({ row, previousCommentId: latestCommentByPage.get(row.page_id) ?? "" });
    }
  }

  return { fresh, updated, unchanged };
}

export function buildNotionCommentMetadata(
  row: NotionCommentRow,
  databaseId: string,
  options?: { revisionOf?: string },
) {
  return {
    source: "notion",
    notion_page_id: row.page_id,
    notion_page_url: row.page_url,
    notion_database_id: databaseId,
    notion_created_time: row.created_time,
    notion_last_edited_time: row.last_edited_time,
    notion_read_at: new Date().toISOString(),
    notion_revision_of: options?.revisionOf || null,
    topic: row.topic,
  };
}
