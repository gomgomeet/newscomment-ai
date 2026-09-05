# 과정중심 평가 대시보드 작업 인수인계

작성일: 2026-08-29 (KST)  
저장소: <https://github.com/gomgomeet/newscomment-ai>  
서비스: <https://newscomment-ai.vercel.app>  
Supabase 프로젝트 ref: `xxbizrmgqfjqwiqxgiwe`

이 문서는 다른 컴퓨터에서 **평가 준비 프렙 → Notion 결과 읽기 → AI 평가 초안 → 교사 검토·확정 → 성장 기록 보드(생기부) → 선택 내보내기** 작업을 바로 이어가기 위한 최신 메모다. 비밀키와 실제 학생 데이터는 기록하지 않았다.

## 1. 가장 먼저 알아야 할 현재 상태

- 기능 개발 기준 브랜치는 이제 `main`이다. PR #50과 #51이 모두 병합되었다.
- 현재 `origin/main`의 기준 커밋은 `26bbef1`이다.
- GitHub와 Vercel에서 빌드·배포 상태는 `SUCCESS`였지만, Production 주소는 현재 모든 동적 요청에서 `HTTP 500`이 발생한다.
- 확인한 오류:
  - `GET https://newscomment-ai.vercel.app/` → `500`
  - `GET https://newscomment-ai.vercel.app/dashboard/compare` → `500`
  - `GET https://newscomment-ai.vercel.app/api/health` → `500 Internal Server Error`
- 따라서 다음 작업의 최우선 순위는 새 기능 추가가 아니라 **Production 500 복구**다.
- 가장 가능성이 큰 원인은 Vercel에 Supabase 공개 환경변수가 없거나 이름이 다른 것이다. `proxy.ts`가 `/api/health`를 포함한 요청마다 Supabase 세션을 갱신하므로, 공개 URL 또는 publishable key가 빠지면 페이지 코드에 도달하기 전에 전체 서비스가 실패할 수 있다.
- `EVALUATION_SECRET_ENCRYPTION_KEY`는 사용자가 Vercel에 설정했다고 확인했다. 값은 이 문서나 채팅에 다시 적지 않는다.
- 현재 연결에서는 Vercel Runtime Logs 조회 권한을 얻지 못했다. 환경변수 확인 후에도 500이면 Vercel 웹 대시보드에서 Runtime Logs를 직접 확인해야 한다.

## 2. 다른 컴퓨터에서 저장소 열기

새로 받는 경우:

```bash
git clone https://github.com/gomgomeet/newscomment-ai.git
cd newscomment-ai
git switch main
git pull --ff-only origin main
```

이미 저장소가 있는 경우:

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
```

이 인수인계 문서가 아직 `main`에 병합되기 전이라면 다음 브랜치에서 읽는다.

```bash
git fetch origin
git switch docs/evaluation-dashboard-continuation-handoff
```

Codex에서는 저장소 폴더를 프로젝트로 연 뒤 아래 문구로 시작하면 된다.

```text
docs/EVALUATION_DASHBOARD_CONTINUATION_HANDOFF.md를 먼저 읽고 이어서 작업해줘.
새 기능보다 Production /api/health 500 복구를 우선하고, 복구 뒤 교사 계정의
Notion 연결부터 성장 기록 보드까지 전체 흐름을 검증해줘.
```

## 3. 로컬 개발 환경 준비

권장 환경은 Node.js 24 계열과 npm 또는 pnpm이다. 저장소에는 `package-lock.json`이 있으므로 가장 재현성 높은 시작은 npm이다.

```bash
npm ci
copy .env.example .env.local
npm run typecheck
npm run lint
npm run test:evaluation-review
npm run build
npm run dev
```

macOS/Linux에서는 `copy` 대신 다음을 사용한다.

```bash
cp .env.example .env.local
```

pnpm을 쓰는 환경에서는 다음 명령으로 같은 검증을 실행할 수 있다. 새 lock 파일은 의도 없이 커밋하지 않는다.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test:evaluation-review
pnpm build
pnpm dev
```

현재 Windows 컴퓨터의 Codex 번들 런타임 경로는 아래와 같다. 다른 컴퓨터에서는 그 컴퓨터에 설치된 Node.js와 패키지 관리자를 사용한다.

