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

Codex에게 줄 지시문:

```
gas/CONTRACT.md 와 docs/구글시트-챗봇-경량화-제안.md 를 먼저 읽어.
경량화 제안 4~5절 순서대로: (1) 분석 AI 호출 제거 — analyzeStudentTurn_ 규칙 결과만 쓴다,
(2) 모델 하나(AI_MODEL), (3) AI 카드 생성·외부 자료·검색 캐시 제거,
(4) READINESS·EVALUATION_LOG·GENERATION_LOG·SESSIONS·RETRIEVAL_LOG·BOARD 쓰기 제거,
BOARD 시나리오는 runSmokeTests()로, (5) TURNS·KNOWLEDGE·REVIEW_QUEUE·CONFIG 열을 CONTRACT 3절대로,
(6) getBootstrapData의 별명 입력을 반-번호 입력으로 바꾸고 studentCode='3-12' 형식으로 세션 키를 만든다.
Phase.gs·Signals.gs·evals/gas/ 는 만지지 마. 한 PR로. 푸시 전에 node evals/gas/run.mjs 초록 확인.
```

### 4단계. Claude Code — `Phase.gs`·`Signals.gs` (하루)

`lib/questioning-conversation-phase.ts`·`lib/questioning-target-signals.ts`를 타입만 걷어 이식. `npm run eval:gas`의 SKIP이 모두 PASS가 되면 끝. 49회기 회귀는 `scripts/run-questioning-dialogue-eval.mjs --engine=gas` 갈래를 더해 웹앱과 국면·질문 순서가 같은지 본다.

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
