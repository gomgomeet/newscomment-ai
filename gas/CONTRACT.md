# gas/ 계약서 — Codex와 Claude Code가 같은 코드를 고칠 때 지키는 것

`gas/`를 고치기 전에 이 문서를 읽는다. 여기 적힌 이름·서명·열은 **둘 다 바꾸지 않는다.** 바꿔야 하면 이 문서를 먼저 고치는 PR을 따로 낸다.

## 1. 원본과 배포

- 원본은 이 저장소의 `gas/`다. Apps Script 편집기에서 직접 고친 것은 원본이 아니다.
- 배포는 `clasp push`로만 한다. `.clasp.json`(스크립트 ID)은 커밋하고 `.clasprc.json`(로그인 토큰)은 커밋하지 않는다.
- 푸시 전에 `npm run eval:gas`(점검 발화)와 `npm run eval:gas:parity`(웹앱 원본과 49회기 동일성)가 초록이어야 한다.

## 2. 파일 소유

| 파일 | 소유 | 상대는 |
| --- | --- | --- |
| `Code.gs`, 분석·검색·조립·시트·OpenAI 함수가 든 기존 `.gs`, `Client`·`Teacher`·`Dashboard`·`Styles` | **Codex** | 읽기만. 고칠 것이 있으면 사양을 써서 PR 설명에 남긴다 |
| `Phase.gs`, `Signals.gs`, `Maintenance.js`(0단계 시트 정리, 1회용), `evals/gas/**`, `docs/**`, 이 문서 | **Claude Code** | 읽기만 |
| `submitTurn()` 안의 2국면 접점 세 줄 (4절) | Claude가 사양, **Codex가 끼움** | — |

기존 파일은 **한 번에 한 PR**만 연다. 같은 파일을 두 PR이 동시에 고치지 않는다.

## 3. 시트와 열 — 경량화 뒤 기준

`docs/구글시트-챗봇-경량화-제안.md`가 근거. 코드가 읽고 쓰는 시트는 이 일곱 장뿐이다.

| 시트 | 열 |
| --- | --- |
| `CONFIG` | `key` `value` `description` — 키 11개: `APP_NAME` `GREETING_MESSAGE` `SUBJECT` `MAX_INPUT_LENGTH` `MIN_RELEVANCE_SCORE` `MAX_RETRIEVAL_RESULTS` `SHOW_EVIDENCE` `AI_ENABLED` `AI_MODEL` `AI_REASONING_EFFORT`(기본 minimal) `AI_MAX_OUTPUT_TOKENS` `AI_MAX_HISTORY_TURNS`(기본 4) `STUDENT_WEB_APP_URL` `LESSON_CODE` |
| `MATERIALS` | `materialId` `title` `grade` `gradeCode` `standard` `standardCode` `text` `startQuestion` `active` `version` `sourceHash` `status` `activityMode` |
| `CHUNKS` | `chunkId` `materialId` `chunkOrder` `content` `keywords` `sourceLocation` `version` `sourceHash` `status` `active` |
| `VOCABULARY_LIBRARY` | `vocabularyId` `term` `normalizedTerm` `easyDefinition` `exampleText` `wordGroup` `sourceId` `version` `sourceHash` `status` `active` |
| `KNOWLEDGE` | `knowledgeId` `materialId` `knowledgeType` `title` `content` `easyExplanation` `evidenceQuote` `chunkId` `sourceHash` `status` `active` |
| `CARDS` | `cardId` `studentMove` `primaryMove` `hintLevel` `response` `questionPatterns` `materialId` `sourceHash` `status` `active` |
| `TURNS` | `timestamp` `sessionId` `studentCode` `turnNo` `speaker`(`student`/`bot`) `text` `studentMove` `primaryMove` `hintLevel` `sourceStatus` `evidenceIds`(`\|`로 이어 붙임) `aiStatus` `decisionReason` **`phase`** **`managedKind`** **`responseScore`** **`relatedQuestion`** `isPreview` |
| `REVIEW_QUEUE` | `createdAt` `reviewId` `studentCode` `question` `reasonCode` `candidateIds` `count` `status` `teacherDecision` `reviewedAt` |
| `DASHBOARD` | 학생별 한 행: `studentCode` `questionCount` `relatedQuestionCount` `comprehensionBest` `standardBest` `opinionScore` `moreToExplore` `reachedDifficulty` `teacherNote` |

굵은 열은 2국면이 새로 쓴다. `studentCode`는 **반-번호**(예 `3-12`)다. 별명·이름은 받지 않는다.

## 4. 2국면 접점 — `submitTurn()` 안 세 줄

