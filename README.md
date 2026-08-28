# NewsComment AI

한 저장소에 **교사용 수업 도구 두 개**가 들어 있다.

| | **평가 대시보드** | **질문 챗봇** |
| --- | --- | --- |
| 무엇을 하나 | 학생이 쓴 뉴스 댓글을 루브릭으로 채점한다 | 학생이 지문에 스스로 질문하게 하고 그 과정을 평가한다 |
| 경로 | `/dashboard/*` | `/questioning-board`(교사) · `/questioning-chatbot`(학생) |
| 로그인 | 필요 — Google 로그인 또는 이메일/비밀번호 | 없음. 교사는 주소로, 학생은 수업 코드로 들어간다 |
| 저장 위치 | Supabase Postgres (RLS) | 교사 개인 Notion + Supabase |
| 쓰는 AI | OpenAI (평가 초안, 선택) | Gemini (대화) |
| 코드량 | 약 3,800줄 | 약 15,800줄 |

두 도구는 **서로 코드를 거의 참조하지 않는다.** 평가 대시보드는 질문 챗봇 코드를 한 줄도 부르지 않고, 반대 방향은 Notion URL에서 데이터베이스 ID를 뽑는 함수 하나뿐이다. 데이터베이스 표도 겹치지 않는다.

---

## 평가 대시보드

### 화면

| 경로 | 하는 일 |
| --- | --- |
| `/dashboard` | 프로젝트·루브릭·평가 개수 |
| `/dashboard/projects` | 프로젝트 만들기, 목록, 상세, 수정 |
| `/dashboard/rubrics` | 루브릭과 기준 만들기·수정, 뉴스 기사 루브릭 자동 생성 |
| `/dashboard/evaluation` | 채점할 프로젝트 고르기 |
| `/dashboard/compare` | 저장된 평가 훑어보기 |
| `/dashboard/insights` | 기준별 평균 |
| `/dashboard/settings` | 연결 상태 확인 |

### 댓글을 가져오는 네 가지 방법

- 한 건씩 직접 입력
- 대량 붙여넣기
- 공개 TXT·CSV·TSV·JSON 주소에서 가져오기
- Notion 데이터베이스에서 가져오기 (프로젝트별 속성 매핑을 기억하고 중복은 건너뛴다)

### 로그인

Google 로그인과 이메일/비밀번호 두 가지를 쓴다. **Google 쪽을 권한다** — Supabase 내장 메일 발송이 프로젝트당 시간당 2건으로 묶여 있어, 여러 교사가 한꺼번에 가입하면 확인 메일을 받지 못한다. 설정 절차는 [Google 로그인 설정 안내](docs/GOOGLE_LOGIN_SETUP.md)에 있다.

Google 제공자를 켜기 전에도 버튼은 보이지만, 누르면 오류 문구와 함께 로그인 화면으로 돌아온다. 이메일/비밀번호 경로는 영향받지 않는다.

### 채점

교사가 기준별로 직접 점수를 매긴다. `OPENAI_API_KEY`가 있으면 **AI 초안**을 만들어 참고할 수 있다. 저장 주체는 언제나 교사다.

AI 초안과 교사 수동 평가는 `evaluations.source`로 분리해 저장한다. `/dashboard/compare`에서 둘을 나란히 보고, 교사가 최종 판단을 남긴다.

---

## 질문 챗봇

### 화면

| 경로 | 하는 일 |
| --- | --- |
| `/questioning-board` | 교사용 제작보드 — 성취기준, 자료, 루브릭, 챗봇 PRD를 준비하고 수업 코드를 만든다 |
| `/questioning-chatbot` | 학생용 — 수업 코드로 들어가 지문에 질문한다 |

### 대화가 두 국면으로 나뉜다

- **1국면** — 학생이 스스로 질문한다. 챗봇은 답하되 되묻지 않는다.
- **2국면** — 지문 관련 질문 네 개를 넘기면 전환된다. 이제 챗봇이 이해 확인 → 성취기준 표적 → 성찰·의견 순으로 되묻는다.

난이도(하·중·상)는 학생 반응에 따라 조절된다.

### 채점을 모델에게 맡기지 않는다

모델에게 "몇 점이야?"라고 묻지 않는다. **관찰 가능한 행동**을 규칙으로 세어 점수를 낸다 (`lib/questioning-target-signals.ts`). 기준 넷, 각 0~5점, 총점 20점이다.

- 질문하기 · 지문 이해 · 성취기준 · 성찰질문과 의견 표현
- 등급 이름은 `관찰 전 / 시작 / 부분 도달 / 도달 / 우수 / 탁월`

결과는 교사 개인 Notion 결과 DB의 `학교_반_번호` 페이지에 누적된다.

### 그 밖에

- 수업 자료를 사고카드로 쪼개 저장하고, 학생 질문과 관련된 카드를 찾아 답에 쓴다
- 학생이 답을 못 받은 질문은 쌓아 두었다가 교사가 답을 카드로 더할 수 있다
- 지문 밖 질문에 웹에서 답을 찾는 기능은 **기본으로 꺼져 있고** 교사가 차시별로 켠다

