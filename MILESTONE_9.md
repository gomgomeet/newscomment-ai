# NewsComment AI 마일스톤 9

## 완료

- 루트 Next.js 요청 훅을 `middleware.ts`에서 `proxy.ts`로 이전했다.
- Supabase SSR 세션 새로고침 동작을 유지했다.
- Next.js 16 middleware 지원 중단 빌드 경고를 제거했다.

## 검증

```bash
npm run lint
npm run typecheck
npm run build
```

마일스톤 9 변경 후 세 명령이 모두 통과했다.

## 남은 문제

- 실제 백엔드 테스트에는 라이브 Supabase 자격 정보와 마이그레이션이 필요하다.
- 라이브 OpenAI 평가 테스트에는 `OPENAI_API_KEY`가 필요하다.
