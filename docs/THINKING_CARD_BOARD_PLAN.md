# 생각 카드 도입 — 교사용 보드 수정 계획

`docs/THINKING_CARD_KNOWLEDGE_BASE.md`의 설계를 지금 코드에 얹기 위해 무엇을 어디까지
고쳐야 하는지 정리한다. 스키마(`004_questioning_thinking_cards.sql`)는 작성 완료.

## 현재 흐름과 바뀔 흐름

```text
지금
⑦ 전체 내용·메모 반영 → material 상태 갱신
⑧ 챗봇에 적용하고 노션에 저장
   └ buildThinkingCard()로 6관점 질문 생성
   └ 근거 있는 것만 behavior.additionalInstructions에 텍스트로 삽입
   └ localStorage 저장 + 노션 준비 DB 저장
   ※ 카드는 저장되지 않고 프롬프트에 녹아 사라진다

바뀔 모습
⑦ 전체 내용·메모 반영 → material 상태 갱신
⑧ 챗봇에 적용하고 노션에 저장
   └ Teacher AI가 카드 8종 생성 (지문 분석 + 웹 리서치 + 메모 해석)
   └ 확인할 것이 있으면 확인 창 (메모 해석 / 리서치 선택)  ← 새로 생김
   └ Supabase에 document + cards 저장, 임베딩 생성
   └ localStorage 저장 + 노션 준비 DB 저장
```

핵심 변화는 **카드가 프롬프트로 소비되지 않고 DB에 남는다**는 것이다.

## 파일별 수정 범위

### 1. `lib/questioning-thinking-card.ts` — 카드 8종으로 확장

지금은 `SimulatedQuestion`(6관점 질문)만 만든다. 다음을 추가한다.

- `ThinkingCardType` = 8종, `SourceType`, `ReasoningType`, `KnowledgeStatus`,
  `SourceReliability` 타입
- `ThinkingCardDraft` — DB 컬럼과 1:1 대응하는 카드 한 장의 형태
- `buildVocabularyCards` / `buildFactCards` / `buildInferenceCards` — 지문에서
  기계적으로 뽑는 카드(로컬, AI 없이)
- `buildDialogueDesignCards(teacherMemo)` — 메모 한 줄 = 카드 한 장
- 기존 `simulateStudentQuestions`는 `expected_question` 카드 생성기로 전환하고,
  `related_card_ids`로 사실·추론 카드를 잇는다

**유지할 것**: 근거는 본문에서만 찾는 규칙(`findEvidence`), 지어내지 않기.
이건 이미 검증된 부분이라 그대로 둔다.

### 2. `lib/gemini/questioning-board.ts` — Teacher AI 카드 생성

지금은 이미지에서 텍스트를 뽑는 용도만 있다. 카드 생성 함수를 추가한다.

- 입력: 지문 전문, 성취기준, 학년, 교사 메모
- 출력: `background` / `research` / `extension` 카드 + 어휘·추론 보강
- 웹 리서치는 Gemini의 검색 기능을 쓰되, **출처(기관·제목·URL·날짜)를 반드시
  받아 `source_reliability`를 매긴다.** 출처가 없으면 카드로 만들지 않는다
- Gemini 키가 없으면 로컬 카드(어휘·사실·추론·예상질문·대화설계)만 만든다.
  키 없는 교사도 쓸 수 있어야 한다

### 3. `lib/questioning-card-store.ts` (신설) — 저장·조회

- `saveDocumentWithCards()` — document + cards + relations 한 번에 저장
- `loadCards(documentId, { enabledOnly })` — 답변에 쓸 카드만
- `updateCardEnabled(cardIds, enabled)` — 확인 창에서 끈 리서치 카드 반영
- `updateDialogueCard(cardId, prompt)` — 교사가 고친 발문 반영
- 서버 전용. 학생 브라우저는 이 표에 직접 접근하지 않는다(RLS + service_role)

### 4. `app/api/questioning-board/cards/route.ts` (신설)

- `POST` — 카드 생성 + 저장. 교사 보드가 ⑧에서 호출
- `PATCH` — 확인 창 결과(끈 카드, 고친 발문) 반영
- 인증: 기존 수업 연결과 같은 방식(수업 코드 + 서버 키)

