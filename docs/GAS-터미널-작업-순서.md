# GAS 챗봇 — Codex와 Claude Code가 같이 고치는 방법과 터미널 작업 순서 · 2026-09-05

한 줄 요약: **채팅에 파일을 붙여 넣지 않는다. 저장소 `gas/`가 유일한 원본이고, `clasp`로 배포하며, `node evals/gas/run.mjs`가 심판이다.** 파일 소유와 함수 서명은 `gas/CONTRACT.md`에 있다.

## 1. 왜 이렇게 하나

Codex는 Apps Script 편집기에서, Claude Code는 채팅으로 받은 사본으로 일하면 둘이 다른 코드를 고친다. 원본을 저장소로 옮기면 세 가지가 한 번에 풀린다.

| 문제 | 저장소 `gas/` + clasp |
| --- | --- |
| 누가 최신인지 모름 | `git log`가 답 |
| 같은 함수를 둘이 고침 | `CONTRACT.md`의 파일 소유표 + 한 번에 한 PR |
| 고친 뒤 깨졌는지 모름 | `evals/gas/run.mjs` — 푸시 전 초록 |

## 2. 역할

| | Codex | Claude Code |
| --- | --- | --- |
| 잘하는 것 | Apps Script 실행·배포·시트 조작이 그 자리에서 됨 | 저장소 TypeScript 원본과 49회기 회귀 세트, Node 테스트 |
| 소유 | 기존 런타임 `.gs`, `Client`·`Teacher`·`Dashboard`·`Styles` | `Phase.gs`, `Signals.gs`, `evals/gas/`, `docs/` |
| 접점 | `submitTurn()` 안 세 줄을 끼움 | 그 세 줄의 사양 (`CONTRACT.md` 4절) |
| 경량화 | 구현 (시트를 직접 돌려 봄) | 검토 + 회귀 확인 |

## 3. 터미널 작업 순서 — 로컬 Claude Code에서

### 0단계. 원본 수집 (한 번)

```bash
git clone https://github.com/gomgomeet/newscomment-ai.git && cd newscomment-ai
git checkout claude/chatbot-script-improvements-h4ehmu
npm i -g @google/clasp
clasp login                       # 브라우저에서 구글 로그인
cd gas
clasp clone 1NsCmz9QvZqQRBbUP3w2c8hIzZ-9vSEpaQwmi15F0dTUddn3rrh9phZpH
# 이미 있는 Code.gs·Index.html은 덮어써도 된다
cd ..
node evals/gas/run.mjs            # load … PASS 가 파일 수만큼 나와야 한다
git add gas && git commit -m "GAS 원본 전체 수집" && git push
```

`.clasp.json`은 커밋한다(스크립트 ID뿐). `~/.clasprc.json`은 `.gitignore`에 있다.

### 1단계. 시트에서 바로 (코드 없이, 30분)

`docs/GAS-챗봇-경량화-2국면-실행계획.md` 0단계. 옛 카드·시나리오 비활성, 캡션 구간 비활성, 별명 끄기, 토큰 1500, 검토 큐 정리.

### 2단계. Claude Code — 계약과 심판 (이 PR에 이미 있음)

- `gas/CONTRACT.md` — 시트·열, 함수 서명, `[지금 할 일]` 형식, 원칙
- `evals/gas/run.mjs` + `fixtures/phase-cases.json` — 2국면 점검 6종, 후처리 3종, 관련 질문 판정 5종. `Phase.gs`가 없으면 SKIP, 있으면 PASS/FAIL
- `npm run eval:gas`

### 3단계. Codex — 경량화 (반나절)

Codex에게 줄 지시문 (코드 확인 뒤 파일별로 구체화한 판):

