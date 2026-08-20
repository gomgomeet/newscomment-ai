# NewsComment AI Milestone 3

## Completed

- Project detail now supports manual comment entry.
- Comments are stored in Supabase `comments` with project ownership enforced by RLS and server-side checks.
- Project detail now shows all comments for the selected project.
- Teachers can save rubric-based evaluations for each comment.
- Evaluation totals are calculated on the server and stored in `evaluations`.
- Criterion-level scores and rationales are stored in `evaluation_scores`.
- Existing manual evaluations can be updated through the same form.
- `/dashboard/evaluation` is now a real evaluation hub listing the teacher's projects.
- Dashboard now shows live evaluation count.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands pass after the Milestone 3 changes.

## Remaining Issues

- Bulk comment import from CSV, Notion, or pasted table is not implemented yet.
- AI evaluation is not connected yet; saved evaluations are manual teacher evaluations.
- Rubric/project editing and deletion are still not implemented.
- End-to-end backend testing still requires live Supabase credentials and migration application.