---

## 기술 구성

- **Next.js 16 App Router** — 이 버전은 관례가 다르다. 아래 「Next.js 16 주의」를 먼저 읽는다.
- TypeScript strict mode
- Tailwind CSS v4
- shadcn/ui 스타일의 로컬 컴포넌트
- `@supabase/ssr` 기반 Supabase Auth
- RLS가 적용된 Supabase Postgres
- OpenAI Responses API (평가 초안, 선택)
- Gemini API (질문 챗봇)

### Next.js 16 주의

| 흔한 관례 | 이 저장소 |
| --- | --- |
| `middleware.ts` | **`proxy.ts`** — 세션 갱신은 여기서 한다 |
| `next build` | **`next build --webpack`** |

코드를 고치기 전에 `node_modules/next/dist/docs/`의 해당 안내를 읽는다. 학습해 둔 관례가 이 버전에서는 맞지 않을 수 있다. `AGENTS.md`에도 같은 경고가 있다.

---

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 값을 채운다. 주석까지 포함한 전체 목록은 `.env.example`에 있다.

### 반드시 필요

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

### 질문 챗봇의 수업 코드 연결에 필요

```text
SUPABASE_SECRET_KEY=                     # 서버 전용. 구형 프로젝트는 SUPABASE_SERVICE_ROLE_KEY
QUESTIONING_SECRET_ENCRYPTION_KEY=       # 교사 Gemini·Notion 토큰을 암호화하는 임의 문자열
QUESTIONING_CONNECTION_SETUP_TOKEN=      # 선택. 새 수업 연결 저장을 보호한다
```

`QUESTIONING_SECRET_ENCRYPTION_KEY`가 없으면 교사가 입력한 키를 저장할 수 없다. 즉 **수업 코드 방식이 동작하지 않는다.**

### 선택

```text
OPENAI_API_KEY=                          # 평가 대시보드의 `AI 초안 생성` 버튼에만 쓰인다
OPENAI_EVALUATION_MODEL=gpt-5.6
GEMINI_API_KEY=                          # 서버 기본 키. 교사별 키만 쓸 거면 없어도 된다
GEMINI_QUESTIONING_MODEL=gemini-2.5-flash
QUESTIONING_STUDENT_LLM_ENABLED=false    # 학생 응답에 외부 제공자를 쓸지
QUESTIONING_STUDENT_PROVIDER=local
NOTION_API_KEY=                          # 평가 대시보드의 Notion 가져오기 카드에 쓰인다
NOTION_API_VERSION=2022-06-28
```

수동 평가는 OpenAI 키 없이 된다. 학생 대화는 기본이 **로컬 제공자**이고, 외부 제공자는 학교나 기관이 약관·개인정보 처리·대상 연령을 확인한 뒤에만 켠다.

---

## Supabase 설정

마이그레이션을 **번호 순서대로** 적용한다. 번호가 곧 의존 관계다.

| 파일 | 무엇을 만드나 | 누가 쓰나 |
| --- | --- | --- |
| `001_initial_schema` | `profiles` `rubrics` `rubric_criteria` `projects` `comments` `evaluations` `evaluation_scores` + RLS 정책 | 평가 대시보드 |
| `002_project_notion_source` | `projects.notion_source` | 평가 대시보드 |
| `003_questioning_lesson_connections` | `questioning_lesson_connections` (수업 코드, 암호화된 교사 키) | 질문 챗봇 |
| `004_questioning_thinking_cards` | `questioning_documents` `questioning_thinking_cards` `questioning_card_relations` `questioning_student_questions` | 질문 챗봇 |
| `005_questioning_cards_pgvector` | pgvector 확장 + `embedding` 열 | **적용하지 않는다** |
| `006_generated_rubric_metadata` | `rubrics.auto_generated` `rubrics.generation_context` | 평가 대시보드 |
| `007_evaluation_sources` | `evaluations.source` + 교사 평가/AI 초안 분리 제약 | 평가 대시보드 |

- 평가 대시보드만 쓸 거면 `001` `002` `006` `007`로 충분하다.
- 질문 챗봇을 쓰려면 `003` `004`가 필요하다. `supabase/manual-apply-003-004.sql` 합본으로 한 번에 돌릴 수 있다.
- `005`는 이 열을 읽거나 쓰는 코드가 아직 없어 적용하지 않는다. 미룬 이유와 나중에 켜는 절차는 [마이그레이션 안내](docs/MIGRATIONS.md)에 정리해 두었다.

RLS는 `001`에서 켜진다. 각 교사가 자기 프로젝트·루브릭·댓글·평가만 본다. 질문 챗봇 표들은 `anon`과 `authenticated`에게서 권한을 회수하고 `service_role`에만 준다 — 학생 브라우저가 데이터베이스에 직접 닿지 않는다.

적용 방법과 확인 쿼리는 [마이그레이션 안내](docs/MIGRATIONS.md)에 있다.

---

## 로컬 개발

```bash
npm install
npm run dev
```

