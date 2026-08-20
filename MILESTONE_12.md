# NewsComment AI Milestone 12

## Completed

- Added comment import from public TXT, CSV, TSV, and JSON URLs.
- Added guardrails to reject general HTML webpages for automatic import.
- Added comment length and import count limits to avoid oversized form submissions.
- Kept manual comment entry and bulk pasted comment import available.
- Verified the app after the automatic import changes.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands pass after the Milestone 12 changes.

## Remaining Issues

- General website comment scraping is intentionally not implemented.
- AI draft evaluation requires an OpenAI API key with available billing credits.
- Production deployment needs environment variables configured in the hosting provider.
- Public release still needs a license decision.
