rhks# Deployment Checklist

Use this checklist before opening the app to other teachers.

## Local Verification

```bash
npm run lint
npm run typecheck
npm run build
```

All commands should pass.

## Supabase

- Migration applied successfully.
- Email/password Auth enabled.
- Local redirect URL configured.
- Production redirect URL configured.
- RLS enabled on all app tables.
- Test account can only see its own projects and rubrics.
- Another test account cannot see the first account's data.

## Environment Variables

Required:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Optional:

```text
OPENAI_API_KEY
OPENAI_EVALUATION_MODEL
```

Do not deploy with placeholder values.

## Demo Data

- Use fake student names.
- Use fake comments.
- Use a sample rubric.
- Remove test records before using real data.

## Production Access

- Confirm who owns the Supabase project.
- Confirm who can access deployment settings.
- Confirm who can rotate API keys.
- Confirm who will handle data deletion requests.