```
gas/CONTRACT.md 와 docs/구글시트-챗봇-경량화-제안.md 를 먼저 읽어. 한 PR로, 순서대로.
1. Maintenance.js를 clasp push 하고 Apps Script 편집기에서 phase0Cleanup() → 로그 확인 → phase0Cleanup(true) 실행. (0단계)
2. AIService.js: enrichStudentAnalysisWithAI_ 호출을 Code.js submitTurn에서 빼고 ruleAnalysis를 그대로 analysis로 쓴다.
   selectAIModel_·routingMode·fastModel 제거, 모델은 CONFIG.AI_MODEL 하나. composeResponseWithAI_ 지시문의
   "정답을 바로 공개하지 말고"를 "학생이 물은 것에는 승인 근거로 먼저 답하고"로 바꾼다.
   근거 위치("자료 구간 N")는 프롬프트에 넣지 말고, usedEvidenceIds로 코드가 붙인다(renderAIUsedEvidence_).
3. EvidenceEngine.js analyzeStudentTurn_: '?'로 ask_fact를 잡기 전에 greeting(안녕·하이·고마워), small_talk(지문 낱말이 하나도 없는 잡담),
   repair(왜 자꾸 물어봐·그냥 설명만), safety(이름·전화·대필 요청) 갈래를 앞에 둔다. contentWords_(material.text)로 관련 여부를 판정한다.
4. DialoguePolicy.js selectNextMove_: ask_fact → primaryMove 'answer'(hintLevel 0, 되묻기 없음). check_evidence는 attempt_answer·give_evidence만.
   greeting·small_talk·repair는 'receive', safety는 'safety_redirect'. shouldQueueReview_는 관련 질문만 큐에 넣는다.
5. CardGenerator.js·ResearchMode.js·EvaluationSuite.js·OperationalReadiness.js 시트 기록·ClassroomLoadTest.js·LoadTestPanel.html 제거.
   RetrievalEngine.js 캐시(getRetrievalCorpus_의 CacheService) 제거 — 자료가 작아 매번 읽는다.
6. SheetService.js: SESSIONS·RETRIEVAL_LOG·BOARD·READINESS·EVALUATION_LOG·GENERATION_LOG·SOURCE_LIBRARY 쓰기 제거,
   TURNS·KNOWLEDGE·REVIEW_QUEUE·CONFIG 열을 CONTRACT 3절대로. BOARD 시나리오는 TestRunner.js runSmokeTests()로 옮긴다.
7. Code.js getBootstrapData: 별명 입력을 반-번호 입력으로. studentCode='3-12', sessionId는 materialId+studentCode로 만들어 새로고침해도 같은 세션.
Phase.js·Signals.js·Maintenance.js·evals/gas/ 는 만지지 마. 푸시 전에 node evals/gas/run.mjs 초록 확인, clasp push 뒤 runSmokeTests().
```

### 3단계 검토 결과 (2026-09-05, 커밋 `a884573`)

**잘 된 것** — 지시문 7항목 중 6개가 그대로 들어갔다.

| 항목 | 확인 |
| --- | --- |
| 분석 AI 호출 제거, 조립 한 번 | `submitTurn`이 `analyzeStudentTurn_` 결과를 바로 쓴다. `enrichStudentAnalysisWithAI_`·`selectAIModel_` 삭제 |
| 모델 하나 | `CONFIG.AI_MODEL`, 토큰 기본 1500 |
| 답 먼저 | `ask_fact → 'answer'`, `check_evidence`는 `attempt_answer`·`give_evidence`만. 조립 지시문 "승인 근거로 먼저 답하고", 사실·낱말 질문의 되묻기는 코드가 걷음 |
| 위치는 코드가 | 프롬프트에서 위치 제거(`stripEvidenceLocations_`), `evidenceLocation_`이 `chunkOrder`로 "근거: 자료 구간 N"을 붙임 |
| 시트·열 | 9장(`CONFIG` `MATERIALS` `CHUNKS` `VOCABULARY_LIBRARY` `KNOWLEDGE` `CARDS` `TURNS` `REVIEW_QUEUE` `DASHBOARD`), `TURNS` 18열에 `phase`·`managedKind`·`responseScore`·`relatedQuestion`·`isPreview` 포함. 캐시·카드 생성·외부 자료·부하 테스트·평가·준비도 시트 삭제(−3,305줄) |
| 반-번호 세션 | `sessionId = materialId:반-번호`, 새로고침하면 이전 대화 복원, 마친 대화는 잠금. 이름 입력칸 제거 |
| 검토 큐 | `relatedQuestion`인 사실·낱말 질문만 |
| 심판 | `npm run eval:gas` PASS 31 · `eval:gas:parity` 207턴 불일치 0 · `scripts/test-gas-lightweight.cjs` 전부 PASS. `Phase.js`·`Signals.js`·`evals/gas/` 미변경 |

