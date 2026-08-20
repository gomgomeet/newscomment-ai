# NewsComment AI Milestone 6

## Completed

- Rubric detail now includes a rubric edit form.
- Teachers can update rubric title and description.
- Rubric updates validate ownership on the server.
- Each rubric criterion now includes an edit form.
- Teachers can update criterion label, description, max score, and sort order.
- Criterion updates validate rubric ownership on the server.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands pass after the Milestone 6 changes.

## Remaining Issues

- Destructive delete flows are not implemented yet.
- Existing evaluation scores are not automatically normalized when a criterion max score is lowered.
- AI evaluation remains unconnected.
- Live Supabase credentials and migrations are required for real backend testing.
