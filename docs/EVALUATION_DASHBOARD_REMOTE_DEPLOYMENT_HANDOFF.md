# 평가 대시보드 원격 배포 인수인계

작성일: 2026-08-28
대상 PR: [#47 과정중심평가 대시보드 시연 흐름 구현](https://github.com/gomgomeet/newscomment-ai/pull/47)
작업 브랜치: `feat/evaluation-dashboard-demo-flow`
배포 대상: Vercel 프로젝트 `newscomment-ai`

## 1. 현재 상태

- 평가 준비 프렙 → Notion 결과 읽기 → AI 평가 초안 → 교사 검토·확정 → 평가 결과 → 성장 기록 보드(생기부) → PDF/Notion 선택 내보내기 흐름을 구현했다.
- Supabase 마이그레이션 `008`~`014`, 시연 실행서, 개발 계획서, 학교 양식 샘플 PDF를 PR에 포함했다.
- GitHub PR은 `OPEN`, `MERGEABLE`, `CLEAN` 상태다.
- Vercel Preview와 Preview Comments 검사는 모두 통과했다.
- 현재 Preview는 Vercel Deployment Protection이 적용되어 있으므로 프로젝트 접근 권한이 있는 Vercel 계정으로 확인한다.

## 2. 배포 결과

- Preview URL: <https://newscomment-ai-git-feat-evaluat-c48c3e-jinalee07-8924s-projects.vercel.app>
- Vercel 상태: `READY`
- 최초 기능 커밋: `8903276`
- 대상 브랜치: `main`
- Production 상태: 병합 전, 미배포

Production 배포는 PR을 `main`에 병합하면 기존 GitHub–Vercel 연동이 자동으로 시작한다. 이 문서를 추가하는 커밋까지 Preview 검사가 다시 통과한 뒤 병합한다.

## 3. 현재 정지된 이유

### 3.1 Production 병합 승인

`main` 병합은 실제 서비스 트래픽에 반영되는 변경이다. 따라서 PR #47의 Preview를 확인한 뒤 명시적으로 Production 병합을 승인해야 한다.

승인 문구 예시:

```text
PR #47을 main에 병합하고 프로덕션 배포를 진행해줘.
```

### 3.2 Vercel 원격 인증

현재 작업 PC에는 다음 원격 관리 인증이 없다.

- `VERCEL_TOKEN`: 없음
- `.vercel/project.json`: 없음
- Vercel CLI 로그인 세션: 확인되지 않음

GitHub–Vercel 자동 Preview 배포는 정상 작동하지만, 이 PC에서 Vercel 원격 환경변수 목록·런타임 로그를 직접 조회하거나 수정할 수는 없다. 토큰 값을 GitHub, 문서, 채팅에 기록하지 않는다.

### 3.3 로컬 환경변수 상태

값은 기록하지 않고 설정 여부만 확인했다.

| 환경변수 | 로컬 상태 | 용도 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 설정됨 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 설정됨 | 브라우저용 공개 키 |
| `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY` | 미설정 | 서버 전용 관리 작업이 필요할 때 사용 |
| `OPENAI_API_KEY` | 미설정 | AI 평가 초안 생성 |
| `NOTION_API_KEY` | 미설정 | Notion 결과 읽기 및 선택 페이지 저장 |

로컬 상태와 Vercel 상태는 서로 다를 수 있다. Vercel Dashboard의 **Settings → Environment Variables**에서 Preview와 Production 범위를 각각 확인한다.

## 4. 사용자가 원격에서 먼저 확인할 항목

1. Vercel 프로젝트 `newscomment-ai`의 Environment Variables를 연다.
2. 아래 공개 변수가 Preview와 Production에 설정되어 있는지 확인한다.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. 시연할 기능에 맞춰 아래 서버 전용 변수를 설정한다.
   - `OPENAI_API_KEY`
   - `NOTION_API_KEY`
   - 필요한 경우 `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`
4. 서버 전용 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
5. Preview를 Redeploy한 뒤 `/dashboard/settings`에서 연결 상태를 확인한다.
6. Notion Integration을 학생 결과 데이터베이스와 선택 저장용 상위 페이지에 연결한다.

## 5. Supabase 운영 확인

Supabase는 새 테이블을 Data API에 자동 노출하지 않는 방향으로 변경되고 있다. 앱에서 `42501 permission denied`가 발생하면 RLS만 확인하지 말고 `anon` 또는 `authenticated` 역할에 필요한 명시적 `GRANT`가 있는지도 확인한다.

Production 전 최소 확인 항목:

- 평가 데이터가 들어가는 모든 `public` 테이블에 RLS가 활성화되어 있다.
- 정책은 로그인 여부만 확인하지 않고 `auth.uid()` 기반 소유권 조건을 포함한다.
- `UPDATE` 정책에는 `USING`과 `WITH CHECK`가 모두 있다.
- 브라우저에 Supabase secret/service-role 키가 노출되지 않는다.
- 두 개의 테스트 계정으로 서로의 프로젝트·학생 결과를 읽을 수 없는지 확인한다.
- 마이그레이션 `008`~`014`가 원격 DB에 적용되어 있다.

## 6. 재개 절차

1. 이 문서 커밋의 Vercel Preview 검사가 `SUCCESS`가 될 때까지 기다린다.
2. Vercel 환경변수와 Notion 공유 설정을 확인한다.
3. Preview에서 다음 핵심 동선을 실행한다.
   - 로그인
   - 평가 준비 프렙 확정
   - Notion 결과 3건 미리보기·가져오기
   - AI 초안 생성
   - 교사 수정·최종 확정
   - 성장 기록 보드(생기부) 생성
   - 샘플 PDF 다운로드
4. PR #47을 `main`에 병합한다.
5. Vercel Production 배포가 `READY`가 될 때까지 확인한다.
6. Production에서 `/api/health`와 핵심 화면을 확인하고 최근 오류 로그를 점검한다.

## 7. 원격 메시지 원칙

진행이 막히면 PR #47에 다음 형식으로 댓글을 남긴다.

```text
[원격 배포 진행 상황]
- 완료: 실제로 끝난 작업
- 정지 지점: 막힌 단계와 오류 메시지
- 필요한 사용자 작업: 사용자가 직접 해야 하는 한 가지 행동
- 재개 조건: 어떤 상태가 되면 다시 진행할 수 있는지
- 관련 문서/로그: 비밀값을 제외한 링크
```

비밀키, 학생 개인정보, 실제 학생 결과 본문은 PR 댓글과 Markdown 문서에 기록하지 않는다.

## 8. 완료 판정

- [ ] PR #47의 최신 커밋 검사가 모두 통과함
- [ ] Preview 핵심 동선 확인 완료
- [ ] Vercel Preview/Production 환경변수 확인 완료
- [ ] Production 병합 명시적 승인
- [ ] PR #47 `main` 병합 완료
- [ ] Production 배포 `READY`
- [ ] Production 상태 확인 및 오류 로그 점검 완료