**막아야 할 것 — `analyzeStudentTurn_`의 `small_talk`·`safety` 판정이 너무 넓다.** 49회기 207턴에 새 분류기를 돌리면:

| 분류 | 건수 | 잘못 잡힌 예 |
| --- | --- | --- |
| `small_talk` | **92 (44%)** | "제목 보고 학생들이 급식을 더 많이 먹은 줄 알았어요." · "먹을 만큼 골라서 그런 것 같아요." · "결과요." · **"없어요."**(B1 답) · "왜 그렇게 됐어요?" |
| `safety` | 4 | "원인은 선택 배식**입니다**" · "교실 전화번호를 알려 두는 방법도 있네요."(기사 내용) |

원인: `!passageEcho`(지문 낱말이 하나도 없음)면 무조건 `small_talk`. 학생의 **답**(2국면 의견·예측·"없어요")은 지문 낱말이 없는 게 정상이라 전부 잡힌다. 그러면 5단계에서 2국면 답마다 "이 활동에서는 지문에 나온 내용으로 함께 이야기해요."가 나가고 점수도 안 매겨진다. `safety`는 `[가-힣]{2,4}입니다`와 맨 `이름|전화`가 문제.

같은 207턴에 아래 규칙을 적용하면 `small_talk` 23(모두 질문), `safety` 2(실제 개인정보)로 준다.

**Codex 보완 지시문 (3단계 마무리, 작은 PR 하나)**

```
gas/EvidenceEngine.js analyzeStudentTurn_ 만 고쳐. 순서:
1. safety: 명시적 표현만 — /((?:내|제)\s*이름은|전화번호는|연락처는|주민번호|비밀번호|대필|대신\s*써|숙제\s*해\s*줘|정답\s*알려\s*줘)/.
   `[가-힣]{2,4}입니다`와 맨 `이름|전화`는 뺀다.
2. repair, greeting: 지금 그대로.
3. small_talk: '질문'이면서 지문과 무관할 때만 — isStudentQuestion(message) && !isPassageRelatedQuestion(message, phaseSettingsFor_(material)).
   (Signals.js 공개 함수. 질문이 아닌 발화는 small_talk로 두지 않는다 — 2국면 답이다.)
4. 나머지는 기존 순서(close → hint → ask_definition → revise → ask_fact → attempt_answer/give_evidence).
5. relatedQuestion = isPassageRelatedQuestion(message, settings) && ['ask_fact','ask_definition'].indexOf(studentMove) >= 0
   ("왜 그렇게 됐어요?"처럼 지시어만 있는 까닭 질문도 관련 질문으로 센다.)
scripts/test-gas-lightweight.cjs 의 분기 케이스에 "없어요."→attempt_answer, "원인은 선택 배식입니다"→attempt_answer,
"제목 보고 더 먹은 줄 알았어요."→attempt_answer, "점심 뭐 먹어요?"→small_talk 를 더한다.
푸시 전 npm run eval:gas · eval:gas:parity · node scripts/test-gas-lightweight.cjs.
```

**작은 것 (5단계에 같이)**

