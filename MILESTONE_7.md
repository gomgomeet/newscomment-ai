# NewsComment AI Milestone 7

## Completed

- Added an OpenAI Responses API utility for rubric-based comment evaluation.
- Added `OPENAI_API_KEY` and `OPENAI_EVALUATION_MODEL` to `.env.example`.
- AI evaluation requests use `store: false`.
- AI evaluation output is requested as structured JSON.
- Added an AI evaluation server action.
- Comment cards now include an `AI 초안 생성` button.
- AI-generated total feedback is stored in `evaluations`.
- AI-generated criterion scores and rationales are stored in `evaluation_scores`.
- Missing `OPENAI_API_KEY` is handled as a user-facing message instead of crashing the app.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands pass after the Milestone 7 changes.

## Remaining Issues

- Live OpenAI API testing requires `OPENAI_API_KEY`.
- Live Supabase testing requires Supabase credentials and applied migrations.
- AI prompt quality and scoring calibration need classroom sample data.
- The AI evaluation currently overwrites the teacher's current saved evaluation for the same comment.
