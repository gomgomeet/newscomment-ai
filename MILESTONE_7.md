# NewsComment AI 마일스톤 7

## 완료

- 루브릭 기반 댓글 평가를 위한 OpenAI Responses API 유틸리티를 추가했다.
- `.env.example`에 `OPENAI_API_KEY`와 `OPENAI_EVALUATION_MODEL`을 추가했다.
- AI 평가 요청은 `store: false`를 사용한다.
- AI 평가 출력은 구조화된 JSON으로 요청한다.
- AI 평가 서버 액션을 추가했다.
- 댓글 카드에 `AI 초안 생성` 버튼을 추가했다.
- AI가 생성한 전체 피드백은 `evaluations`에 저장된다.
- AI가 생성한 기준별 점수와 근거는 `evaluation_scores`에 저장된다.
- `OPENAI_API_KEY`가 없을 때 앱이 중단되지 않고 사용자에게 안내 메시지를 보여 준다.

## 검증

```bash
npm run lint
npm run typecheck
npm run build
```

마일스톤 7 변경 후 세 명령이 모두 통과했다.

## 남은 문제

- 라이브 OpenAI API 테스트에는 `OPENAI_API_KEY`가 필요하다.
- 라이브 Supabase 테스트에는 Supabase 자격 정보와 적용된 마이그레이션이 필요하다.
- AI 프롬프트 품질과 채점 보정에는 교실 샘플 데이터가 필요하다.
- 현재 AI 평가는 같은 댓글에 대해 교사가 저장한 현재 평가를 덮어쓴다.
