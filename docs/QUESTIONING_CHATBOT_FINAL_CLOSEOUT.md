# 질문 챗봇 최종 마감 기록

작성일: 2026-08-26

대상 브랜치: `codex/questioning-chatbot-final-closeout`

관련 기준: PR #12 병합본, Draft PR #13 문서 정리, 리서치 반영 우선순위 `1 -> 5 -> 2 -> 3`

## 마감 목표

학생이 지문을 더 깊게 이해하고 좋은 질문을 만들 수 있도록, 챗봇이 자연스럽게 답하고 필요한 순간에만 발판을 놓는 구조로 정리한다. 성취기준과 교사 메모는 대화의 나침반으로 쓰되, 학생에게 같은 중심 생각이나 모범 질문을 강요하지 않는다.

## 최종 반영

- 생각 카드 검색을 단순 낱말 겹침에서 의도·출처·검증 상태 기반 랭킹으로 강화했다.
- 검토 전 카드와 오래된 카드는 학생 답변 근거에서 제외했다.
- 교사 답변 카드, 검증 카드, 신뢰 가능한 리서치 카드가 우선 쓰이도록 점수 체계를 조정했다.
- 자료 밖 리서치 답변은 별도 블록처럼 붙이지 않고 학생에게 보이는 답변 안에 자연스럽게 결합했다.
- 낱말 질문은 사전적 의미와 문맥적 의미를 한 번에 과하게 밀어 넣지 않고, 학생의 이어지는 질문에 맞춰 나누어 답하도록 했다.
- `doNotForce` 기준을 Gemini 프롬프트에 넣어 성취기준 수렴 과잉을 줄였다.
- 로컬 fallback은 한 응답에 질문을 여러 개 던지지 않도록 더 조용하게 다듬었다.

## 검증 결과

- `npm run typecheck`: 통과
- `npm run eval:questioning`: 48회기 192턴, 실패 0건, 검토 플래그 0건
- `npm run lint`: 통과
- `npm run build`: 통과
- 라이브 시뮬레이션: 통과, 교사용 평가 엑셀 생성 확인

라이브 시뮬레이션은 현재 서버 설정에서 `localFallback: true`로 실행됐다. 즉, Gemini 고도화 프롬프트와 리서치 경로는 코드에 반영됐지만, 실제 학생 답변이 Gemini로 생성되는지는 `QUESTIONING_STUDENT_LLM_ENABLED=true`, `QUESTIONING_STUDENT_PROVIDER=approved_gemini`, 수업 코드 연결이 모두 준비된 뒤 다시 확인해야 한다.

## 커밋 제외

다음 파일은 검증 산출물이므로 Git 커밋에서 제외한다.

- `output/run-live-questioning-actual.json`
- `output/*.xls`

## 남은 확인점

- Vercel Production과 Preview 환경변수에서 학생 Gemini 경로가 의도대로 켜지는지 확인한다.
- 실제 수업 코드 접속으로 카드 검색, 실시간 리서치, 분석, 엑셀 저장이 한 흐름으로 이어지는지 재검증한다.
- Draft PR #13은 문서 전용 PR이므로 별도 검토 후 병합한다.

## 2026-08-26 오전 Gemini 경로 재점검

Vercel 환경변수는 Production과 Preview 모두에서 `QUESTIONING_STUDENT_LLM_ENABLED=TRUE`, `QUESTIONING_STUDENT_PROVIDER=approved_gemini`로 확인됐다. 코드가 값을 `trim().toLowerCase()`로 비교하므로 배포 환경에서는 학생 Gemini 경로가 켜질 조건을 만족한다. 로컬 `.env.local`에는 Gemini 키와 학생 LLM 스위치가 없어서, 로컬 기본 실행만으로는 계속 fallback이 된다.

Production 환경변수를 주입한 로컬 서버에서 라이브 시뮬레이션을 다시 실행했다. 결과는 5턴 모두 `localFallback: false`였고, 카드 생성·카드 조회·질문 분석·교사용 평가 엑셀 생성까지 연결됐다.

첫 실행에서 Gemini 실제 응답 품질 문제 2개를 발견했다.

- 개인정보 비식별 질문 `어떤 친구는 이름을 말하지 않아도 되나요?`를 수업 외 질문처럼 차갑게 돌렸다.
- 종료 발화 `이제 알겠어요.`에 `네, 이제 알겠어요.`처럼 학생 말을 어색하게 복창했다.

이를 서버 정규화 단계에서 보완했다. 개인정보를 말하지 않아도 되는지 묻는 질문은 `safety_redirect`로 고정해 이름 대신 `한 친구`, `어떤 학생`처럼 비식별 표현을 안내한다. 명확한 종료 발화는 모델 출력과 관계없이 질문 없는 마무리 문장으로 바꾼다.

수정 후 재실행 결과, 5턴 모두 `localFallback: false`를 유지했고 위 두 문제가 해결됐다. 현재 남은 관찰점은 4번 추론 진술에 Gemini가 후속 질문을 붙인 부분이다. 질문이 하나이고 적용 사고를 여는 방향이라 실패는 아니지만, 실제 수업에서는 학생 피로도를 보며 질문 빈도를 계속 관찰한다.

검증:

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm run eval:questioning`: 48회기 192턴, 실패 0건, 검토 플래그 0건
- `npm run build`: 통과
- Production env 라이브 시뮬레이션: `localFallback: false`, 엑셀 생성 확인
