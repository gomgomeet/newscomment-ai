# 경량 교사·학생 앱 배포 실행 기록

## 현재 판정 — 2026-09-10 PR #66 Production 배포 확인

**PR #66의 Production 배포와 공개 웹 접속은 확인했다. 연결키를 사용하는 엔진 계약, 실제 교사·학생 운영 연결과 연수 실증은 아직 미완료다.** 빌드 성공, 웹 접속 성공, 실제 수업 검증은 서로 다른 완료 조건이다.

| 대상 | 확인 결과 | 다음 조치 |
| --- | --- | --- |
| [PR #66](https://github.com/gomgomeet/newscomment-ai/pull/66) | 2026-09-10 18:22:04 KST에 병합. 병합 커밋 `610b13b512bb92f40b957735261f0253bdec0f4f`의 Vercel 검사 성공 | 아래 Production 연결 검증 진행 |
| Production 배포 | `dpl_GTeTRvvbQj2fB8T7FHfBeL9umj9i`, `READY`. `newscomment-ai.vercel.app` 별칭 연결 확인 | 빌드 완료와 실제 수업 완료를 구분해 기록 |
| Production `/api/health` · `/questioning-chatbot` | 공개 접속 점검에서 각각 HTTP 200 | 실제 수업 흐름 검증 진행 |
| Production `/api/lite-engine/plan` | 비인증 GET HTTP 401. 연결키 인증은 미검증 | 인증된 GET과 POST plan·finalize 계약 확인 |
| Production 환경변수 | `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`는 Production·Preview, `LITE_ENGINE_ACCESS_KEY`는 Production에 존재 | 보관된 원본 연결키와 배포 패키지 일치 확인 |
| 로컬 Vercel CLI | `54.21.1` 설치. `vercel whoami`에서 `jinalee07-8924` 인증 확인 | 기존 프로젝트의 배포·로그·변수 적용 범위 확인에 사용 |
| Production 페이지·글꼴 | 학생 페이지 HTML 제목 확인. Pretendard CSS·글꼴 파일·OFL 라이선스 확인 | 실제 학생 화면과 수업 흐름 검증 진행 |
| 새 배포 오류 로그 | 해당 배포 ID로 제한한 점검 시점 최근 15분의 `error` 로그 없음 | 확인 구간 밖의 안정성은 별도 관찰 필요 |
| 새 경량 Apps Script | 저장소에 새 Sheet·script ID 및 Google 웹앱 deployment ID·`/exec` URL 없음 | 별도 빈 Sheet의 바운드 프로젝트를 확정한 후 배포 |
| 실제 API·Sheet 왕복·현장 실증 | 아직 검증하지 않음 | 아래 순서대로 수행하고 결과를 기록 |

배포 URL은 [newscomment-lo4z8gst0-jinalee07-8924s-projects.vercel.app](https://newscomment-lo4z8gst0-jinalee07-8924s-projects.vercel.app)이며, 운영 주소는 [newscomment-ai.vercel.app](https://newscomment-ai.vercel.app)이다. 병합 시각의 UTC 표기는 `2026-09-10T09:22:04Z`다.

Production `/questioning-chatbot`의 HTML 제목과 연결된 CSS의 `font-weight: 45 920`, `font-display: swap`을 확인했다. `/fonts/pretendard/PretendardVariable.woff2`의 SHA-256은 로컬 원본과 일치했고, `/fonts/pretendard/LICENSE`에서 OFL 라이선스를 확인했다. 새 배포에 한정한 최근 15분의 `error` 로그 조회 결과는 `No logs found`였으며, 이는 해당 확인 구간의 결과이고 장기 안정성이나 실제 교실 운영 검증은 아니다.

현재 점검에서는 환경변수의 이름·적용 범위만 기록했다. `LITE_ENGINE_ACCESS_KEY`는 `sensitive` 유형으로, 단일 변수 API 조회도 원본 값을 반환하지 않았다. 보관된 원본 연결키가 안전한 실행 환경에 제공되어야 인증 검사와 배포 패키지 생성으로 진행할 수 있다. 키를 채팅이나 문서에 기록하거나 기존 키를 임의로 회전하지 않는다. 별도 경량 Apps Script 프로젝트가 이미 만들어졌는지도 확인이 필요하다.

### 이전 기록 — PR #66 배포 전 Production 장애

아래는 같은 날 앞선 점검에서 확인한 장애와 당시 미완료 항목이다. 현재 배포 상태는 위 표를 따른다.

- 당시 Production 배포 ID는 `4XZeHUwb5XkFBvtPq9BHUc8dwkeF`, 원본 SHA는 main의 `b0dc8087e298dc5aafcb29074c1eda6ff5040c34`였다. 빌드는 `Ready`였지만 런타임 요청은 실패했다.
- 당시 운영 로그에서 `/api/health`, `/questioning-chatbot`, `/api/lite-engine/plan`, `/` 요청이 Supabase 클라이언트 초기화 중 URL과 Key가 필요하다는 예외로 실패한 것을 확인했다.
- 당시 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`는 **Preview에만 적용**되어 있었다. Production에 두 변수가 없는 것이 그 배포의 부팅 오류 원인이었으며, 값 자체는 열어 보거나 기록하지 않았다.
- 당시에는 기존 두 변수의 Production 적용과 재배포에 대해 사용자 확인을 요청한 상태였다. 최신 CLI 조회에서는 두 변수의 Production 적용과 새 배포의 공개 HTTP 200 응답을 확인했으므로, 이전의 적용 승인 대기를 현재 블로커로 보지 않는다.
- 당시 운영 SHA에는 lite 엔진 라우트가 없어 Supabase 오류만 복구하면 plan 404가 예상되었다. PR #65는 점검 당시 HEAD `92d5653`, `OPEN`, Vercel 빌드 성공이었으며, 이후 PR #66까지 반영된 현재 배포의 plan은 비인증 GET에 401을 반환한다.
- 당시에는 `LITE_ENGINE_ACCESS_KEY`가 프로젝트 변수 목록에 없었다. 현재는 Production에 존재하지만, 인증된 엔진 계약 검증은 여전히 남아 있다.
- 이전 PR 미리보기의 비인증 요청은 SSO 보호에서 302/401을 반환했다. 연결 도구의 프로젝트 목록은 비어 있었지만 로그인된 Chrome에서는 실제 프로젝트·운영 로그·변수 범위를 조회할 수 있었다. 연결 도구의 404를 실제 프로젝트 부재로 해석하지 않는다.

## 기존 챗봇과 새 경량앱을 구분한다

| 구성 | 역할 | 이번 배포 원칙 |
| --- | --- | --- |
| `gas/`와 `gas/.clasp.json` | 이미 사용하던 Google Apps Script 학생 챗봇. 자체 정책 코드와 OpenAI 호출을 포함 | 기존 프로젝트·공개 학생 링크·시트 계약을 덮어쓰지 않음 |
| `newscomment-ai` 웹 앱 | 현재 저장소의 웹 질문챗봇과 공통 `questioning-dialogue-v2` 코어 | 같은 앱에 plan·finalize 경로를 함께 배포. 별도 중앙 서버를 신설하지 않음 |
| `gas-lite/` | 교사 개인 API·수업 설정·학생 화면·교사 소유 Sheet 저장 | 새 빈 Sheet에 바운드된 별도 프로젝트로 배포 |

`gas-lite → 기존 GAS /exec`로 요청을 보내는 구조는 아니다. `gas-lite → 기존 newscomment-ai 공통 코어 → 교사 개인 API → 같은 공통 코어의 최종 검증 → 교사 Sheet` 구조다. 기존 GAS와의 정책 회귀검사 통과는 실제 경량앱 배포 완료와 구별한다.

## 1. 기존 중앙 앱의 운영 연결을 확인한다

1. [Vercel 프로젝트](https://vercel.com/jinalee07-8924s-projects/newscomment-ai)에 프로젝트 소유 계정으로 로그인한다. 비밀번호·API 키를 채팅이나 PR에 적지 않는다.
2. 운영 도메인이 가리키는 배포 ID와 Git SHA를 기록한다. PR의 최신 SHA와 같다고 추측하지 않는다.
3. `/api/health`와 `/questioning-chatbot`의 정상 응답을 확인한다. HTTP 500이 재발하면 발생 시각의 런타임 로그에서 실제 예외를 확인하고, 키·쿠키·학생 발화를 복사하지 않는다.
4. 해당 **기존 프로젝트**의 Production/Preview 환경변수 적용 범위를 확인한다. 설정 복구가 필요할 때 다른 프로젝트의 DB 자격증명을 가져오거나 새 DB로 임의 교체하지 않는다.
5. 현재 Production의 인증된 엔진 설명과 POST plan·finalize 계약을 검증한다. 이후 코드를 수정하면 Preview 검증을 거쳐 Production에 반영한다. 로그인 보호를 해제하거나 HTTP 500을 단순 200으로 바꾸어 통과 처리하지 않는다.

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
3. `simbot → 1. 최초 준비`로 다섯 시트와 교사 설정 접근을 준비한다.
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
