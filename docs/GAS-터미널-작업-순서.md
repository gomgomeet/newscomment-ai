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

### 4단계. Claude Code — `Phase.js`·`Signals.js` (완료 · 2026-09-05)

`gas/Phase.js`·`gas/Signals.js`로 이식했다. `npm run eval:gas` PASS 35 · SKIP 0. `npm run eval:gas:parity`가 웹앱 원본(TS)과 GAS 이식본을 49회기 207턴에서 턴마다 견줘 국면·질문 종류·질문 문구·집계 불일치 0. (`scripts/run-questioning-dialogue-eval.mjs`는 Next 서버가 있어야 돌아 여기서는 대신 parity로 확인한다.)

### 5단계. Codex — 접점 세 줄 끼우기 (한 시간)

```
gas/CONTRACT.md 4절의 세 줄을 submitTurn()에 끼워. composeResponseWithAI_에 taskLine을 받아
조립 프롬프트 마지막 user 파트 앞에 붙이고, 카드·규칙 응답 경로도 enforceManagedQuestion을 거치게 해.
봇 appendTurn_에 phase·managedKind·responseScore·relatedQuestion을 적어. clasp push 전에 npm run eval:gas.
```

### 6단계. 검증·배포 (두 시간)

점검 발화 18개(`scripts/check-standalone-chatbot.mjs`의 목록)를 교사 미리보기로 치고 `TURNS`를 읽는다. 30탭 동시 전송. 템플릿 시트 사본과 교사 절차.

## 4. 번갈아, 겹치지 않게

```
Codex 0단계 → Claude 2단계(완료) → Codex 3단계 → Claude 4단계 → Codex 5단계 → 둘이 6단계
```

한 번에 한 쪽만 `gas/`의 기존 파일을 고친다. Codex가 PR을 올리면 Claude Code가 검토하고 다음 사양을 `docs/`에 남긴다. PR은 작게, 자주.

## 5. clasp를 쓸 수 없을 때

학교 PC 제한으로 `clasp login`이 안 되면, Codex가 파일 전체를 GitHub 웹에서 `gas/`에 업로드한다. 채팅 붙여넣기는 마지막 수단이다 — 파일이 나뉘어 오면 이어 붙이다 한 줄이 빠진다.
