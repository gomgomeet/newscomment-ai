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

## 3. 환경변수

필수 항목:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

선택 항목:

```text
OPENAI_API_KEY
OPENAI_EVALUATION_MODEL
GEMINI_API_KEY
GEMINI_QUESTIONING_MODEL
NOTION_API_KEY
NOTION_API_VERSION
```

질문 챗봇을 Gemini로 사용할 경우 `GEMINI_API_KEY`를 설정한다. 교사별 키 입력 방식으로만 운영한다면 서버 환경변수 없이도 사용할 수 있다.

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
- 공용 PC에서는 수업 후 API 키를 삭제한다.
