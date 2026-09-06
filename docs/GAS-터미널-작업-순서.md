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

### 7단계. 배포·설정·실측 — 내일 PC 터미널의 Claude Code에서 (한 시간)

웹 세션(claude.ai/code)에서는 할 수 없다. `clasp` 로그인 토큰이 없고, 그 환경의 네트워크가 `script.google.com`을 막는다. Codex가 쓰던 PC 터미널에서 `claude`를 띄우고 이 절을 가리키면 된다: **"docs/GAS-터미널-작업-순서.md 7단계를 진행해."**

미리 해 둔 것: `Maintenance.js`의 `phase0CleanupApply()`가 이제 `AI_REASONING_EFFORT=minimal`·`AI_MAX_HISTORY_TURNS=4`도 맞춘다. 없는 키는 행을 새로 넣는다(e2e ⑭). 시트 셀을 손으로 고칠 일이 없다.

```bash
git checkout main && git pull origin main
npm run eval:gas && npm run eval:gas:parity && npm run eval:gas:e2e && node scripts/test-gas-lightweight.cjs   # 31 · 불일치 0 · 24 · 36
cd gas && clasp push && cd ..                    # "Login expired"면 clasp login 먼저
```

1. **배포.** Apps Script 편집기 → 배포 → 배포 관리 → 새 버전. 배포 URL은 그대로다.
2. **설정.** 편집기에서 `phase0CleanupPreview()` 실행 → 로그에서 `CONFIG 변경: n개, 추가: m개` 확인 → `phase0CleanupApply()` 실행. 시트 `CONFIG`에서 두 키가 `minimal`·`4`인지 본다.
3. **실측.** 예약 번호는 99-631부터(99-601~630은 6단계에서 썼다).
   ```bash
   GAS_WEB_APP_URL=https://script.google.com/macros/s/…/exec node scripts/check-gas-browser.cjs
   ```
   아래 표에 적는다. 6단계와 같은 조건(30탭 동시)이어야 견줄 수 있다.

   | 조건 | 중앙값 | p95 | 답변·저장 | 브라우저 오류 |
   | --- | --- | --- | --- | --- |
   | 6단계(low · 6턴 · 근거 3) | 22초 | 41초 | 30/30 | 0 |
   | 7단계 ① (minimal · 4턴 · 근거 3) · 버전 20 | 20.9초 | 37.6초 | 30/30 답변·저장, **AI 성공 0/30** | 0 |
   | 7단계 ② (low · 4턴 · 근거 3) · 버전 22 | 24.4초 | 40.2초 | 29/30 답변·저장, AI 성공 29/29 · 1탭 잠금 시간초과 | 0 |
   | 8단계 (low · 4턴 · 잠금 구간 축소) · 버전 23 | **18.9초** | **28.5초** | 30/30 답변·저장, AI 성공 30/30 | 0 |
   | 8단계 ② (기록 커서 · 잠금 안은 추가된 행만) · 버전 24 | **16.8초** | **28.0초** | 30/30 답변·저장, AI 성공 30/30 | 0 |

4. **그래도 길면** 순서대로 하나씩: `MAX_RETRIEVAL_RESULTS` 3 → 2 → 다시 실측 → `AI_MODEL`을 더 빠른 모델로. 한 번에 둘을 바꾸면 무엇이 효과였는지 모른다.
5. **끝나면** 표를 채운 커밋을 `main`에서 새 브랜치로 올린다. 학생 발화·배포 URL·키는 PR에 넣지 않는다.

완료 조건: 30/30 답변·저장, 오류 0, 중앙값이 6단계보다 짧다. 중앙값 10초 안팎이면 수업에서 쓸 만하다.

### 7단계 결과 (2026-09-06 · PC 터미널의 Claude Code · 배포 버전 20 → 21 → 22)

**한 줄.** 30탭을 두 번 돌렸다. 추론 강도 `minimal`은 **gpt-5.6-terra가 HTTP 400으로 거부**해 AI 조립이 전부 규칙 응답으로 물러났고, `low`로 되돌리자 AI 29/29가 성공했다. 응답 시간은 4턴으로 줄여도 6단계와 같다(중앙값 24초·p95 40초). 추론 강도·대화 길이는 병목이 아니다.

