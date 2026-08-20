# NewsComment AI Milestone 13

## Completed

- Added Notion database comment import, closing the gap between the homepage promise and the app.
- Added `lib/notion/import-comments.ts` with database ID extraction from a Notion URL or raw ID.
- Added plain-text extraction for title, rich text, select, multi-select, status, people, number, checkbox, url, email, phone, date, created/edited time, unique id, files, formula, and rollup properties.
- Added paginated querying with legacy `databases/{id}/query` and newer `data_sources/{id}/query` support.
- Added the `importCommentsFromNotion` server action with per-project property mapping.
- Added duplicate skipping so re-importing the same Notion database only adds new rows.
- Extracted `lib/notion/dedupe.ts` so the duplicate filter and metadata builder are pure, testable functions shared with the server action.
- Added `NotionCommentImportForm` to the project detail sidebar, including a warning when `NOTION_API_KEY` is missing.
- Added a `notice` query parameter so successful imports render as an informational card instead of an error card.
- Added migration `002_project_notion_source.sql` for `projects.notion_source` and a `notion_page_id` index on comments.
- Added `NOTION_API_KEY` and `NOTION_API_VERSION` to `.env.example` and the Settings environment panel.
- Added `docs/NOTION_IMPORT_GUIDE.md` and updated README and the teacher setup guide.
- Added integration-scoping guidance to the Notion guide after a live check showed a workspace-wide token can reach thousands of unrelated pages.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands pass after the Milestone 13 changes.

### Unit-level smoke test

19 of 19 cases pass for `extractNotionDatabaseId` and `propertyToPlainText`, covering URL and raw-ID
parsing plus every supported property type including nested formula and rollup values.

### Live Notion API test

Run against a real internal integration token and the `💬 학생 댓글 · 생각 나누기` database:

- Token auth, database access, and schema read succeed (23 properties).
- Korean property names (`댓글`, `학생 ID`, `기사 ID`) match correctly.
- 6 of 7 rows import; the row with an empty comment property is skipped as designed.
- A missing integration connection produces the documented "database not found" message, confirming
  the error path.

### Live end-to-end test with Supabase

Two consecutive imports into a real project, using the shipped `importCommentsFromNotionDatabase`,
`collectImportedNotionPageIds`, `filterNewNotionRows`, and `buildNotionCommentMetadata`:

| Run | Read from Notion | Recognized as already imported | Saved |
| --- | --- | --- | --- |
| 1 | 6 | 0 | 6 |
| 2 | 6 | 6 | 0 |

- `comments` holds exactly 6 rows after both runs, with no duplicates.
- Every stored comment carries `notion_page_id`, and `metadata.source` is `notion`.
- `projects.notion_source` persists the database URL and property mapping, so later imports do not
  need the fields retyped.

Temporary scripts were removed after each run; no test framework is installed in this project yet.

## Behavior Notes

- Up to 200 comments are imported per run, ordered by Notion creation time.
- Each comment is truncated to 5000 characters.
- Rows with an empty comment property are skipped.
- Comment metadata stores `notion_page_id`, `notion_page_url`, `notion_database_id`, `notion_created_time`, and `topic`.
- The Notion token stays server-side; the browser only ever sends the database URL and property names.

## Remaining Issues

- Notion import is one-way. Edits made in Notion after an import do not update stored comments.
- The Next.js server action wrapper (form parsing and redirects) is covered only by build and
  typecheck; the browser extension could not reach `localhost`, so the UI path was not clicked through.
- Notion returns `created_time` at minute precision, so rows created in the same minute have no
  guaranteed import order.
- Teachers who already applied migration `001` must also apply `002` before using the import.
- Notion page bodies (child blocks) are not read; only database properties are imported.
- Public release still needs a license decision.
- Delete flows are still not implemented.