- Node: `C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- pnpm: `C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd`

## 4. 환경변수 체크리스트

### 반드시 필요한 값

| 변수 | 위치 | 메모 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 로컬 `.env.local`, Vercel | Production 예상 URL은 `https://xxbizrmgqfjqwiqxgiwe.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 로컬 `.env.local`, Vercel | Supabase의 Publishable key. 이름이 정확해야 함 |
| `EVALUATION_SECRET_ENCRYPTION_KEY` | 서버 전용, Vercel | 교사별 Notion 토큰 암호화. 사용자가 설정 완료했다고 확인함 |

`NEXT_PUBLIC_SUPABASE_ANON_KEY`만 설정해서는 현재 코드가 읽지 못한다. 반드시 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`라는 정확한 이름을 사용한다.

### 기능에 따라 필요한 값

| 변수 | 용도 |
| --- | --- |
| `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 관리 작업 |
| `OPENAI_API_KEY` | AI 평가 초안 생성 |
| `OPENAI_EVALUATION_MODEL` | 평가 모델 지정. `.env.example` 기본값 참고 |
| `NOTION_API_KEY` | 선택적인 레거시/공용 데모 연결에만 사용 |

평가 대시보드의 기본 Notion 연결은 교사가 `/dashboard/settings`에서 자기 토큰을 연결하고 서버가 암호화해 보관하는 방식이다. 교사의 Notion 토큰을 `NOTION_API_KEY` 하나로 공용 운영하는 구조로 되돌리지 않는다.

주의:

- 비밀키 값을 GitHub, PR, Markdown, 스크린샷, 채팅에 남기지 않는다.
- Vercel에서는 우선 Production, Preview, Development 세 범위에 필요한 변수가 적용됐는지 확인한다.
- 환경변수를 새로 저장한 뒤에는 **최신 `main`을 Redeploy**해야 실행 환경에 반영된다.

## 5. Production 500 복구 순서

1. Vercel 프로젝트 `newscomment-ai`의 **Settings → Environment Variables**를 연다.
2. `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`가 정확한 이름으로 존재하는지 확인한다.
3. 두 값이 Production 범위에 포함됐는지 확인한다. Preview와 Development에도 적용하는 것을 권장한다.
4. `EVALUATION_SECRET_ENCRYPTION_KEY`가 존재하는지만 확인한다. 값을 복사해 문서에 남기지 않는다.
5. 최신 `main` 배포를 Redeploy한다. 현재 기능 병합 기준 커밋은 `26bbef1`이다.
6. Windows PowerShell에서 다음으로 확인한다.

```powershell
curl.exe -i https://newscomment-ai.vercel.app/api/health
curl.exe -I https://newscomment-ai.vercel.app/dashboard/compare
```

정상 기대값:

- `/api/health` → `HTTP 200`과 `{"ok":true,"service":"newscomment-ai",...}`
- 비로그인 상태의 `/dashboard/compare` → 로그인 화면으로 이동하거나 인증용 redirect
- 로그인 후 `/dashboard/compare` → 교사 검토 작업대 표시

환경변수 수정 후에도 `/api/health`가 500이면 Vercel **Runtime Logs**에서 같은 요청의 첫 번째 예외를 확인한다. 현재 Codex 연결에서는 프로젝트 로그 권한이 없어 이 단계만 Vercel 웹 대시보드가 필요하다.

## 6. 구현 완료 범위

### PR #47 — 평가 대시보드 시연 흐름

- 평가 준비 프렙과 평가 과정 연결
- Notion 결과 읽기
- AI 평가 초안, 교사 검토·확정, 결과 화면
- 성장 기록 보드(생기부)
- 학교 PDF 양식 읽기와 결과 PDF/Notion 선택 내보내기 기반
- Supabase 평가 관련 마이그레이션과 시연 문서

PR: <https://github.com/gomgomeet/newscomment-ai/pull/47>

### PR #50 — 교사별 Notion 연결

- 교사가 설정 화면에서 자기 Notion 토큰을 연결
- 토큰을 서버에서 암호화해 교사별로 저장
- 평가 준비, Notion 미리보기·가져오기, 평가 결과, 성장 기록 저장 경로에 연결
- 원격 Supabase에 `20260828151841_evaluation_notion_connections.sql` 적용 확인
- 병합 커밋: `993f72d`

PR: <https://github.com/gomgomeet/newscomment-ai/pull/50>

### PR #51 — 교사 검토 작업대 가시성