| 순서 | 한 것 | 결과 |
| --- | --- | --- |
| 배포 | `clasp push` → 배포 관리에 새 버전 **20** (PR #57 Maintenance.js) | 배포 주소 그대로 |
| 설정 | 편집기에서 `phase0CleanupPreview()` → `phase0CleanupApply()` | CONFIG 변경 1(6→4)·추가 2(`AI_REASONING_EFFORT=minimal`, `ASK_NICKNAME`), 카드·청크·검토 큐 0 |
| 실측 ① | 99-631~660, 30탭 동시 | 30/30 답변·저장, 오류 0, 중앙값 20.9초·p95 37.6초 — 그런데 **`TURNS.aiStatus`가 30개 모두 `compose:compose_fallback`**. 답은 규칙 경로("학생들은 NON-GMO 국산 재료로 고추장을 직접 만들었다.") |
| 진단 | 익명 웹앱 실행은 `console.warn`이 실행 목록에 안 보여서, 물러난 까닭을 `TURNS.decisionReason`에 ` · ai:…`로 남기게 고침 → 버전 **21** → 99-661 한 탭 | `OpenAI API 오류 HTTP 400: Unsupported value: 'minimal' is not supported with the 'gpt-5.6-terra' model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh'` |
| 복구 | `normalizeReasoningEffort_`: `minimal`→`low` 별칭, 허용 목록에서 `minimal` 제거, 기본 `low`. `callOpenAIJson_`: 모델이 추론 강도를 거부하면 한 번만 `low`로 재시도. `LIGHT_CONFIG_DEFAULTS_`·`phase0Cleanup` 기본도 `low`. e2e ⑭ 갱신 → 버전 **22** | 심판 넷 초록(31 · 207턴 불일치 0 · 24 · 36) |
| 실측 ② | 99-671~700, 30탭 동시 (교사가 같은 시각에 수동 실증 중) | 29/30 답변·저장, **AI 성공 29/29**, 브라우저 오류 0. 중앙값 24.4초·p95 40.2초·최소 7.6초. **1탭(99-681)은 "잠금 시간초과" 예외**로 답이 없고 TURNS 행도 0(발화·답변이 따로 남지는 않음) |

**읽는 법.**

- 실측 ①의 20.9초는 AI를 부르지 않은 시간이다. 실측 ②(AI 켜짐)와 6단계(22초·41초)가 같으므로 **30탭 동시의 시간은 AI 호출이 아니라 시트 잠금 직렬화**가 만든다. 혼자 보낼 때는 7~8초(AI 5~6초 + 시트). 다음 손잡이는 `MAX_RETRIEVAL_RESULTS`가 아니라 잠금 안에서 하는 일(`appendConversationTurns_`의 읽기·쓰기)을 줄이는 것과, "한 번에 다 보내기"를 피하는 수업 운영이다. 잠금 시간초과가 학생 화면에 `Exception: …`으로 그대로 보이는 것도 다듬을 일(Codex 몫).
- CONFIG 시트에는 `AI_REASONING_EFFORT=minimal`이 남아 있어도 코드가 `low`로 읽는다. `phase0CleanupApply()`를 다시 돌리면 `low`로 바뀐다. `none`(모델이 받는 최솟값)은 품질을 안 봤으므로 별도 단계로 한 번에 하나만 바꿔 재고, 바꾸면 `TURNS.aiStatus`가 `compose:ok`인지 먼저 센다.
- 교사가 시트 메뉴 "관리. 경량화 시트 전환(백업 포함)"을 한 번 더 눌러 백업 사본이 하나 더 생겼고 CONFIG가 `LIGHT_CONFIG_DEFAULTS_` 14키로 재배열됐다(값 유지). 이때 `ASK_NICKNAME` 행이 사라지는데 코드가 안 쓰는 키라 문제없고, `phase0Cleanup`의 목록에서도 뺐다.
- 예약 번호는 99-601~700을 썼다. 다음 실측은 **99-701부터**.
- 시트를 UI 없이 읽는 법: Chrome에서 `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:html&sheet=TURNS&headers=1&tq=select …`. `clasp run`·`clasp logs`는 GCP 프로젝트가 없어 안 된다.

**교사 실증 관찰 — "생각·근거·다듬기에 편향된다".** 같은 시각(오전 9:47~9:54) 교사가 1-20으로 실증한 8턴이 모두 `compose:compose_fallback`이었다. AI가 꺼진 규칙 경로는 `attempt_answer`에 `check_evidence`("그렇게 생각한 근거를 지문의 어느 부분에서 찾았나요?")를, 나머지에 `receive`("근거를 더해 생각을 표현했군요…")를 내고, 2국면 관리 질문(이해→까닭→의견)이 매 턴 붙는다. 답 부분이 비어 질문만 연달아 보이므로 편향으로 느껴진다. **버전 22에서 AI가 돌아왔으니 먼저 다시 실증한다.** 그래도 남으면 손볼 순서:

1. `Phase.js` — 관리 질문을 매 턴이 아니라 **학생 답 뒤 한 턴은 비워** 두기(관리 질문 사이에 자유 턴 1개), 세션당 관리 질문 상한(예 3개). 웹앱 원본과의 parity 검사는 설정으로 끈 채 확인.
2. `ResponseRenderer.js` — 규칙 경로의 `check_evidence`·`receive` 바탕 문장을 "알겠어요." 수준으로 짧게(6단계 잔가지 3번과 같은 자리). AI가 꺼져도 되묻기 문장이 매 턴 나가지 않게.
3. `AIService.js` 조립 지시문 — "학생의 시도를 짧게 관찰하고 … 다음에 할 행동 한 가지"가 다듬기 쪽으로 기울면 "학생이 답했으면 맞는 부분을 먼저 확인해 주고 끝낸다"로 바꾼다.

### 8단계. 잠금 구간 축소 (2026-09-06 · 배포 버전 23 · 브랜치 `claude/gas-stage8-lock-window`)

7단계 결과의 다음 손잡이를 바로 돌렸다. `appendConversationTurns_`가 잠금 안에서 하던 일을 줄였다.

| 전 | 후 |
| --- | --- |
| 잠금 → TURNS **전체 18열**을 객체로 읽어(`getSessionTurns_`) 마지막 턴 번호 계산 → 헤더 읽기 → 행 조립 → 쓰기 → flush | 헤더 읽기·행 조립은 **잠금 밖** → 잠금 → `sessionId`·`turnNo` **두 열만** 읽어 마지막 턴 번호(`lastTurnNoForSession_`) → 두 행 한 번에 쓰기 → flush |
| `waitLock(30000)` 실패 시 `Exception: 잠금 시간초과…`가 학생 화면에 그대로 | `tryLock(30000)` 실패 시 "지금 친구들이 한꺼번에 보내고 있어요. 잠시 뒤 다시 보내 주세요." (학생이 쓴 글은 입력칸에 남는다) |

30탭(99-701~730) 결과: **30/30 답변·저장, AI 30/30, 오류 0, 중앙값 18.9초·p95 28.5초·최대 29.0초·최소 7.5초.** 7단계 ②(24.4초·40.2초·잠금 시간초과 1)에서 중앙값 23%, p95 29% 줄었고 잠금 시간초과가 사라졌다. 혼자 보낼 때 7~8초는 그대로다(AI 5~6초 + 시트).

**아직 남은 시간은 어디서 오나.** 30명 동시에 최소 7.5초 → 최대 29초로 여전히 선형으로 늘어난다. 잠금 안에 남은 것은 두 열 읽기 + 두 행 쓰기 + flush(약 0.5~0.7초). 그다음 손잡이는 ① `getSessionTurns_`(잠금 밖이지만 요청마다 TURNS 전체 읽기 — 세션 열로 먼저 걸러 두 열만 읽는 같은 방법) ② `upsertReviewItem_`도 같은 방식(검토 큐가 커지면 잠금 안 전체 읽기) ③ TURNS가 수업마다 쌓이므로 학기 단위로 보관 시트로 옮기기 ④ 수업 운영에서 "한 번에 다 보내기"를 피하기. 중앙값 10초 안팎이 목표라면 ①·③으로 한 번 더 재고, 그래도 길면 AI 호출 자체(5~6초)를 줄이는 `none` 실험을 별도 단계로.

심판: `eval:gas` 31 · parity 207턴 불일치 0 · `e2e` 24 · 통합 36 (가짜 LockService에 `tryLock` 추가).

**8단계 ② — 기록 커서 (버전 24).** 잠금 안의 "두 열 전체 읽기"도 없앴다. `submitTurn`이 요청 시작 때 `getSessionTurnsCursor_`로 기록과 함께 **그때의 TURNS 마지막 행 번호·마지막 턴 번호**를 받아 두고, `appendConversationTurns_(turns, cursor)`는 잠금 안에서 **그 행 뒤에 추가된 행만** 두 열로 훑어 같은 세션의 새 턴이 있으면 번호를 잇는다(e2e ⑮: 읽은 뒤 같은 세션 행이 끼어들어도 1~5). 30탭(99-731~760): 30/30, AI 30/30, 오류 0, **중앙값 16.8초·p95 28.0초·최대 28.5초·최소 8.1초**, turnNo 1·2 정확.

이제 잠금 안에 남은 것은 두 행 `setValues` + `SpreadsheetApp.flush()`뿐이다(약 0.6~0.7초 × 30 = 꼬리 28초). 더 줄이려면 잠금 자체를 없애야 하는데(`appendRow`의 원자성에 의존, 두 행이 떨어져 적힐 수 있음) 설계 판단이 필요해 여기서 멈춘다. 교실에서는 30명이 같은 순간에 누르지 않으므로 실제 대기는 이보다 짧다. 다음 실측 예약 번호는 **99-761부터**.

**코드 공개 여부 (교사 질문).** 시트에 묶인 스크립트는 사본을 만들면 함께 복제되고, 편집자는 언제든 고칠 수 있다. 뷰어 공유 + "다운로드·인쇄·복사 옵션" 끄기로 UI를 막을 수는 있지만, 교사가 각자 운영하는 템플릿 방식과는 양립하지 않는다. 코드를 진짜 감추려면 코드를 소유자 계정의 웹앱 하나에 두고 교사 시트는 자료만 담는 중앙 웹앱 구조로 바꿔야 한다(할당량·의존성 비용). 연수 목적과 저장소가 이미 공개인 점을 보면 **코드는 열고, 비밀은 키에만 두는** 지금 방식이 맞다. API 키는 Script Properties에만 있고 코드·PR·문서에 없다.

### 9단계. 학생 화면 말 재설계 (2026-09-06 · 배포 버전 25→27 · 브랜치 `claude/gas-stage9-student-voice`)

교사 실증 관찰("생각·근거·다듬기에 편향", "지문을 반복해서 어렵게 보여 준다")에 대한 답. **학생에게 보이는 말만 바꾸고 교사용 기록(TURNS·대시보드·근거 ID·점수)은 그대로.** 말 수준은 교사가 자료에 적은 **대상 학년**을 기준으로 한다.

| 어디 | 전 | 후 |
| --- | --- | --- |
| `Code.js` | 모든 답 끝에 "근거: 자료 구간 12 · 자료 구간 14" | 학생 화면에 붙이지 않는다. 근거 ID는 `TURNS.evidenceIds`, 근거 카드는 `SHOW_EVIDENCE`일 때만 접힌 패널로 |
| `ResponseRenderer.js` 규칙 경로 | "교사가 제공한 자료에서 관련 근거를 찾았어요. “(기사 문장 150자)”", "그렇게 생각한 근거를 지문의 어느 부분에서 찾았나요?", "근거를 더해 생각을 표현했군요…" | "글에서는 “(첫 문장 100자)”라고 했어요.", "좋아요, 그렇게 생각했군요.", "이야기해 줘서 고마워요…". 지식 항목은 학년용 쉬운 풀이를 먼저 쓴다 |
| `AIService.js` 지시문 | "학생의 시도를 관찰하고, 단서를 준 뒤, 다음 행동 한 가지를 제시하라" (코칭 말투), 초등·중등 2~4문장 | `studentVoiceInstructions_`: "{챗봇 이름}이라는 학습 친구. 대상 학생: {MATERIALS.grade}. 그 학년의 쉬운 낱말로 다정한 해요체 2~3문장. 먼저 답하고 되묻지 않는다. '근거'·'승인'·'자료 구간'·번호 금지. 학생 생각은 평가하지 말고 받아 준 뒤 글과 한 번 연결" |
| `Phase.js` 2국면 | 관리 질문이 **매 턴** 붙고(이해→까닭→성취기준×N→의견) 상한 없음. 어미가 섞임("말해 줄래요?" / "뭐라고 생각해?") | `settings.questionSpacing`: 관리 질문 다음 턴은 **쉰다**(답·피드백만, 점수는 적음, 난이도는 쉬는 턴 점수로 잇는다). `settings.maxManagedQuestions=4`: 이해·까닭·성취기준 1개·의견까지. 모든 관리 질문 해요체(`phasePoliteQuestion_`). 둘 다 `phaseSettingsFor_`에서만 켜서 **웹앱 원본 parity는 그대로 0** |
| `AIService.js` 자료 밖 질문 | "현재 승인된 자료에서는 답을 확인하기 어려워요…"로 끝 | `CONFIG.ALLOW_GENERAL_ANSWER=TRUE`면 "글에는 안 나오지만, …" 한 마디 붙여 널리 알려진 사실로 2~3문장(`aiStatus=compose:general`). 기본 FALSE. 검토 큐에는 그대로 남아 선생님이 보충할 수 있다 |

**심판.** `eval:gas` 31 · parity 207턴 불일치 0 · `e2e` 25(⑥을 새 순서 "이해→쉼→까닭→쉼→성취기준→쉼→의견→끝, 쉬는 턴 질문 0"으로) · 통합 36. 규칙 문장 두 곳의 검사도 "근거 줄 없음"으로.

**실제 발화 (버전 26, 교사 미리보기 99-764, 자료 "두리초 식생활 교육" · 버전 27은 마지막 턴의 문장 겹침과 자료 밖 질문의 억지 연결을 손본 뒤).** 근거 줄 0, 답마다 물음표 0·0·0·1·0·1·0·1, 턴당 약 9초.

- 학생: 고추장은 어떤 재료로 만들었나요?
  - 봇: 고추장은 국산 조청, 고춧가루, 메줏가루 등을 섞어 만들었어요. 글에서는 학생들이 우리나라 재료로 직접 고추장을 만들었다고 했어요.
- 학생: NON-GMO가 뭐예요?
  - 봇: NON-GMO는 비유전자변형이라는 뜻이에요. 글에서는 학생들이 식품의 원산지와 GMO 여부를 비교했다고 했어요.
- 학생: 왜 학생들이 직접 고추장을 만들어요?
  - 봇: 학생들은 직접 만들면서 음식 재료를 보고, 스스로 좋은 음식을 고르는 힘을 기르기 위해 고추장을 만들어요. 글에서는 비교하고 관찰하고 만들어 보며 음식 선택을 배운다고 했어요.
- 학생: 식생활 교육은 뭘 배우는 거예요?
  - 봇: 식생활 교육은 건강하게 먹는 습관과 우리 전통 음식을 배우는 거예요. 음식이 어디서 왔고 무엇으로 만들었는지 살펴보며, 좋은 음식을 스스로 고르는 힘도 길러요. 글에서 가장 중요한 사실 한 가지를 찾아 자기 말로 말해 줄래요?
- 학생: 학생들이 국산 재료로 고추장을 직접 만들면서 먹거리를 배웠다는 거요.
  - 봇: 맞아요. 학생들은 국산 재료로 고추장을 직접 만들며 음식에 대해 배웠어요. 글에서는 직접 보고, 만들고, 고르면서 스스로 음식을 선택하는 힘을 기른다고 했어요.
- 학생: 씨앗은 숨을 쉴 수 있지만 폐는 없잖아요. 어떻게 생명이에요?
  - 봇: 맞아요. 씨앗은 폐가 없지만 숨을 쉴 수 있어요. 글에서는 씨앗도 식품이 어디서 왔는지와 표시를 살펴보는 배움과 이어진다고 했어요. 글에 나온 결과와 그 까닭을 구분해서 말해 줄래요?
- 학생: 직접 만들어 보니까 재료를 알게 돼서 그런 것 같아요.
  - 봇: 그렇게 생각했구나. 글에서는 직접 만들며 재료와 음식이 어디에서 왔는지 살펴보고, 스스로 음식을 고르는 힘을 기른다고 했어요.
- 학생: 우리 학교도 이런 수업을 하면 좋겠어요. 재미있을 것 같아요.
  - 봇: 맞아요. 직접 포장지를 살펴보고 음식을 만들어 보면 더 재미있게 배울 수 있어요. 글에서는 이런 활동으로 건강하게 먹고 음식을 스스로 고르는 힘을 기른다고 했어요. 이 글이 가장 하고 싶은 말은 뭐라고 생각해요?
- 학생: 글쓴이는 아이들이 음식을 스스로 고르는 힘을 기르길 바라는 것 같아요.
  - 봇: 응, 그렇게 볼 수 있어요. 글에서는 아이들이 NON-GMO 식품을 알고, 스스로 음식을 고르는 힘을 기르는 것이 중요하다고 했어요.
- 학생: 재미있었어요. 나도 고추장 만들어 보고 싶어요.
  - 봇: 맞아요, 직접 고추장을 만들면 재미있을 것 같아요. 글에서는 학생들이 국산 재료를 섞어 고추장을 만들었다고 했어요. 네 생각이 궁금해요. 이 글을 읽고 어떤 생각이나 느낌이 들었어요? 네 생각이 궁금해요.

**관찰·남긴 것.**
- 자료 밖 질문(씨앗)은 스위치가 꺼진 기본값에서도 AI가 승인 근거 안에서 짧게 받아 주고 넘어갔다(분류가 `ask_fact`가 아니어서). `ask_fact`로 잡히는 자료 밖 질문은 "그건 글에 안 나오는 내용이라…"가 나가고 선생님께 남는다. 스위치를 켜려면 CONFIG 시트에 `ALLOW_GENERAL_ANSWER` 행을 `TRUE`로 넣는다(`phase0Cleanup`은 건드리지 않는다).
- 관리 질문 상한 4는 교사 실증 뒤 3으로 줄일 수 있다(`phaseSettingsFor_`의 `maxManagedQuestions`). 3이면 성취기준 질문이 빠지고 의견 질문이 마지막이 된다.
- **9단계 ④ (버전 28).** 교사가 버전 27로 실증: "대화가 훨씬 자연스러워졌다. 다만 답 아래 '확인한 교사 자료' 토글은 필요 없고, 그게 붙으니 답이 더 억지스러워 보인다." → `Client.html`에서 근거 패널을 그리지 않는다. `SHOW_EVIDENCE` 기본 FALSE(API 응답의 evidence 배열에만 영향). 근거는 TURNS·대시보드에만 남는다.
- **9단계 ⑤ (버전 29).** 교사: "근거를 꼭 시트와 대시보드에도 둘 필요는 없다." 학생 화면에서 근거를 내세우던 곳을 모두 뺐다 — 채팅 위의 "1 생각 → 2 근거 → 3 다듬기" 단계 표시, 말풍선의 단계 이름("근거 확인"·"생각 다듬기"), 빠른 버튼 "근거 말하기"(→ "내 생각 말하기"). 근거 ID는 AI가 지어내지 않게 하는 내부 영수증으로만 남고(TURNS.evidenceIds), 교사 화면에서는 지식 승인 때의 원문 인용 말고는 보이지 않는다.
- 다음 실측 예약 번호는 **99-765부터**. 자료 교체 운영 방안(세션 키에 sourceHash, 지난 대화 보관)은 다음 단계.

### 10단계. 자료 교체 운영 — 지문이 바뀌면 학생은 새로 시작, 지난 대화는 보관 (2026-09-06 · 배포 버전 30 · 브랜치 claude/gas-stage10-material-swap)

**문제.** 교사 화면에서 지문을 바꿔 저장해도 자료 행은 같은 materialId에 덮어써지고, 학생 세션 키는 materialId:반-번호라서 지난주 대화가 새 지문에서 그대로 복원됐다. 마친 학생은 "이미 마친 대화입니다"로 막히고, 대시보드는 지난 자료와 새 자료를 합산했다.

**방안(구현).** 세션 키 형식은 그대로 두고, 저장 시점에 이 자료의 TURNS 행을 보관 시트로 옮긴다.

| 어디 | 무엇 |
| --- | --- |
| SheetService.js archiveTurnsForMaterial_ | 잠금 안에서 TURNS를 읽어 materialId: 로 시작하는 행을 TURNS_ARCHIVE(같은 열 + archivedAt·archiveReason, 없으면 만든다)로 옮기고 나머지만 다시 쓴다 |
| Code.js saveTeacherSetup | 저장 전 자료를 기억해 두고, **지문(공백 정규화)이나 버전이 바뀌었을 때만** 보관한다. 제목·시작 질문·성취기준만 고친 경우는 대화를 이어간다. 결과 메시지에 "지난 대화 N건을 TURNS_ARCHIVE 시트로 옮겼어요" |
| Code.js archiveCurrentMaterialTurns | 시트 메뉴 "관리. 이 자료의 학생 대화 보관(새로 시작)" — 같은 지문으로 다음 반을 새로 시작할 때 |
| Teacher.html | 안내 한 줄: "지문을 바꿔 저장하면 학생 대화는 새로 시작되고, 지난 대화는 TURNS_ARCHIVE 시트에 보관됩니다." |
| CONTRACT.md | TURNS_ARCHIVE 행 추가(런타임은 읽지 않는다) |

**왜 이렇게.** 세션 키에 sourceHash를 넣는 방법도 되지만 검사·대시보드·테스트 러너가 모두 materialId: 접두어를 보고 있어 손댈 곳이 많고, TURNS가 학기 내내 쌓여 요청마다 전체를 읽는 성능 문제도 남는다. 보관 방식은 두 가지를 한 번에 푼다. 지난 기록은 지우지 않는다.

**심판.** eval:gas 31 · parity 207턴 불일치 0 · e2e 25 · 통합 37(새 시나리오: 제목만 고치면 대화 유지, 지문·버전을 바꾸면 TURNS_ARCHIVE로 N건 이동·TURNS에 0건·새 세션 history 0). 실제 시트에서는 교사 자료 저장을 흉내 내면 운영 자료가 바뀌므로 돌리지 않았다 — 연수 전에 사본 시트에서 한 번 저장해 본다.

**운영 절차(교사).** ① 새 지문을 교사 화면에 붙여 넣고 저장 → 메시지에 "지난 대화 N건 보관"이 보이면 끝. ② 학생에게는 새 링크를 주거나 새로고침하게 한다(예전 링크는 "수업 자료가 변경되었습니다"로 막힌다). ③ 지난 대화를 보려면 TURNS_ARCHIVE 시트. ④ 같은 지문으로 다른 날 다시 시작하려면 메뉴 "관리. 이 자료의 학생 대화 보관(새로 시작)". 다음 실측 예약 번호는 99-765부터.

### 오늘의 마감 (2026-09-06)

7~10단계를 마쳤다. 공개 웹앱은 **배포 버전 31**, PR #57·#58·#60·#61 머지, **PR #62**(교사 결정 반영·이용 조건·템플릿 갱신)만 남음. 교사 배포용 템플릿 스크립트도 버전 31 코드다. 예약 번호는 99-601~764를 썼고 **다음은 99-765부터**.

교사 결정: 관리 질문 세션당 4개 유지 · 자료 밖 질문은 기본 허용하되 글의 주제와 상관있을 때만 · 이용 조건은 `NOTICE.md`대로 엄격하게.

### 11단계. 내일 — 새 지문 실증과 교사 배포 과정 실증 (2026-09-07 예정)

터미널의 Claude Code에서 **"docs/GAS-터미널-작업-순서.md 11단계를 진행해."** 로 시작한다.

**A. 새 지문으로 실증 (자료 교체 운영 확인).**

1. 회귀 먼저: `npm run eval:gas && npm run eval:gas:parity && npm run eval:gas:e2e && node scripts/test-gas-lightweight.cjs` (31 · 불일치 0 · 25 · 38).
2. 교사 화면(질문 챗봇 → 교사 자료 입력)에 **새 지문**을 넣고 저장 → 메시지에 "지난 대화 N건을 TURNS_ARCHIVE 시트로 옮겼어요"가 뜨는지, `TURNS`에 옛 자료 행이 0인지(gviz로 `select count(B) where B starts with 'MAT-…'`), `TURNS_ARCHIVE`에 N건 있는지 본다. 제목만 고쳐 저장했을 때는 옮기지 않는지도 한 번.
3. 학생 화면 실증 10턴(예약 번호 **99-765**부터, `scratchpad/conversation.cjs` 방식): 사실 질문 3 → 낱말 뜻 1 → 관리 질문 순서(이해→쉼→까닭→쉼→성취기준→쉼→의견) → **자료 밖 질문 2개**(글과 이어지는 것 하나 → "글에는 안 나오지만"으로 시작해야 함, 전혀 다른 것 하나 → 딴소리 규칙 또는 "조금 다른 이야기"). `TURNS.aiStatus`를 gviz로 세어 `compose:ok`·`compose:general`·`general_off_topic`이 기대대로인지.
4. 교사 실증 소감을 문서에 적는다(말투가 새 지문·학년에 맞는지, 관리 질문 4개가 알맞은지).
5. (선택) 30탭 한 번(99-775~804)으로 버전 31 시간 확인 — 기대: 중앙값 17초 안팎, AI 30/30, 잠금 시간초과 0.

**B. 교사 배포 과정 실증 (연수 리허설).** 교사 한 사람이 되어 처음부터 끝까지 해 보고 걸린 시간과 막힌 곳을 적는다.

1. 템플릿 시트(빈 시트 `1dA6z…`) → `파일 → 사본 만들기`.
2. `확장 프로그램 → Apps Script` → `setupProject()` 실행 → 권한 승인 → 시트 새로고침 → `질문 챗봇` 메뉴가 뜨는지.
3. `3. 교사 자료 입력` → 지문·학년·성취기준·시작 질문 저장. 낱말 풀이 확인.
4. `1. OpenAI API 키 + Terra 설정` → 키 입력 → `2. AI 연결 테스트` 성공.
5. `배포 → 새 배포 → 웹 앱`(실행: 나, 액세스: 익명 포함) → 주소를 `CONFIG.STUDENT_WEB_APP_URL`에 → `5. 학생 챗봇 주소 확인`.
6. 학생 주소를 열어 `99-999`로 미리보기 3턴. `6. 교사 운영 대시보드`에 미리보기가 안 잡히는지.
7. 막힌 곳마다: 화면 캡처 이름·원인·해결을 `docs/GAS-6단계-검증-배포.md` 교사 운영 순서에 반영. 총 소요 시간을 적는다(목표 30분 안).
8. 끝나면 사본 시트는 지우거나 "연수 리허설"로 이름을 바꾼다. 키는 사본에서 삭제(`관리. OpenAI API 키 삭제`).

**C. 마감.** A·B 결과를 이 문서 11단계 결과 절과 PR로 남긴다. 학생 발화·배포 URL·키는 PR에 넣지 않는다.