- `getBootstrapData`가 `isPreview: false`를 고정한다. 교사 미리보기(`99-999` 같은 예약 번호)는 `isPreview: true`로 적어 `DASHBOARD`에서 빠지게.
- `ResponseRenderer`가 답 끝에 `\n근거: 자료 구간 N`을 붙인다. 좋다. 다만 `enforceManagedQuestion`이 물음표 문장을 걷을 때 이 줄은 남도록, 5단계에서 근거 줄은 **후처리 뒤에** 붙인다.

**보완 확인 (커밋 `744b531`)** — 지시문대로 들어갔다. 207턴 분류: `small_talk` 92 → **28**(모두 질문, "근데 왜 줄었어요?"처럼 앞 턴에 기대는 후속 질문), `safety` 4 → **1**(실제 개인정보). "없어요"·"결과요"·"원인은 선택 배식입니다" → `attempt_answer`, "왜 그렇게 됐어요?" → `ask_fact`(관련 질문). 교사 미리보기 `99-*` → `isPreview`, "근거:" 줄은 후처리 뒤에. 심판 셋 초록. 남은 잔가지 하나: 후속 질문 28건이 규칙 응답("이 활동에서는 지문에 나온 내용으로…")을 받는다 — 6단계 실제 발화에서 거슬리면 "앞 턴이 관련 질문이면 이번 질문도 관련으로 본다" 한 줄로 줄일 수 있다.

### 4단계. Claude Code — `Phase.js`·`Signals.js` (완료 · 2026-09-05)

`gas/Phase.js`·`gas/Signals.js`로 이식했다. `npm run eval:gas` PASS 35 · SKIP 0. `npm run eval:gas:parity`가 웹앱 원본(TS)과 GAS 이식본을 49회기 207턴에서 턴마다 견줘 국면·질문 종류·질문 문구·집계 불일치 0. (`scripts/run-questioning-dialogue-eval.mjs`는 Next 서버가 있어야 돌아 여기서는 대신 parity로 확인한다.)

### 5단계. Codex — 접점 세 줄 끼우기 (한 시간)

```
gas/CONTRACT.md 4절의 세 줄을 submitTurn()에 끼워. composeResponseWithAI_에 taskLine을 받아
조립 프롬프트 마지막 user 파트 앞에 붙이고, 카드·규칙 응답 경로도 enforceManagedQuestion을 거치게 해.
봇 appendTurn_에 phase·managedKind·responseScore·relatedQuestion을 적어. clasp push 전에 npm run eval:gas.
```

### 5단계 검증 결과 (2026-09-05, head `bdcc7b2`)

`npm run eval:gas:e2e` — 가짜 SpreadsheetApp 위에서 **공개 진입점 `submitTurn()`** 을 실제 자료(급식 잔반 기사 + 승인 어휘 4개)로 끝까지 돌린다. AI는 끄고 규칙·카드 경로로 본다(AI 경로 후처리는 Codex 통합 테스트가 본다).

| 검사 | 결과 |
| --- | --- |
| ① 관련 질문 4개 → 4번째 답 끝에 이해(중) 질문 정확히 한 번, 1국면 세 답은 되묻기 0, TURNS에 phase=2·managedKind·relatedQuestion | PASS |
| ② 3턴 딴소리 → B1 한 번 · ③ "없어요" → B2 → 다음 턴 이해(중), B2 반복 없음 | PASS |
| ④ "왜 자꾸 물어봐요" 물음표 0 · ⑤ "그만할래요" 종료·물음표 0 · 마친 대화 재전송 차단 · 새로고침 복원 | PASS |
| ⑥ 이해(중)→후속→표적→의견→끝, 의견 답 뒤 질문 0, responseScore 0~5 기록, DASHBOARD 집계(관련 질문 4·응답 점수) | PASS |
| ⑦ "왜 그렇게 됐어요?" 종료 아님·관련 질문·답 먼저 · ⑧ 낱말 뜻은 승인 어휘로 · ⑨ 인사는 인사로, 검토 큐 제외 · ⑩ 이름은 시트에 `[이름 가림]` · 대필 요청 안전 안내 | PASS |
| ⑪ 30명 × 2턴 → TURNS 120행, 세션마다 4행 · 교사 미리보기 99-* isPreview | PASS |