```text
http://localhost:3000                      평가 대시보드
http://localhost:3000/questioning-board    질문 챗봇 교사용
http://localhost:3000/questioning-chatbot  질문 챗봇 학생용
```

## 검증

```bash
npm run lint
npm run typecheck
npm run build
```

질문 챗봇의 대화를 고쳤다면 회귀 평가도 돌린다.

```bash
npm run eval:questioning              # 전체
npm run eval:questioning:development  # 개발용 묶음
npm run eval:questioning:holdout      # 홀드아웃 묶음
```

대화 규칙을 건드리면 겉보기에 멀쩡해도 다른 상황이 깨진다. 평가를 돌려 실패 건수가 늘지 않았는지 확인한다.

---

## 다른 교사와 공유하는 방식

공개 템플릿처럼 복제해서 쓰는 방식을 권한다.

- 코드, SQL 마이그레이션, 문서는 공유할 수 있다.
- 각 교사가 자신의 Supabase 프로젝트를 만든다.
- 각 교사가 자신의 학생 데이터를 관리한다.
- 학교 승인, 개인정보 처리 절차, 운영 지원 책임을 준비하지 않았다면 중앙 데이터베이스를 공유하지 않는다.
- 질문 챗봇의 학생 글은 **교사 개인 Notion**에 남는다. 앱이 모아 두지 않는다.
- 학생 실명 대신 학생 번호나 별칭을 쓴다.

---

## 문서

### 공통

- [마이그레이션 안내](docs/MIGRATIONS.md)
- [교사용 설정 안내](docs/TEACHER_SETUP.md)
- [개인정보 및 보안 체크리스트](docs/PRIVACY_AND_SECURITY_CHECKLIST.md)
- [배포 체크리스트](docs/DEPLOYMENT_CHECKLIST.md)
- [공개 템플릿 안내](docs/OPEN_TEMPLATE_GUIDE.md)

### 평가 대시보드

- [평가 대시보드 설계 계획](docs/EVALUATION_DASHBOARD_PLAN.md)
- [노션×Claude로 완성하는 NIE 과정중심평가 대시보드 설계](docs/PROCESS_ASSESSMENT_TRAINING_PLAN.md)
- [노션×Claude NIE 과정중심평가 대시보드 연수 운영 교안](docs/NOTION_CLAUDE_NIE_EVALUATION_TRAINING_RUNBOOK.md)
- [NIE Notion 복제 템플릿과 Claude 평가보드 연결 안내](docs/NIE_NOTION_TEMPLATE_LINKING_GUIDE.md)
- [연수 후 심화 숙제 — Claude 자동평가 엔진 전환](docs/CLAUDE_EVALUATION_ENGINE_PLAN.md)
- [과정중심평가 Claude 스킬팩](docs/PROCESS_ASSESSMENT_SKILL_PACK.md)
- [Google 로그인 설정 안내](docs/GOOGLE_LOGIN_SETUP.md)
- [Notion 가져오기 안내](docs/NOTION_IMPORT_GUIDE.md)
- [Notion 수집 준비](docs/TRACK_A_NOTION_SETUP.md)

### 질문 챗봇

- [챗봇 PRD](docs/QUESTIONING_CHATBOT_PRD.md)
- [평가 재설계](docs/질문챗봇-평가-재설계.md)
- [구현 순서와 완료 상태](docs/질문챗봇-구현-순서.md)
- [Notion DB 템플릿](docs/QUESTIONING_CHATBOT_NOTION_DB_TEMPLATE.md)
- [API 저장 및 배포 가이드](docs/QUESTIONING_CHATBOT_API_DEPLOYMENT_GUIDE.md)
- [인수인계](docs/QUESTIONING_CHATBOT_HANDOFF.md)

---

## 알려진 제한

### 평가 대시보드

- `/dashboard/compare`는 AI와 교사 평가의 총점·종합 피드백만 나란히 보여준다. 기준별 일치율은 아직 없다.
- 집계가 개수 셋과 기준별 평균뿐이다. 진행률, 점수 분포, 학생 단위 보기가 없다.
- 비밀번호 재설정 흐름이 없다. 잊으면 Supabase 대시보드에서 직접 손봐야 한다.
- 삭제 흐름이 구현되어 있지 않다.
- 기준 최대 점수를 낮춰도 기존 평가 점수가 자동으로 정규화되지 않는다.
- Notion 가져오기는 단방향이다. 가져온 뒤 Notion에서 고친 내용은 반영되지 않는다.
- AI 채점은 실제 교실 예시로 보정이 필요하다.

### 질문 챗봇

- 수업 코드가 `Q-` + 여섯 자리라 짧다. 링크를 아는 사람은 학생 화면에 들어갈 수 있다.
- 교사용 제작보드에 로그인이 없다. API 키는 브라우저 `localStorage`에 남고 기기를 바꾸면 사라진다.
- Notion 결과 DB에 없는 속성은 조용히 건너뛴다.

### 공통

- 라이브 테스트에는 실제 Supabase 자격 정보와 적용된 마이그레이션이 필요하다.
- 공개 배포 전에 라이선스를 정해야 한다.
