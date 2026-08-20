# Open Template Guide

NewsComment AI can be shared as an open template for other teachers.

## What to Share

Recommended to share:

- Source code
- Supabase migration SQL
- README and setup docs
- Example rubrics without real student data
- Screenshots made with fake data

Do not share:

- `.env.local`
- Supabase service role keys
- OpenAI API keys
- Real student comments
- Real evaluation records
- Database exports containing student data

## Repository Model

Recommended public repository structure:

```text
newscomment-ai/
├─ app/
├─ components/
├─ docs/
├─ lib/
├─ supabase/
│  └─ migrations/
├─ .env.example
├─ README.md
└─ package.json
```

## Suggested Release Steps

1. Confirm `.env.local` is not tracked.
2. Confirm sample screenshots use fake data.
3. Run verification:

```bash
npm run lint
npm run typecheck
npm run build
```

4. Create a public repository.
5. Push the source code.
6. Add a clear note that every teacher must connect their own Supabase project.

## Suggested Public Description

```text
Open-source template for teachers to evaluate student news comments with rubrics, Supabase-backed storage, and optional AI draft feedback.
```

## License Decision

Choose a license before public release. If you want broad reuse by teachers, a permissive license such as MIT is common, but the final license choice should match your sharing goals and institutional requirements.

Do not publish as open source without a license decision.
