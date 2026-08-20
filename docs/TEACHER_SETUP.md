# Teacher Setup Guide

This guide is for teachers who want to run their own copy of NewsComment AI.

## Recommended Sharing Model

Use this project as an open template:

- Each teacher creates their own Supabase project.
- Each teacher owns their own database and student data.
- No shared production database is included in this repository.
- No real student data should be committed to GitHub.

This keeps the teaching method and code reusable while keeping student data under each teacher or school's control.

## 1. Prepare Accounts

You need:

- A GitHub account
- A Supabase project
- Optional: an OpenAI API key for AI draft evaluation

Manual scoring works without an OpenAI key.

## 2. Clone and Install

```bash
git clone https://github.com/your-name/newscomment-ai.git
cd newscomment-ai
npm install
```

## 3. Configure Environment Variables

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_EVALUATION_MODEL=gpt-5.6
```

Do not commit `.env.local`.

## 4. Apply Supabase Schema

In Supabase SQL Editor, run:

```text
supabase/migrations/001_initial_schema.sql
```

The migration creates tables, ownership policies, RLS rules, and profile creation triggers.

## 5. Confirm Auth Settings

In Supabase Auth settings:

- Enable email/password sign-in.
- Add your local development URL to allowed redirect URLs:
  - `http://localhost:3000/auth/callback`
- Add your production URL when deployed:
  - `https://your-domain.example/auth/callback`

## 6. Run Locally

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 7. Basic Use Flow

1. Create an account.
2. Create a rubric.
3. Add rubric criteria.
4. Create a project and connect the rubric.
5. Add comments manually or with bulk paste.
6. Save manual evaluations or generate AI drafts.
7. Review Compare and Insights.

## 8. Before Classroom Use

Before using real student data:

- Confirm your school's rules for using cloud services.
- Avoid unnecessary personal information.
- Use student numbers or aliases when possible.
- Test with fake sample data first.
- Confirm who can access the Supabase project.
