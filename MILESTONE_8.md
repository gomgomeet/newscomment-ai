# NewsComment AI Milestone 8

## Completed

- `/dashboard/compare` now shows saved evaluation results.
- Compare view groups evaluation data with project and comment context.
- Teachers can open the source project from each comparison card.
- `/dashboard/insights` now summarizes saved evaluation scores.
- Insights view shows project, evaluation, and score counts.
- Insights view calculates criterion-level average scores.
- Criterion averages are sorted from lowest percentage to highest to surface weak areas first.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands pass after the Milestone 8 changes.

## Remaining Issues

- Insights are still basic aggregates; no filters, date ranges, or export.
- Compare does not yet show criterion-by-criterion details per comment.
- Live Supabase credentials and migrations are required for real backend testing.