**6단계에서 실제 발화로 볼 잔가지 (막지 않음, Codex 몫)**

1. **바꿔 말한 지문 질문이 딴소리로 잡힌다.** "한 달 뒤에 얼마나 줄었어요?"는 지문에 "줄었다"가 있는데 어형이 달라 `small_talk` → "이 활동에서는 지문에 나온 내용으로…". 207턴에서 질문의 내용 낱말 **앞 두 글자**가 지문 낱말과 같으면 관련으로 보는 규칙을 더하면 small_talk 28 → 22, 구제되는 6건이 모두 진짜 지문 질문("근데 왜 줄었어요?", "공회전이 뭐예요?", "상관관계랑 인과관계는 뭐가 달라요?"). `EvidenceEngine.js`에 한 줄: `small_talk`는 `!related && !stemEcho`일 때만.
2. **지시어만 있는 까닭 질문은 검색이 비어 "답을 확인하기 어려워요"가 나간다.** "왜 그렇게 됐어요?"에 내용 낱말이 없어서다. `submitTurn`에서 질문에 내용 낱말이 없으면 **직전 관련 질문의 낱말을 검색어에 보탠다**(AI 분석의 rewrittenQuery가 하던 일을 규칙으로).
3. **B1·B2 턴의 바탕 문장이 어색하다.** "없어요"에 규칙 응답 "승인된 자료에서 바로 연결되는 근거를 찾지 못했어요. 지문의 어느 부분을…"이 먼저 나오고 B2가 붙는다. `decision.kind`가 `b1`·`b2`면 바탕 문장을 "알겠어요."로 줄인다(`ResponseRenderer` 또는 `submitTurn`).
4. 규칙 경로는 같은 질문에 같은 답을 낸다(AI 경로만 달라짐). 연수 시연은 AI를 켠 채 하므로 그대로 둔다.

### 6단계. 검증·배포 (두 시간)

점검 발화 18개(`scripts/check-standalone-chatbot.mjs`의 목록)를 교사 미리보기로 치고 `TURNS`를 읽는다. 30탭 동시 전송. 템플릿 시트 사본과 교사 절차.

## 4. 번갈아, 겹치지 않게

```
Codex 0단계 → Claude 2단계(완료) → Codex 3단계 → Claude 4단계 → Codex 5단계 → 둘이 6단계
```

한 번에 한 쪽만 `gas/`의 기존 파일을 고친다. Codex가 PR을 올리면 Claude Code가 검토하고 다음 사양을 `docs/`에 남긴다. PR은 작게, 자주.

## 5. clasp를 쓸 수 없을 때

학교 PC 제한으로 `clasp login`이 안 되면, Codex가 파일 전체를 GitHub 웹에서 `gas/`에 업로드한다. 채팅 붙여넣기는 마지막 수단이다 — 파일이 나뉘어 오면 이어 붙이다 한 줄이 빠진다.

### 6단계 결과 (Codex, 커밋 `9984741` · 2026-09-05)

Codex가 배포(버전 18)·실제 AI 발화 15개·공개 웹앱 30탭·교사 템플릿까지 마쳤다. 기록은 저장소 루트 `GAS-6단계-검증-배포.md`(→ `docs/`로 옮길 것). 요지:

| 검사 | 결과 |
| --- | --- |
| 실제 Apps Script 스모크 | 32 PASS |
| 실제 AI 순차 발화 15개 | 응답·TURNS 일치, 미리보기 표시, 숫자 항목 정상 |
| 공개 웹앱 30탭 동시 전송 | 30/30 답변, 30쌍 저장, AI 성공 30, 누락 0, 브라우저 오류 0 |
| **30탭 응답 시간** | **중앙값 약 22초, p95 41초, 최대 42초** |
| 학생 화면 | 반-번호 필수, 새로고침 복원, 390px 가로 넘침 없음 |
| 교사 템플릿 | 빈 시트 + 독립 스크립트 21파일, 기록·키·주소 없음 |

