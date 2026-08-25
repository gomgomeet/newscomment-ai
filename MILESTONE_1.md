# NewsComment AI 마일스톤 1

## 완료

- TypeScript strict mode, Tailwind CSS, ESLint가 적용된 Next.js App Router 프로젝트를 구성했다.
- 버튼, 카드, 입력창, 라벨, 텍스트 영역을 위한 shadcn/ui 스타일의 로컬 컴포넌트를 추가했다.
- Supabase SSR 인증 구조를 만들었다.
  - `lib/supabase/client.ts`
  - `lib/supabase/server.ts`
  - `lib/supabase/middleware.ts`
- 인증 경로와 액션을 만들었다.
  - `/login`
  - `/sign-up`
  - `/auth/callback`
  - 로그아웃 서버 액션
- 사이드바와 헤더가 있는 보호된 `/dashboard` 앱 구조를 만들었다.
- 프로젝트 생성, 목록, 상세 페이지를 만들었다.
- 프로젝트 생성 시 인증된 서버 세션의 사용자 ID를 사용하도록 했다.
- 루브릭, 평가, 비교, 인사이트, 설정의 자리표시자 페이지를 만들었다.
- `/api/health` 경로를 만들었다.
- 스키마, RLS 정책, 소유권 확인, 트리거를 포함한 Supabase 초기 마이그레이션을 만들었다.
- 필수 Supabase 환경변수를 위한 `.env.example`을 추가했다.

## 검증

```bash
npm run lint
npm run typecheck
npm run build
```

세 명령이 모두 통과했다.

## 남은 문제

- 실제 백엔드와 연결하려면 로컬에 Supabase 자격 정보를 추가해야 한다.
- 이 작업 공간에서는 SQL 마이그레이션이 라이브 Supabase 프로젝트에 아직 적용되지 않았다.
- GitHub PR 생성에는 원격 저장소 설정 또는 생성 권한이 필요하다.
