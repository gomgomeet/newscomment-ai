# 배포 체크리스트

앱을 다른 교사에게 열거나 실제 수업에서 사용하기 전에 확인할 항목이다.

## 1. 로컬 검증

아래 명령이 모두 통과해야 한다.

```bash
npm run lint
npm run typecheck
npm run build
```

오류가 있으면 배포 전에 먼저 수정한다.

## 2. Supabase 확인

댓글 평가 웹앱 기능을 함께 사용할 경우 확인한다.

- 마이그레이션이 정상 적용되었다.
- 이메일/비밀번호 로그인이 활성화되어 있다.
- 로컬 리다이렉트 주소가 등록되어 있다.
- 배포용 리다이렉트 주소가 등록되어 있다.
- 학생 데이터가 들어가는 모든 테이블에 RLS가 켜져 있다.
- 테스트 계정은 자기 프로젝트와 루브릭만 볼 수 있다.
- 다른 테스트 계정은 첫 번째 계정의 데이터를 볼 수 없다.

질문 챗봇 운영형에서 Supabase를 연결정보 금고로 사용할 경우 추가로 확인한다.

- 교사별 수업 연결정보 테이블이 준비되어 있다.
- Gemini API 키와 Notion API 토큰은 암호화해서 저장한다.
- 학생 브라우저에는 Gemini 키, Notion 토큰, Supabase service role key가 노출되지 않는다.
- 학생 질문과 챗봇 답변 본문은 Supabase가 아니라 교사 개인 Notion 결과 DB에 저장한다.
- 수업 코드 만료일 또는 삭제 기준이 정해져 있다.

## 3. Vercel 환경변수

Vercel 프로젝트 `newscomment-ai`의 Settings → Environment Variables에 아래 값을 넣는다. 운영 배포에서 필요한 핵심 값은 Supabase 연결정보 금고용 값이다.

전체 앱 기본 항목:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

권장 범위: Production, Preview, Development. 특히 GitHub 브랜치/PR 미리보기 배포를 확인하려면 Preview에도 넣어야 한다.

질문 챗봇 운영형 필수 항목:

```text
SUPABASE_SECRET_KEY
QUESTIONING_SECRET_ENCRYPTION_KEY
```

권장 범위: Production, Preview. 로컬에서 `vercel env pull --environment=development`로 테스트하려면 Development에도 같은 값을 넣는다.

`SUPABASE_SECRET_KEY`가 없는 구형 프로젝트에서는 `SUPABASE_SERVICE_ROLE_KEY`를 대신 사용할 수 있다. 두 값 모두 서버 전용이며 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

질문 챗봇 운영형 선택 항목:

```text
OPENAI_API_KEY
OPENAI_EVALUATION_MODEL
GEMINI_API_KEY
GEMINI_QUESTIONING_MODEL
NOTION_API_KEY
NOTION_API_VERSION
NOTION_QUESTIONING_PREP_DATABASE_ID
NOTION_QUESTIONING_RESULT_DATABASE_ID
SUPABASE_SERVICE_ROLE_KEY
QUESTIONING_CONNECTION_SETUP_TOKEN
```

질문 챗봇을 Gemini로 사용할 경우 교사용 보드에서 교사 개인 Gemini 키를 직접 입력하는 방식을 기본으로 한다. 모든 수업이 같은 서버 기본 키를 써야 하는 특수한 경우에만 `GEMINI_API_KEY`를 설정한다.

현재 권장 운영형에서는 교사 개인 `Notion API 토큰`을 교사용 보드에 입력하고, 웹앱 서버가 Integration이 연결된 Notion 템플릿에서 `챗봇 수업 준비 DB`와 `챗봇 수업 결과 DB`를 자동으로 찾는다. 따라서 교사별 운영에서는 `NOTION_API_KEY`, `NOTION_QUESTIONING_PREP_DATABASE_ID`, `NOTION_QUESTIONING_RESULT_DATABASE_ID`를 Vercel 환경변수에 고정하지 않는다.

여러 교사가 같은 웹앱을 사용하는 운영형에서는 교사별 Gemini 키와 Notion 토큰을 직접 환경변수에 넣지 않고, `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`와 `QUESTIONING_SECRET_ENCRYPTION_KEY`로 서버에서 암호화 저장·조회한다. 저장 버튼을 공개 화면에 둘 경우 `QUESTIONING_CONNECTION_SETUP_TOKEN`으로 연결 저장 암호를 설정한다.

자리표시자 값이나 예시 키를 넣은 상태로 배포하지 않는다.

## 4. 데모 데이터

- 가짜 학생 이름이나 학생 번호를 사용한다.
- 가짜 댓글과 샘플 루브릭을 사용한다.
- 실제 학생 정보가 포함된 캡처 화면을 넣지 않는다.
- 실제 수업 전에 테스트 기록을 삭제한다.

## 5. 운영 권한

- Supabase 프로젝트 소유자가 누구인지 확인한다.
- 배포 설정에 접근할 수 있는 사람이 누구인지 확인한다.
- API 키를 교체할 수 있는 사람이 누구인지 확인한다.
- 데이터 삭제 요청을 누가 처리할지 정한다.

## 6. 질문 챗봇 수업 전 확인

- `/questioning-board`에서 질문 자료가 정상 입력된다.
- `/questioning-chatbot`에서 질문 자료 전체 텍스트가 보인다.
- `채팅 시작`을 누르면 챗봇이 먼저 인사한다.
- Gemini API 키가 없을 때 로컬 예비 응답으로 전환된다.
- Gemini API 키가 있을 때 학생 질문에 응답한다.
- 교사용 보드에서 Notion API 토큰만 입력한 뒤 Supabase 저장 시 준비 DB와 결과 DB가 자동 탐색된다.
- 학생 질문과 챗봇 답변이 교사 개인 Notion 결과 DB의 `학교_반_번호` 페이지에 누적된다.
- 운영형에서는 수업 코드로 교사별 연결정보를 찾고, 교사 개인 Gemini API와 교사 개인 Notion 템플릿 DB로 연결되는지 확인한다.
- 공용 PC에서는 수업 후 API 키를 삭제한다.
