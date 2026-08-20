# Track B — The Web App

Decision record, parked 2026-08-21.

The teacher training package was split into two tracks:

- **Track A — the workshop being run now.** Notion only. Teachers duplicate a template; the
  facilitator demonstrates evaluation on screen. No deployment, no accounts beyond Notion, no API
  keys. 40 participants, 3 hours.
- **Track B — this repository.** Supabase, Vercel, and the coding work behind the tool. Kept for a
  separate, later workshop aimed at teachers who want to build rather than watch.

Track B is paused, not abandoned. The app still has one job in Track A: the facilitator demonstrates
it live, so it must be deployed and working before the workshop even though participants never touch
it.

## Status

Working and verified against live services:

- Email/password auth, projects, rubrics, criteria
- Manual comment entry, bulk paste, import from TXT/CSV/TSV/JSON URLs
- Import from a Notion database with per-project property mapping and duplicate skipping
- Manual rubric scoring, optional AI draft evaluation, compare and insights pages
- Migrations `001` and `002` applied to the live Supabase project

Not deployed. `origin/main` still holds the Create Next App starter; the whole app lives on
`milestone-1`. Production deployment requires a merge, nothing more.

## Open decisions

These block each other in order. The first one decides most of the rest.

### 1. Fork or hosted

| | Fork: each teacher deploys | Hosted: one instance for everyone |
| --- | --- | --- |
| Teacher accounts | GitHub, Supabase, Vercel | none |
| Student data lives | with each teacher | on the facilitator's server |
| Facilitator obligation | none after handover | ongoing operation, cost, support |
| School approval | not an external service | an external service |
| Beginner success rate | medium, and only with the helpers below | high |

Fork keeps the facilitator out of the role of service operator and keeps student writing inside each
teacher's own accounts. That is why it is currently favoured. Hosted wins only on onboarding ease.

If fork is chosen, two things must be built first or beginners will not get through it:

- A Vercel Deploy button that folds fork, project creation, and environment variables into one
  guided screen, with a description next to each variable saying where to copy the value from.
- A self-diagnosis screen in the app that reports what is wrong: migration not applied, Notion token
  invalid, integration scope too wide, expected databases not found. During setup on 2026-08-21 the
  blockers were an environment variable name mismatch, a database not connected to the integration,
  and an over-broad integration. All three were found by writing throwaway scripts, which a teacher
  cannot do. This screen is the difference between the fork route working and not.

### 2. OAuth for the Notion connection

Deferred to Track B, and **only meaningful under the hosted model**. OAuth needs a public
integration registered by whoever runs the service; under fork, each teacher would have to register
their own, which is not realistic.

Under fork, each teacher keeps their own internal integration token, which is the current design.

OAuth's second benefit, letting Notion's own page picker limit what the token can reach, is real but
does not require OAuth. A narrowly connected internal integration achieves the same scope with no
code change.

### 3. System of record

The PRD (§4) has the tool read comments from Notion, evaluate, and **write results back into Notion**
fields that already exist (`AI 점수`, `평가 근거`, `강점`, `AI 확신도`, `분석 상태`, `평가 버전`,
`교사 확인`). Notion is the record; the tool is an evaluation engine.

The app currently does the opposite: Supabase is the record and Notion is a one-way import source.
Only the read half of PRD §15's `자동평가 웹도구와 Notion API 연결` exists.

Following the PRD would also mean the app stores no student writing at all, which removes most of
the privacy burden from a hosted deployment. That interacts with decision 1.

### 4. Score scale

PRD §13 leaves this open: the rubric table recommends 0–4 per area, while the Notion database
describes `AI 점수` and `교사 점수` as 0–5. The app defaults `max_score` to 5. Pick one before
building area-level scoring.

## Gaps against the PRD

| PRD | App today |
| --- | --- |
| §F1 article records: body, source, field, thinking type, key question | no article entity; a project has one `source_url` |
| §4-4 AI receives article body and key question | AI receives project title, rubric title, comment, criteria |
| §F3 fixed three areas (understanding, connection, expression) | arbitrary criteria |
| §F4 output: evidence, strength, next_step, confidence, needs_teacher_review | feedback plus per-criterion score and rationale |
| §F5 AI score and teacher score kept separately, review state, re-evaluation version | one combined evaluation, no review state |

A parallel effort adding standards-based rubric generation was in progress and uncommitted when this
track was parked. It is not in the PRD and points away from §F3's fixed three areas; reconcile before
continuing.

## Suggested order when Track B resumes

1. Answer decision 1. Everything else follows from it.
2. Feed the article body and key question into the AI call. Cheapest large gain in evaluation quality.
3. Fill out the §F4 output fields.
4. Separate AI score from teacher score and add the review state.
5. Only then, the Deploy button and self-diagnosis screen, or OAuth, depending on decision 1.

## Verified on 2026-08-21

Notion import was tested against a real integration token and the live
`💬 학생 댓글 · 생각 나누기` database:

- 6 of 7 rows imported; the row with an empty comment property was skipped as designed.
- A second run added nothing and skipped all 6, confirming duplicate handling.
- Property mapping persisted to `projects.notion_source`.
- Korean property names matched correctly.

See `MILESTONE_13.md` for the full record.