### 5. `components/questioning/questioning-chatbot-board.tsx` — 확인 창

가장 조심할 부분. 지금 ⑧은 한 번에 끝나는데, 여기에 단계가 끼어든다.

- `handleApplyAndSave`를 둘로 나눈다
  1. 카드 생성 → **확인할 것이 있으면** 확인 창을 띄우고 멈춤
  2. [승인하고 적용] → 저장·적용 진행
- 확인할 것이 없으면(메모 없음 + 리서치 없음) **지금처럼 한 번에 끝낸다**
- 확인 창 내용: 메모 해석 문장(수정 가능) + 리서치 목록(A·B 기본 체크,
  C·D·근거부족 기본 해제) + 자동 카드 개수 한 줄
- 직전 선택을 기억해 재실행 시 다시 체크하지 않게 한다

**제거할 것**: `applyThinkingCardToBehavior`가 카드를 프롬프트 텍스트로 밀어 넣는
경로. 카드가 DB에 남으므로 필요 없다. 다만 **학생 응답 검색이 붙기 전까지는
과도기로 남겨 둔다** — 지금 지우면 챗봇이 카드를 전혀 못 쓰게 된다.

### 6. 학생 응답 경로 (다음 단계)

`app/api/questioning-board/chat/route.ts`와 `lib/questioning-board.ts`의 로컬
엔진에 카드 검색을 붙이는 일. **이번 범위에 넣지 않는다.** 카드가 쌓이는 것을
먼저 확인한 뒤 검색·랭킹·충분성 판정을 얹는 것이 안전하다.

## 순서와 검증

| 단계 | 내용 | 검증 방법 |
| --- | --- | --- |
| ~~1~~ | ~~카드 8종 타입 + 로컬 카드 생성기~~ | 완료 — `lib/questioning-cards.ts` |
| ~~2~~ | ~~저장·조회 계층~~ | 완료 — `lib/questioning-card-store.ts`. 컬럼을 004와 기계 대조 |
| ~~3~~ | ~~API 라우트~~ | 완료 — `app/api/questioning-board/cards/`. dev 실기로 400 경로 확인 |
| ~~4~~ | ~~확인 창~~ | 완료 — Chrome 실기 3경로 통과 |
| ~~5~~ | ~~Teacher AI 리서치~~ | 완료(단위 검증) — `lib/gemini/questioning-cards.ts`. **실키 호출은 미검증** |
| 6 | 학생 응답 검색 | 별도 작업 |

## 위험과 대비

- **⑧이 느려진다.** 카드 생성에 Gemini 호출과 리서치가 들어가면 수 초가 걸린다.
  버튼에 진행 표시를 넣고, 로컬 카드는 즉시 만들어 먼저 보여 준다.
- **확인 창이 매번 뜨면 처음 문제로 돌아간다.** 뜨는 조건을 좁게 유지한다.
- **pgvector를 못 쓸 수 있다.** 004는 pgvector에 의존하지 않게 만들었다. 임베딩은
  `embedding_json`에 저장하고 앱에서 코사인 유사도를 계산한다. 지문당 카드가 수십
  개라 충분히 빠르다. 벡터 열은 필요해질 때 005로 덧붙인다.
- **마이그레이션 003이 아직 적용되지 않은 환경이 있다.** 004는 003의
  `questioning_lesson_connections`를 참조하므로 적용 순서를 지켜야 한다.

---

## 진행 상황 (2026-08-25)

1~5단계 모두 코드로 들어갔다. **6단계(학생 응답에 카드 검색 붙이기)만 남았다.**

아직 확인하지 못한 두 가지:
- ~~004 마이그레이션 적용~~ **2026-08-25 적용 완료.** 표 5개 확인. 005(pgvector)는
  아직 필요 없어 미적용. 다만 **보드 ⑧에서 카드가 실제로 저장되는지는 아직 확인 전.**
- **실제 Gemini 키로 검색 호출을 해 보지 못했다.** `groundingChunks`가 파싱하는 모양과
  같은지 실키 응답을 봐야 안다.

그때까지 ⑧은 카드 API가 실패하면 조용히 이전 방식(프롬프트에 카드 삽입)으로 진행한다.
보드는 지금 그대로 쓸 수 있다.
