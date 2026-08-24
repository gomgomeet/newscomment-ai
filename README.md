# NewsComment AI

NewsComment AI는 교사가 뉴스 댓글 평가 프로젝트, 루브릭, 학생 댓글, 수동 채점, AI 평가 초안을 관리할 수 있도록 만든 수업용 웹앱이다.

현재 저장소에는 질문하기 수업을 위한 교사용 제작보드와 학생용 질문 챗봇도 포함되어 있다.

## 기술 구성

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui 스타일의 로컬 컴포넌트
- `@supabase/ssr` 기반 Supabase Auth
- RLS가 적용된 Supabase Postgres
- 선택적 AI 평가 초안용 OpenAI Responses API
- 질문 챗봇용 Gemini API

## 구현된 기능

- 이메일/비밀번호 회원가입, 로그인, 로그아웃
- 보호된 `/dashboard` 경로
- 프로젝트 생성, 목록, 상세, 수정
- 루브릭 생성, 목록, 상세, 수정
- 루브릭 기준 생성과 수정
- 댓글 직접 입력
- 대량 붙여넣기 댓글 가져오기
- 공개 TXT, CSV, TSV, JSON URL에서 댓글 가져오기
- Notion 데이터베이스에서 프로젝트별 속성 매핑으로 댓글 가져오기, 중복 건너뛰기
- 수동 루브릭 평가 저장
- 선택적 AI 평가 초안 생성 흐름
- 저장된 평가 비교 화면
- 기준별 평균을 보는 인사이트 화면
- `/api/health`
- 교사용 질문 챗봇 제작보드 `/questioning-board`
- 학생용 질문 챗봇 `/questioning-chatbot`

## 다른 교사와 공유하는 방식

권장 방식은 공개 템플릿처럼 복제해서 사용하는 것이다.

- 코드, SQL 마이그레이션, 문서는 공유할 수 있다.
- 각 교사가 자신의 Supabase 프로젝트를 만든다.
- 각 교사가 자신의 학생 데이터를 관리한다.
- 학교 승인, 개인정보 처리 절차, 운영 지원 책임을 준비하지 않았다면 중앙 데이터베이스를 공유하지 않는다.
- 질문 챗봇의 Gemini API 키는 교사별로 브라우저에 저장하거나, 배포 서버의 환경변수로 관리한다.

관련 문서:

- [교사용 설정 안내](docs/TEACHER_SETUP.md)
- [Notion 가져오기 안내](docs/NOTION_IMPORT_GUIDE.md)
- [공개 템플릿 안내](docs/OPEN_TEMPLATE_GUIDE.md)
- [개인정보 및 보안 체크리스트](docs/PRIVACY_AND_SECURITY_CHECKLIST.md)
- [배포 체크리스트](docs/DEPLOYMENT_CHECKLIST.md)
- [질문 챗봇 API 저장 및 배포 가이드](docs/QUESTIONING_CHATBOT_API_DEPLOYMENT_GUIDE.md)

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 실제 값을 채운다.

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_EVALUATION_MODEL=gpt-5.6
GEMINI_API_KEY=your-gemini-api-key
GEMINI_QUESTIONING_MODEL=gemini-2.5-flash
NOTION_API_KEY=your-notion-internal-integration-token
NOTION_API_VERSION=2022-06-28
```

`OPENAI_API_KEY`는 `AI 초안 생성` 버튼을 사용할 때만 필요하다. 수동 평가는 OpenAI 키 없이도 가능하다.

`GEMINI_API_KEY`는 질문 챗봇의 이미지 분석과 학생 응답 생성을 서버 기본 키로 사용할 때 필요하다. 교사용 제작보드에 교사별 키를 직접 입력하는 방식으로만 운영한다면 서버 환경변수 없이도 사용할 수 있다.

`NOTION_API_KEY`는 Notion 가져오기 카드에서만 필요하다. 연동 생성과 데이터베이스 공유 방법은 [Notion 가져오기 안내](docs/NOTION_IMPORT_GUIDE.md)를 참고한다.

## Supabase 설정

마이그레이션을 순서대로 적용한다.

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_project_notion_source.sql
supabase/migrations/003_generated_rubric_metadata.sql
```

마이그레이션은 아래 항목을 만든다.

- `profiles`
- `projects`
- `rubrics`
- `rubric_criteria`
- `comments`
- `evaluations`
- `evaluation_scores`

또한 RLS와 소유권 정책을 켜서 각 교사가 자신의 프로젝트, 루브릭, 댓글, 평가만 볼 수 있게 한다.

마이그레이션 `002`는 Notion 데이터베이스와 속성 매핑을 저장하는 `projects.notion_source`를 추가한다.

마이그레이션 `003`은 자동 생성된 뉴스 기사 루브릭을 식별하고 선택한 성취기준과 연결하기 위한 메타데이터를 추가한다.

## 로컬 개발

의존성을 설치한다.

```bash
npm install
```

앱을 실행한다.

```bash
npm run dev
```

브라우저에서 연다.

```text
http://localhost:3000
```

질문 챗봇 화면:

```text
http://localhost:3000/questioning-board
http://localhost:3000/questioning-chatbot
```

## 검증

```bash
npm run lint
npm run typecheck
npm run build
```

세 명령이 모두 통과해야 배포하거나 다른 컴퓨터로 옮기기 좋다.

## 알려진 제한

- 라이브 Supabase 테스트에는 실제 Supabase 자격 정보와 적용된 마이그레이션이 필요하다.
- 라이브 AI 평가 테스트에는 `OPENAI_API_KEY`가 필요하다.
- 라이브 질문 챗봇 테스트에는 교사별 Gemini API 키 또는 `GEMINI_API_KEY`가 필요하다.
- 라이브 Notion 가져오기 테스트에는 `NOTION_API_KEY`와 연동에 공유된 데이터베이스가 필요하다.
- 공개 배포 전에는 라이선스 결정을 해야 한다.
- 삭제 흐름은 아직 구현되어 있지 않다.
- 기준 최대 점수를 낮춰도 기존 평가 점수가 자동 정규화되지는 않는다.
- AI 채점은 실제 교실 예시를 기준으로 보정이 필요하다.
- Notion 가져오기는 단방향이다. 가져온 뒤 Notion에서 수정한 내용은 이미 가져온 댓글에 자동 반영되지 않는다.