- `/dashboard/compare`를 기본 교사 검토 작업대로 재구성
- 미평가 Notion 결과까지 포함한 전체 결과 검색·프로젝트 필터
- 자동 선별 필터:
  - 교사 확인 우선
  - 근거 확인
  - 재작성 권장
  - 성장 기록 준비
  - 전체
- AI 점수/교사 점수, 평가 근거, 피드백, 평가 포워드, 조정 이유 비교
- 원본 Notion 링크와 프로젝트별 상세 평가 deep link
- 활동별 제출 → AI 초안 → 교사 확정 → 대기 현황
- 자동 선별 규칙 테스트 6개 추가
- 병합 커밋: `26bbef1`

PR: <https://github.com/gomgomeet/newscomment-ai/pull/51>

## 7. 복구 후 전체 시연 검증

실제 학생 개인정보 대신 테스트 교사·테스트 결과를 사용한다.

- [ ] Production `/api/health`가 200이다.
- [ ] 비로그인 상태에서 보호 화면이 로그인으로 이동한다.
- [ ] Supabase 로그인/로그아웃이 된다.
- [ ] `/dashboard/settings`에서 교사별 Notion 연결 상태가 보인다.
- [ ] 교사 Notion Integration이 결과 데이터베이스와 선택 저장용 페이지에 공유되어 있다.
- [ ] 평가 준비 프렙에서 성취기준·평가 목표·루브릭을 만들고 확정한다.
- [ ] Notion 결과를 미리보기하고 평가 대상 결과를 읽어온다.
- [ ] AI 평가 초안을 생성한다.
- [ ] `/dashboard/compare`의 다섯 필터와 검색·프로젝트 선택이 동작한다.
- [ ] 교사가 점수와 근거를 고치고 조정 이유를 입력해 최종 확정한다.
- [ ] 확정 결과와 평가 포워드가 활동 결과 화면에 반영된다.
- [ ] 성장 기록 보드(생기부)에서 활동별 결과 누적과 종합 초안을 확인한다.
- [ ] PDF 다운로드가 된다.
- [ ] 사용자가 선택한 경우에만 평가 결과/종합 결과를 자기 Notion 워크스페이스에 페이지로 저장한다.
- [ ] 다른 교사 계정으로 첫 교사의 프로젝트·결과·Notion 연결을 볼 수 없다.

## 8. Supabase 확인 사항

- 교사별 Notion 연결 마이그레이션 `20260828151841_evaluation_notion_connections.sql`은 원격 적용이 확인되었다.
- 새 컴퓨터에서 임의로 마이그레이션을 다시 적용하지 말고 먼저 로컬/원격 migration history를 비교한다.
- RLS는 로그인 여부만이 아니라 `auth.uid()` 기반 소유권을 확인해야 한다.
- `UPDATE` 정책에는 `USING`과 `WITH CHECK`가 모두 있어야 한다.
- 브라우저 번들에 Supabase secret/service-role key 또는 Notion token이 노출되면 안 된다.
- 실제 운영 전 테스트 교사 계정 두 개로 상호 데이터 격리를 확인한다.

## 9. 다음 개발 우선순위

1. Production `/api/health` 500 복구
2. 로그인과 교사별 Notion 연결 실환경 검증
3. 평가 준비 프렙 → 결과 가져오기 → 교사 확정 → 성장 기록 보드 E2E 검증
4. 실패·빈 상태·권한 오류 안내 다듬기
5. 교사 시연 동선과 샘플 데이터 정리
6. 평가 포워드 누적을 활용한 수업 개선·학생 성장 인사이트 품질 개선
7. 학교 PDF 양식 반영 결과의 시각 검수

새 기능을 시작하기 전에 1~3번을 완료한다. Production이 살아 있어야 대시보드 시연과 사용자 피드백이 의미가 있다.

## 10. 작업 종료 시 남길 기록

매 작업 종료 때 이 문서 또는 후속 PR에 아래 형식으로 남긴다.

```text
[작업 진행 상황]
- 완료: 실제로 확인한 항목
- 현재 문제: 재현 URL, 상태 코드, 비밀값을 뺀 오류 메시지
- 사용자가 해야 할 일: 대시보드에서 필요한 한 가지 행동
- 다음 시작점: 브랜치, 커밋, 실행 명령
- 검증: typecheck / lint / test:evaluation-review / build / Production E2E 결과
```

완료로 표시할 때는 GitHub/Vercel의 `SUCCESS`만 보지 말고 Production URL에서 실제 HTTP 응답과 교사 핵심 동선을 확인한다.
