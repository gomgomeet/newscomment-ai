# NewsComment AI

NewsComment AI is a teacher-facing web app for managing news comment evaluation projects, rubrics, student comments, manual scoring, and AI-assisted draft evaluation.

## Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui-style local components
- Supabase Auth with `@supabase/ssr`
- Supabase Postgres with RLS
- OpenAI Responses API for optional AI evaluation drafts

## Features Implemented

- Email/password sign up, login, logout
- Protected `/dashboard` routes
- Project create, list, detail, and edit
- Rubric create, list, detail, and edit
- Rubric criterion create and edit
- Manual comment entry
- Bulk pasted comment import
- Comment import from public TXT, CSV, TSV, and JSON URLs
- Manual rubric-based evaluation storage
- Optional AI draft evaluation flow
- Compare page for saved evaluations
- Insights page for criterion-level averages
- `/api/health`

## Sharing With Other Teachers

The recommended sharing model is an open template:

- Share the code, SQL migration, and documentation.
- Each teacher creates their own Supabase project.
- Each teacher owns their own student data.
- Do not share a central database unless you are ready to operate it as a real service with school approval, privacy processes, and support responsibilities.

Useful docs:

- [Teacher setup guide](docs/TEACHER_SETUP.md)
- [Open template guide](docs/OPEN_TEMPLATE_GUIDE.md)
- [Privacy and security checklist](docs/PRIVACY_AND_SECURITY_CHECKLIST.md)
- [Deployment checklist](docs/DEPLOYMENT_CHECKLIST.md)

## Environment

Copy `.env.example` to `.env.local` and fill in real values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_EVALUATION_MODEL=gpt-5.6
```

`OPENAI_API_KEY` is only required for the `AI 초안 생성` button. Manual evaluation works without it.

## Supabase Setup

Apply the initial schema in:

```text
supabase/migrations/001_initial_schema.sql
```

The migration creates:

- `profiles`
- `projects`
- `rubrics`
- `rubric_criteria`
- `comments`
- `evaluations`
- `evaluation_scores`

It also enables RLS and ownership policies so each teacher can only access their own projects, rubrics, comments, and evaluations.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands pass in the current workspace.

## Known Limits

- Live Supabase testing requires real Supabase credentials and applied migrations.
- Live AI testing requires `OPENAI_API_KEY`.
- A public release still needs a license decision.
- Delete flows are not implemented yet.
- Existing evaluation scores are not automatically normalized if a criterion max score is lowered.
- AI scoring needs calibration against real classroom examples.
