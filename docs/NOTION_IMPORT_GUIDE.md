# Notion Import Guide

NewsComment AI can pull student comments straight from a Notion database, so a class discussion
collected in Notion becomes a rubric-scored project without any copy and paste.

Each row of the Notion database becomes one comment.

## 1. Build the Notion Database

Create a Notion database where one row is one student comment. A simple layout works well:

| Property | Type | Purpose |
| --- | --- | --- |
| `이름` | Title or Text | Student name or alias |
| `댓글` | Text | The comment itself |
| `주제` | Select or Text | Article or topic (optional) |

Property names are up to you. You type the names into the import form, and matching ignores case
and surrounding spaces.

Supported property types for reading text: title, rich text, select, multi-select, status, people,
number, checkbox, url, email, phone, date, created time, last edited time, unique id, files,
formula, and rollup.

## 2. Create a Notion Integration

1. Open <https://www.notion.so/my-integrations>.
2. Select **New integration**.
3. Give it a name such as `NewsComment AI`.
4. Choose the workspace that holds your class pages.
5. Keep the capabilities at **Read content** only. The app never writes to Notion.
6. Copy the **Internal Integration Token**.

## 3. Scope the Integration Narrowly

A Notion integration can only read pages that are explicitly shared with it, but it is easy to
share far more than you meant to. Connecting an integration to a top-level page grants it every
page underneath, which in a personal workspace can mean thousands of pages including finance,
health, or private notes.

Keep the blast radius small:

1. Create one parent page that holds only your class material, for example `NewsComment AI 수업 자료`.
2. Move the article database and the comment database under that page.
3. Connect the integration to that parent page only.

You can check what a token can actually reach by calling the Notion API's `search` endpoint with
it. If the result includes databases unrelated to your class, the integration is too broad, and
you should create a new one with a narrower connection and replace the token.

## 4. Connect the Database to the Integration

Notion integrations only see pages you explicitly share with them.

1. Open the database page in Notion.
2. Select the `...` menu in the top right.
3. Select **Connections** (in some versions, **Add connections**).
4. Choose the integration you created.

Without this step the import fails with a "database not found" error, even when the token is valid.

## 5. Add the Token to the App

Add the token to `.env.local` for local use, or to your hosting provider's environment variables in
production:

```bash
NOTION_API_KEY=ntn_your-internal-integration-token
NOTION_API_VERSION=2022-06-28
```

`NOTION_API_VERSION` is optional. Leave it unset unless you need a newer Notion API version; the app
resolves database data sources automatically when a newer version returns them.

Restart the dev server after changing environment variables.

## 6. Apply Migration 002

The import remembers each project's Notion database and property mapping, which needs a new column.

In the Supabase SQL Editor, run:

```text
supabase/migrations/002_project_notion_source.sql
```

## 7. Import

1. Open a project in the dashboard.
2. Find the **Notion에서 가져오기** card in the right column.
3. Paste the Notion database URL.
4. Type the property name that holds the comment text.
5. Optionally type the student name and topic property names.
6. Select **Notion에서 가져오기**.

The app stores the settings on the project, so later imports only need one click.

## Behavior and Limits

- Rows already imported into this project are skipped, so re-importing only adds new comments.
- Up to 200 comments are imported per run, ordered by Notion creation time.
- Each comment is truncated to 5000 characters.
- Rows with an empty comment property are skipped.
- Edits made in Notion after an import do not update comments already stored in the app.
- The Notion token stays server-side and is never sent to the browser.

## Troubleshooting

| Message | Cause |
| --- | --- |
| `NOTION_API_KEY가 설정되어 있지 않습니다.` | The environment variable is missing or the server was not restarted. |
| `Notion 토큰이 올바르지 않습니다.` | The token is wrong, or it belongs to a different workspace. |
| `Notion 데이터베이스를 찾을 수 없습니다.` | The database was not shared with the integration, or the URL points to a normal page. |
| `... 속성이 없습니다.` | The property name does not match. The message lists the available property names. |
| `가져올 댓글을 찾지 못했습니다.` | The property exists but every row is empty, or the wrong property was selected. |

## Privacy Note

Importing from Notion copies student text into your Supabase database. Apply the same rules as any
other student data: prefer aliases or student numbers, confirm school policy, and test with sample
rows first.
