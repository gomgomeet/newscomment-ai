# NewsComment AI Milestone 2

## Completed

- Rubrics page now lists the authenticated teacher's rubrics.
- Teachers can create a rubric with title and description.
- Rubric detail page shows rubric metadata, criteria count, and total score.
- Teachers can add rubric criteria with label, description, max score, and sort order.
- Project creation can link a project to one of the teacher's rubrics.
- Project creation validates rubric ownership on the server before storing `rubric_id`.
- Project detail shows the selected rubric title.
- Dashboard now shows live rubric count.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands pass after the Milestone 2 changes.

## Remaining Issues

- Rubric editing, criterion editing, reordering, and deletion are not implemented yet.
- Project editing and deletion are still not implemented.
- Evaluation workflows remain placeholders until comment import and AI evaluation are added.
- Supabase credentials and live migration application are still required for end-to-end backend testing.
