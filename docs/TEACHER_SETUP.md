# 교사용 설정 안내

이 문서는 교사가 NewsComment AI 또는 질문 챗봇을 자신의 환경에서 실행할 때 필요한 설정 순서를 정리한 자료이다.

## 권장 공유 방식

이 프로젝트는 공개 템플릿처럼 복제해서 사용하는 방식을 권장한다.

- 각 교사가 자신의 Supabase 프로젝트를 만든다.
- 각 교사가 자신의 데이터베이스와 학생 데이터를 관리한다.
- 저장소에는 공용 운영 데이터베이스를 포함하지 않는다.
- 실제 학생 데이터는 GitHub에 올리지 않는다.

이 방식은 수업 방법과 코드는 공유하되, 학생 데이터는 각 교사나 학교의 관리 범위 안에 두기 위한 것이다.

## 1. 준비할 계정

필요한 계정은 다음과 같다.

- GitHub 계정
- Supabase 프로젝트
- 선택: AI 평가 초안용 OpenAI API 키
- 선택: 질문 챗봇용 Gemini API 키
- 선택: Notion 댓글 가져오기용 Notion 내부 연동 토큰

OpenAI 키가 없어도 수동 채점은 가능하다. Notion 토큰이 없어도 댓글을 직접 입력할 수 있다. Gemini 키가 없어도 질문 챗봇은 로컬 예비 응답 모드로 일부 사용할 수 있다.

## 2. 코드 복제와 설치

```bash
git clone https://github.com/your-name/newscomment-ai.git
cd newscomment-ai
npm install
```

## 3. 환경변수 설정

`.env.example`을 참고해 `.env.local`을 만든다.

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

`.env.local`은 절대 Git에 커밋하지 않는다.

질문 챗봇만 교사별 API 키 입력 방식으로 운영한다면 `GEMINI_API_KEY`를 서버에 넣지 않고, 교사용 제작보드에서 각 교사가 직접 입력해도 된다.

## 4. Supabase 스키마 적용

Supabase SQL Editor에서 아래 마이그레이션을 순서대로 실행한다.

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_project_notion_source.sql
```

첫 번째 마이그레이션은 테이블, 소유권 정책, RLS 규칙, 프로필 생성 트리거를 만든다.

두 번째 마이그레이션은 프로젝트별 Notion 가져오기 설정을 기억하는 열을 추가한다.

## 5. Supabase Auth 설정 확인

Supabase Auth 설정에서 확인한다.

- 이메일/비밀번호 로그인을 활성화한다.
- 로컬 개발 주소를 허용 리다이렉트 URL에 추가한다.
  - `http://localhost:3000/auth/callback`
- 배포 후에는 실제 배포 주소도 추가한다.
  - `https://your-domain.example/auth/callback`

## 6. 로컬 실행

```bash
npm run dev
```

브라우저에서 연다.

```text
http://localhost:3000
```

질문 챗봇은 아래 주소에서 확인한다.

```text
http://localhost:3000/questioning-board
http://localhost:3000/questioning-chatbot
```

## 7. 기본 사용 흐름

댓글 평가 웹앱:

1. 계정을 만든다.
2. 루브릭을 만든다.
3. 루브릭 기준을 추가한다.
4. 프로젝트를 만들고 루브릭을 연결한다.
5. 댓글을 직접 입력하거나, 대량 붙여넣기, 파일 URL, Notion 데이터베이스에서 가져온다.
6. 교사가 직접 평가하거나 AI 평가 초안을 생성한다.
7. 비교 화면과 인사이트 화면을 검토한다.

질문 챗봇:

1. `/questioning-board`에서 성취기준과 질문 자료를 준비한다.
2. Gemini API 키를 입력하거나 서버 환경변수를 사용한다.
3. 챗봇 설정을 저장한다.
4. `/questioning-chatbot`에서 학생용 화면을 확인한다.
5. `채팅 시작` 후 자료 관련 질문을 테스트한다.

## 8. 선택: Notion 가져오기

Notion 데이터베이스에서 댓글을 가져오려면 [Notion 가져오기 안내](NOTION_IMPORT_GUIDE.md)를 따른다.

요약하면 다음과 같다.

1. <https://www.notion.so/my-integrations>에서 내부 연동을 만든다.
2. 수업 데이터베이스를 해당 연동과 공유한다.
3. 토큰을 `NOTION_API_KEY`에 넣고 서버를 다시 시작한다.
4. 프로젝트의 Notion 가져오기 카드에 데이터베이스 URL과 속성명을 입력한다.

## 9. 실제 수업 전 확인

실제 학생 데이터를 사용하기 전에 확인한다.

- 학교의 클라우드 서비스 및 생성형 AI 활용 규정을 확인한다.
- 불필요한 개인정보를 넣지 않는다.
- 가능하면 학생 번호나 별칭을 사용한다.
- 먼저 가짜 샘플 데이터로 테스트한다.
- Supabase 프로젝트에 접근할 수 있는 사람을 확인한다.
- 공용 PC에서 Gemini API 키를 사용했다면 수업 후 삭제한다.