6단계에서 Codex가 고친 것: 띄어쓰기 있는 승인 낱말 검색, 지시어 이어 묻기의 검색 맥락(직전 질문을 검색에만 보탬), 제목 수치 질문, 소수점 보존, "몰라요" 도움 요청, 대필·개인정보 안내 분리, 모델이 관리 질문을 복사하지 않게 하는 지시.

**Claude 쪽 후속 (커밋 이 문서와 함께)** — 잔가지 1·집계 불일치를 내 파일에서 풀었다.
- `Signals.js` `settings.stemMatch`: 어형이 바뀐 낱말("줄었어요"~"줄었다")도 앞 두 글자가 같으면 관련. `phaseSettingsFor_`가 켠다(웹앱 원본과의 동일성 검사는 끈 채 돌아 불일치 0 유지). 207턴 `small_talk` 28 → **22**.
- `Phase.js` `decidePhase(history, message, settings, options)`: 지난 턴은 `TURNS.relatedQuestion` 열을 그대로 세고, 이번 턴은 `options.currentRelated`(런타임 분류기의 판정)를 받는다. Codex가 지적한 "검색은 관련으로 보는데 국면 집계는 아니라서 B1이 붙는" 어긋남이 여기서 닫힌다.

**Codex 한 줄 (다음 PR)** — `Code.js submitTurn`의 호출을 `decidePhase(history, safeMessage, phaseSettingsFor_(material), { currentRelated: analysis.relatedQuestion })`로. 이 한 줄이 들어가야 지시어 이어 묻기·제목 수치 질문이 국면 집계에도 반영된다. 그리고 `GAS-6단계-검증-배포.md`를 `docs/`로.

**남은 관찰 — 응답 시간.** 30명이 동시에 보내면 중앙값 22초, p95 41초다. 교실에서는 길다. 손볼 곳 순서: ① `AIService`의 `reasoningEffort: 'low'`를 `'minimal'`로(구조화 출력만 필요) ② 조립 프롬프트의 최근 대화 6턴 → 4턴, 근거 3 → 2 ③ 수업 운영에서 "한 번에 다 보내기"를 피하고 자기 속도로 보내게 함(실제 수업은 동시에 30명이 누르지 않는다) ④ 그래도 길면 `AI_MODEL`을 더 빠른 모델로. 규칙 경로(AI 꺼짐)는 1초 안팎이므로 시연 전에 AI 응답 시간을 한 번 재 본다.

### 머지 뒤 후속 (PR #55 병합 다음 · 2026-09-05)

`main`에서 새로 낸 작은 PR. 6단계에서 남긴 둘을 닫고 응답 시간의 첫 손잡이를 돌렸다.

- `Code.js`: `decidePhase(…, { currentRelated: analysis.relatedQuestion })` — 지시어 이어 묻기·제목 수치 질문이 국면 집계에도 들어간다. e2e ⑬으로 확인(잔반이 뭐예요? → "이 글에서는 어떤 뜻이야" → 2개 더 → 4번째에 2국면).
- `AIService.js`: 추론 강도를 `CONFIG.AI_REASONING_EFFORT`로(기본 **minimal**, 전에는 코드에 `low` 고정), 최근 대화 기본 6 → **4턴**. 조립은 구조화 출력 한 번이라 최소 추론이면 충분하다. **실측은 아직이다** — 이 환경엔 API 키가 없다. 기존 시트는 CONFIG 값이 남아 있으므로 `AI_REASONING_EFFORT` 행을 넣거나 `AI_MAX_HISTORY_TURNS`를 4로 바꿔야 적용된다. 교사 미리보기 99-*로 30탭을 다시 돌려 중앙값·p95를 견준다(`scripts/check-gas-browser.cjs`, 예약 번호는 99-631부터).
- `GAS-6단계-검증-배포.md` → `docs/`.