```javascript
// (1) selectNextMove_ 다음
const decision = decidePhase(history, safeMessage, phaseSettingsFor_(material), { currentRelated: analysis.relatedQuestion });
// (2) composeResponseWithAI_ 호출에 넘긴다 — 조립 프롬프트 마지막 user 파트 앞에 buildTaskLine(decision)을 붙인다
const aiComposeResult = composeResponseWithAI_({ ..., taskLine: buildTaskLine(decision) });
// (3) 봇 턴을 appendTurn_ 하기 직전
responseResult.text = enforceManagedQuestion(responseResult.text, decision);
```

봇 `appendTurn_`에 `phase: decision.phase, managedKind: decision.kind || '', responseScore: decision.lastScore ?? '', relatedQuestion: decision.relatedQuestion` 을 함께 적는다. 카드·규칙 응답 경로(AI 꺼짐)도 (3)을 똑같이 거친다.

## 5. 함수 서명 — `Phase.gs` / `Signals.gs` (Claude 소유)

```javascript
/** history: TURNS 행 배열(시간순), 각 행 {speaker:'student'|'bot', text, studentMove?, managedKind?}
 *  message: 이번 학생 발화(가린 뒤)
 *  settings: { passage, title, standard, standardCode, memo, words:[{term, definition}], keyConcepts:[], gradeCode } */
function decidePhase(history, message, settings, options)
//   options.currentRelated: 런타임 분류기(analyzeStudentTurn_)의 relatedQuestion — 지시어 이어 묻기·제목 수치처럼
//   규칙만으로 못 잡는 관련 질문을 국면 집계에도 반영한다. 지난 턴은 TURNS.relatedQuestion 열을 그대로 센다.
//   settings.stemMatch: 어형이 바뀐 낱말(줄었어요~줄었다)도 관련으로 봄. phaseSettingsFor_가 켠다.
// → { phase: 1|2, managedQuestion: string, allowQuestion: boolean,
//     kind: ''|'b1'|'b2'|'explain_sentence'|'comprehension_medium'|'comprehension_followup'|'standard'|'opinion'|'done',
//     difficulty: '하'|'중'|'상', feedback: string, lastScore: number|null, relatedQuestion: boolean, closing: boolean }
//   explain_sentence = "이 문장 무슨 말인지 모르겠어요" — 풀이가 먼저, 이 턴에는 관리 질문 없음
//   closing = 학생이 마치겠다고 함. Codex 쪽 plan.isClosing 과 OR 로 합친다

function buildTaskLine(decision)                       // → '[지금 할 일] …' 한 줄
function enforceManagedQuestion(text, decision)        // → 물음표를 걷고 상태기 질문 하나만 남긴 text
function phaseSettingsFor_(material)                   // → settings (MATERIALS·VOCABULARY_LIBRARY에서)
function phaseSummaryFor_(history, settings)           // → DASHBOARD 학생별 행: {questionCount, relatedQuestionCount, comprehensionBest, standardBest, opinionScore, moreToExplore, reachedDifficulty, phase}

// Signals.gs
function buildStandardTargets(standard, memo)          // → [{key,label,behavior,markers,askTemplate}] ≤2
function isPassageRelatedQuestion(text, settings)      // → boolean
function answerScore(question, answer, settings)       // → 0~5
```

`[지금 할 일]` 형식은 세 가지뿐이다.

```
[지금 할 일] 학생 말에 답만 하세요. 질문 없이.
[지금 할 일] 1국면입니다. 학생 질문에 답하고 되묻지 마세요.
[지금 할 일] 2국면입니다. 학생 말에 먼저 답한 뒤, 마지막 문장으로 이 질문 하나만 붙이세요: "…" 피드백 문장: "…"
```

## 6. 원칙 — 코드보다 앞선다

- **답 먼저.** `ask_fact`·`ask_definition`은 근거로 먼저 답한다. `check_evidence`는 학생이 주장했을 때만.
- **질문은 상태기가 소유한다.** 모델에게 세라고 시키지 않는다. 후처리가 모델의 물음표를 걷는다.
- **점수는 세는 것만.** `responseScore`는 `Signals.gs` 규칙이 계산한다. 판정은 교사 열.
- **위치 표현은 코드가 만든다.** "구간 N"·"괄호 안"을 모델이 쓰게 두지 않는다. 검색된 `chunkId`에서 만든다.
- **한 턴에 AI 한 번.** 분석은 규칙(`analyzeStudentTurn_`), 조립만 모델.
- **이름을 받지 않는다.** 반-번호만. 발화는 가린 뒤 모델과 시트에 보낸다.
