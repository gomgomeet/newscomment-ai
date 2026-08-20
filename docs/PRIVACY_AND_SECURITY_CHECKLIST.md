# Privacy and Security Checklist

This checklist is a practical starting point, not legal advice. Confirm school, district, and national requirements before storing real student data.

## Data Minimization

- Store only the data needed for evaluation.
- Prefer aliases, student numbers, or initials over full names.
- Do not paste sensitive personal details into comments.
- Remove data after the evaluation period if it is no longer needed.

## Supabase

- Keep RLS enabled on all student-data tables.
- Do not expose the Supabase `service_role` key to the browser.
- Do not commit `.env.local`.
- Limit Supabase dashboard access to trusted staff.
- Review Auth redirect URLs before production use.
- Use separate Supabase projects for testing and real classroom data.

## OpenAI

- Use AI draft evaluation only when your school policy allows it.
- Avoid sending unnecessary personal identifiers to AI.
- Keep `OPENAI_API_KEY` server-side only.
- Test prompts with fake data before using classroom data.
- Review generated feedback before sharing it with students.

## GitHub

- Do not commit real student comments, names, grades, or screenshots.
- Keep `.env.local` out of Git.
- If making the repository public, verify it contains only source code, sample data, and documentation.
- Use issues and pull requests without student personal data.

## Classroom Operations

- Tell participating teachers where the data is stored.
- Decide who can export, edit, or delete data.
- Keep a simple deletion process for test data and old projects.
- Use fake sample data during demonstrations.

## Deployment

- Use HTTPS for production.
- Set production redirect URLs in Supabase.
- Rotate keys if a secret was exposed.
- Check access after every deployment or ownership change.
