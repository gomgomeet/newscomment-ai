# 경량 교사·학생 앱 배포 실행 기록

## 현재 판정 — 2026-09-10 운영 로그·환경변수 확인 반영

**코드와 미리보기 빌드는 준비됐지만, 실제 교사·학생 운영 연결은 아직 미완료다.** 빌드 성공, 웹 접속 성공, 실제 수업 검증은 서로 다른 완료 조건이다.

| 대상 | 확인 결과 | 다음 조치 |
| --- | --- | --- |
| [PR #65](https://github.com/gomgomeet/newscomment-ai/pull/65) | 점검 시 HEAD `92d5653`, OPEN, Vercel 빌드 SUCCESS | 접근 가능한 미리보기에서 연결 계약 확인 후 기존 Production에 반영 |
| 기존 Production `/api/health` | HTTP 500. 운영 로그에서 Supabase URL·공개 키 누락 예외 확인 | 기존 두 변수의 Production 적용과 재배포에 대한 사용자 승인 대기 |
| 기존 Production `/api/lite-engine/plan` | HTTP 500. 현재 운영 SHA에는 lite 라우트가 없으며 구형 전역 proxy에서 먼저 실패 | Supabase 복구와 PR #65 기능 배포를 별도 단계로 진행 |
| [PR 미리보기](https://newscomment-ai-git-claude-today-679f3c-jinalee07-8924s-projects.vercel.app) | Vercel 빌드는 성공. 이전 비인증 요청은 SSO 보호에서 302/401 | 인증된 엔진 계약 확인은 별도 필요. 보호 기능은 임의 해제하지 않음 |
| Vercel 접근 | 연결 도구는 프로젝트 목록이 비어 있으나, 로그인된 Chrome에서 실제 프로젝트·운영 로그·환경변수 범위 조회 성공 | 연결 도구의 404를 실제 프로젝트 부재로 해석하지 않음 |
| 새 경량 Apps Script | 저장소에 새 Sheet·script ID 및 Google 웹앱 deployment ID·`/exec` URL 없음 | 별도 빈 Sheet의 바운드 프로젝트를 확정한 후 배포 |
| 실제 API·Sheet 왕복·현장 실증 | 아직 검증하지 않음 | 아래 순서대로 수행하고 결과를 기록 |

공개 응답과 운영 로그 확인은 키·학생자료를 복사하지 않고 수행했다. 환경변수 값의 공개·변경, Production 적용 범위 변경, 재배포는 아직 수행하지 않았다.

### 확인된 운영 오류와 복구 순서

- 실제 Production은 `Ready`이며 배포 ID는 `4XZeHUwb5XkFBvtPq9BHUc8dwkeF`, 원본 SHA는 main의 `b0dc8087e298dc5aafcb29074c1eda6ff5040c34`다. 빌드 상태가 Ready여도 런타임 요청은 실패할 수 있다.
- 2026-09-10 운영 로그에서 `/api/health`, `/questioning-chatbot`, `/api/lite-engine/plan`, `/` 요청이 Supabase 클라이언트 초기화 중 URL과 Key가 필요하다는 예외로 실패한 것을 확인했다.
- 프로젝트 환경변수 목록에서 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`는 모두 **Preview에만 적용**되어 있었다. 이 두 값이 Production에 없는 것이 현재 부팅 오류의 원인이다. 값 자체는 열어 보거나 기록하지 않았다.
- 기존 값을 유지하면서 Production에도 적용하면 운영 앱이 Preview와 같은 Supabase 프로젝트를 사용한다. 이 연결 대상 선택과 재배포에 대해 사용자 확인을 요청했으며, 승인 전에는 설정을 변경하지 않는다. 새 DB 생성·기존 DB 교체·키 회전·서비스 비밀 키의 공개 변수 전환은 필요하지 않다.
- 승인 후 두 변수의 Production 범위를 추가하고 새 Production 빌드를 배포한 뒤, `/api/health`와 챗봇 페이지 접속 및 오류 로그를 다시 확인한다. 환경변수 저장만으로 복구 완료로 판정하지 않는다.
- 현재 운영 SHA에는 lite 엔진 라우트가 없다. 같은 SHA에서 Supabase 오류만 복구하면 `/api/lite-engine/plan`은 404가 예상된다. PR #65의 plan·finalize 라우트와 인증 설정을 배포해야 경량앱 연결 검증으로 넘어갈 수 있다.
- PR #65는 lite 경로를 Supabase proxy에서 제외하지만 일반 웹 경로는 여전히 위 두 값이 필요하다. `LITE_ENGINE_ACCESS_KEY`는 현재 프로젝트 변수 목록에 없으며, PR 반영 후에도 미설정 상태라면 lite 경로는 503을 반환한다. 별도의 안전한 키 설정·인증 계약 검증이 남아 있다.

## 기존 챗봇과 새 경량앱을 구분한다

| 구성 | 역할 | 이번 배포 원칙 |
| --- | --- | --- |
| `gas/`와 `gas/.clasp.json` | 이미 사용하던 Google Apps Script 학생 챗봇. 자체 정책 코드와 OpenAI 호출을 포함 | 기존 프로젝트·공개 학생 링크·시트 계약을 덮어쓰지 않음 |
| `newscomment-ai` 웹 앱 | 현재 저장소의 웹 질문챗봇과 공통 `questioning-dialogue-v2` 코어 | 같은 앱에 plan·finalize 경로를 함께 배포. 별도 중앙 서버를 신설하지 않음 |
| `gas-lite/` | 교사 개인 API·수업 설정·학생 화면·교사 소유 Sheet 저장 | 새 빈 Sheet에 바운드된 별도 프로젝트로 배포 |

`gas-lite → 기존 GAS /exec`로 요청을 보내는 구조는 아니다. `gas-lite → 기존 newscomment-ai 공통 코어 → 교사 개인 API → 같은 공통 코어의 최종 검증 → 교사 Sheet` 구조다. 기존 GAS와의 정책 회귀검사 통과는 실제 경량앱 배포 완료와 구별한다.

## 1. 기존 중앙 앱의 접근과 오류를 해결한다

1. [Vercel 프로젝트](https://vercel.com/jinalee07-8924s-projects/newscomment-ai)에 프로젝트 소유 계정으로 로그인한다. 비밀번호·API 키를 채팅이나 PR에 적지 않는다.
2. 운영 도메인이 가리키는 배포 ID와 Git SHA를 기록한다. PR의 최신 SHA와 같다고 추측하지 않는다.
3. `/api/health` 500 발생 시각의 런타임 로그에서 실제 예외를 확인한다. 필요한 정보만 기록하고 키·쿠키·학생 발화를 복사하지 않는다.
4. 원인이 설정이라면 해당 **기존 프로젝트**의 Production/Preview 적용 범위를 확인해 필요한 값만 복구한다. 다른 프로젝트의 DB 자격증명을 가져오거나 새 DB로 임의 교체하지 않는다.
5. 수정된 Preview에서 인증·plan·finalize 계약을 검증한 뒤 기존 Production에 반영한다. 로그인 보호를 해제하거나 HTTP 500을 단순 200으로 바꾸어 통과 처리하지 않는다.

### 읽기 전용 접속 점검

PowerShell에서 대상 origin을 명시한 뒤 실행한다. 아래 점검은 GET만 사용하며 모델을 호출하거나 Sheet에 기록하지 않는다.

```powershell
$env:LITE_ENGINE_TEST_BASE_URL = 'https://newscomment-ai.vercel.app'
npm run check:lite-deployment
```

- 점검 대상: `/api/health`, `/questioning-chatbot`, `/api/lite-engine/plan`
- plan의 비인증 HTTP 401은 기대 상태 코드일 뿐 엔진 식별 성공이 아니다. 호스팅 로그인 보호도 401을 줄 수 있으므로, 인증된 엔진 설명 응답까지 확인해야 통과로 판정한다.
- 환경에 `LITE_ENGINE_TEST_ACCESS_KEY`가 안전하게 제공된 경우 같은 origin의 plan에만 인증 GET을 추가한다. 키가 없으면 인증 검증은 **미완료**로 표시한다.
- 리다이렉트를 따라가지 않으므로 Vercel 로그인 페이지의 HTTP 200을 앱 정상 응답으로 오인하지 않으며 연결키를 다른 주소로 넘기지 않는다.
- 종료 코드 `0`: 기본 접속·엔진 설명 응답 검증 통과. `1`: 오류 또는 잘못된 설정. `2`: 공개 경로는 기대대로 응답했지만 연결키 인증은 미검증.
- 종료 코드 0도 POST plan·finalize, 개인 API, 실제 Sheet 저장, 연수 실증 완료를 의미하지 않는다.
- 점검 도구 자체의 모의 테스트는 `npm run test:lite-deployment-preflight`로 실행한다. 실제 운영 로그인을 대신하지 않는다.

## 2. 연결키와 배포 패키지를 일치시킨다

- `LITE_ENGINE_ACCESS_KEY`는 중앙 앱의 서버 전용 값이며 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
- 같은 값으로 `npm run build:gas-lite-distribution`을 실행한다. 실제 키는 안전한 실행 환경에서 공급하고 명령 예제·셸 이력·PR에 직접 적지 않는다.
- 생성된 `tmp/gas-lite-distribution/`에는 연결키가 들어 있으므로 공개 저장소나 공개 다운로드에 올리지 않는다.
- Production plan 주소는 `https://newscomment-ai.vercel.app/api/lite-engine/plan`이다. Preview용 패키지와 Production용 패키지를 구분한다.
- 인증된 GET plan의 `schemaVersion: 1`, `engineFamily: questioning-dialogue-v2`, `sharedWithWebChatbot: true`, `acceptsTeacherApiKey: false`를 확인한다.
- 유효한 예제로 POST plan·finalize 계약 검사를 별도로 수행한다. GET 성공만으로 모델 응답과 Sheet 저장까지 검증됐다고 표시하지 않는다.

## 3. 강사 운영본을 만든다

1. 새 빈 Google Sheet와 그 시트에 바운드된 Apps Script 프로젝트를 생성한다. 정확한 Sheet ID와 script ID를 비공개 운영 기록에 남긴다.
2. 배포 패키지 중 Apps Script가 지원하는 `.js`·`.html`·`appsscript.json` 11개 파일만 **새 프로젝트**에 올린다. README와 `DISTRIBUTION-NOTICE.txt`는 운영 안내이며 스크립트 파일이 아니다. 기존 `gas/.clasp.json`을 복사하거나 기존 프로젝트에서 push하지 않는다.
3. `내 수업 질문챗봇 → 1. 최초 준비`로 다섯 시트와 교사 설정 접근을 준비한다.
4. 강사 API, 목표·성취기준·평가기준·평가 근거·수업자료·모드·참여코드를 설정한다.
5. 새 웹앱을 배포 사용자로 실행하도록 배포한다. 현재 manifest 기본값은 `USER_DEPLOYING`·`ANYONE_ANONYMOUS`(비로그인 사용자 접근 허용)지만, 실제 배포의 학생 접근 범위는 아직 확정하지 않았다. 학교 정책에 맞는 접근 범위를 확인하고, 익명 공개 등 권한 확대는 승인 없이 진행하지 않는다.
6. 기존 챗봇 연결 확인 → 현재 수업 전용 `99-999` 미리보기 → 일반 학생 역할의 입장·질문·종료 → 교사 Sheet 기록 → 교사 검수·최종 확정까지 확인한다.
7. 실제 학생자료와 개인 API가 없는 별도의 깨끗한 연수생 템플릿을 준비한다. 강사 운영본을 그대로 공유하지 않는다.

## 4. 연수 배포 승인에 필요한 증거

- 강사 완성본의 실제 학생 URL과 당일 참여코드 확인
- 교사 사본에서 개인 API 연결·최초 배포·미리보기 성공
- 학생 질문과 답변이 해당 교사 Sheet에만 저장되는지 확인
- 자동 평가 초안 → 교사 수정 → 최종 평가가 분리되어 보존되는지 확인
- 향상 방법·다음 수업 제안이 평가와 함께 저장되는지 확인
- 최종 확정 뒤 새 관찰이 들어오면 재검수로 돌아오는지 확인
- 초보 교사 3명의 설정 시간·실패 지점 관찰
- 25명 동시 제출 및 30명 두 모둠 분산 제출의 누락·중복 호출 확인

사람이 참여하는 사용성·학교 계정 부하 검증을 로컬 모의 테스트 결과로 대신하지 않는다. 확인하지 않은 항목은 미완료로 남긴다.
