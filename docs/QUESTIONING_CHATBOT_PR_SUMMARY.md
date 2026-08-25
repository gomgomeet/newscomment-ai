# 질문 챗봇 리서치 적용 PR 요약

## 목적

학생 응답이 고정 격려와 기계적인 문장으로 반복되는 문제를 리서치 결과에 따라 실제 프로젝트 구조에 반영했다. 성취기준은 매 턴의 정답 목표가 아니라 대화 전체의 보이지 않는 나침반으로 사용하고, 챗봇은 학생의 관심·질문·종료 의사를 따라 한 번에 한 가지 도움만 제공한다.

## 주요 변경

### 대화 품질

- `studentReply` 중심 V2 응답 계약을 추가하고 학생 화면에는 완성된 한 말풍선만 표시한다.
- 모든 응답 아래 붙던 고정 격려 상자를 제거했다.
- 직접 후속 질문 전면 금지를 조건부 최대 한 질문 정책으로 바꿨다.
- 설명, 반영, 근거 연결, 관점 확장, 낮은 부담의 단서, 불확실성 표시, 관계 회복, 안전 전환, 종료 중 한 가지 동작을 우선한다.
- 최근 질문 반복, 학생의 짜증·거부, 불확실성, 종료 신호를 서버 정책에서 판단한다.
- `curriculumCompass`를 추가해 성취기준이 학생에게 노출되거나 대화를 억지로 수렴시키지 않게 했다.
- 제목 예측, 숫자 인과, 공감·권리, 해결 방안, 도덕화 위험을 포함한 로컬 응답을 다중 턴 맥락에 맞게 보완했다.
- 교사용 제작보드의 새 챗봇 기본값과 자동 생성 PRD에 `30-session-dialogue-v2` 프로파일을 적용했다.
- 이전 기본 지시는 최신 정책으로 자동 마이그레이션하되 교사가 직접 작성한 추가 지시는 보존한다.
- `vocabulary` 질문 유형과 `{ term, dictionaryMeaning, contextualMeaning, contextSentence }` 자료 구조를 추가했다.
- 낱말 질문에는 사전적 의미, 실제 지문 문장, 문맥적 의미 순으로 답하고 근거 없는 뜻은 만들지 않는다.
- 학생이 낱말 뜻을 자기 말로 확인하거나 반대말·기사 수치 이해로 이어 갈 때 정의를 기계적으로 반복하지 않는다.
- 이미지 자료 분석과 학생용 LLM 프롬프트에도 같은 어휘·문맥 규칙을 적용했다.

### 학생 데이터 경계

- 학생 컴포넌트에서 교사 Gemini API 키 읽기와 요청 전송을 제거했다.
- 학생용 대화는 로컬 자료 기반 응답이 기본이다.
- 외부 제공자는 `QUESTIONING_STUDENT_LLM_ENABLED=true`와 `QUESTIONING_STUDENT_PROVIDER=approved_gemini`가 모두 설정된 서버 경로에서만 후보가 된다.
- 수업 설정 조회에서 성취기준 원문, 루브릭, 교사 메모, PRD, API 키를 제거했다.
- 학생 채팅 API는 `studentReply`, 종료 여부, 응답 기대 여부만 포함한 최소 DTO를 반환한다.
- 입력 길이, 역할, 대화 수, 수업 코드, 제어 문자를 검증하고 수업·세션별 분당 20회 요청 제한을 추가했다.

### 기록과 호환성

- 기존 `answer`, `followUpQuestion`은 구데이터 호환용 별칭으로 유지한다.
- Notion에는 학생이 실제로 본 `studentReply`를 누적하고, 교사용 정책 상태와 자료 근거 상태는 내부 기록으로 분리한다.
- 기존 챗봇 설정은 정규화 단계에서 `curriculumCompass`와 새 기본 동작을 자동 보완한다.
- Gemini 키가 없어도 수업 연결을 저장하고 학생용 로컬 모드를 사용할 수 있다.

## 평가 하네스

- `evals/questioning-chatbot/fixtures/articles.json`: 가상 기사 15개
- `evals/questioning-chatbot/fixtures/sessions.json`: 개선에 사용하는 개발 세트 34회기, 136턴
- `evals/questioning-chatbot/fixtures/holdout-sessions.json`: 새 기사와 반응으로 구성한 홀드아웃 10회기, 40턴
- `scripts/run-questioning-dialogue-eval.mjs`: 실제 로컬 API 재생과 구조 검사
- `npm run eval:questioning:development`: 개발 세트 반복 평가
- `npm run eval:questioning:holdout`: 홀드아웃 평가
- `npm run eval:questioning`: 두 세트 전체 평가

최초 확장 실행은 개발 세트에서 실패 19건과 검토 플래그 95건을 발견했다. 오류 유형을 프롬프트와 일반 대화정책에 반영한 뒤 어휘 대화 4회기 16턴을 추가했다. 최종 자동 평가 결과는 **전체 44회기, 176턴, 실패 0건, 검토 플래그 0건**이다. 한 응답 최대 한 질문, 내부 정보 비노출, 종료 일관성, 관계 회복, 복사 요구, 인과 과장, 반복 응답, 기계적 문구와 어휘 답변의 사전적·문맥적 근거를 검사했다.

평가 요청에서 별도 축약 동작 설정을 제거해, 교사용 제작보드가 실제 생성하는 최신 기본 설정 자체를 176턴에 사용한다.

## 브라우저 검증

- 학교·반·번호 입력부터 채팅 시작, 학생 발화, 챗봇 응답까지 실제 Chrome 흐름을 확인했다.
- 학생 발화와 `studentReply`가 각각 한 말풍선으로 표시됐다.
- 고정 격려 배너와 오류 오버레이가 없음을 확인했다.
- 390px 모바일 환경에서 가로 오버플로가 없음을 확인했다.

## 명령 검증

- `npm run eval:questioning`: 통과, 48회기 192턴 0 failures, 0 review flags
- `npm run eval:questioning:holdout`: 통과, 10회기 40턴 0 failures, 0 review flags
- `npm run lint`: 통과
- `npm run typecheck`: 통과
- `npm run build`: 통과
- `git diff --check`: 통과

일반 샌드박스 빌드는 Windows 하위 프로세스 권한으로 `spawn EPERM`이 발생했으나, 권한 허용 환경에서 같은 코드의 프로덕션 빌드는 정상 완료됐다.

## 문서

- `docs/QUESTIONING_CHATBOT_LLM_RESEARCH.md`: 교육 대화, LLM 구조, 안전, 프롬프트 리서치
- `docs/QUESTIONING_CHATBOT_10_SESSION_SYNTHETIC_DIALOGUE_EVALUATION.md`: 초기 10회기 형성평가와 발견점
- `docs/QUESTIONING_CHATBOT_RESEARCH_APPLICATION_PLAN.md`: 파일별 적용 설계와 출시 기준
- `docs/QUESTIONING_CHATBOT_RESEARCH_APPLICATION_RESULT.md`: 실제 구현, 40턴 결과, 브라우저 검증, 한계
- `docs/QUESTIONING_CHATBOT_30_SESSION_ITERATIVE_LEARNING.md`: 합성 학생 30회기 반복 개선, 홀드아웃 10회기, 지속 학습 운영 원칙
- `docs/QUESTIONING_CHATBOT_VOCABULARY_CONTEXT_UPDATE.md`: 사전적 의미와 문맥적 의미를 구분하는 어휘 지원 구조와 4회기 평가
- `docs/GPT_5_3_CODEX_SPARK_USAGE_GUIDE.md`: Codex Spark를 개발 반복 도구로 사용하는 방법
- `docs/QUESTIONING_CHATBOT_PRD.md`: 현재 V2 대화정책과 학생용 제공자 경계
- `docs/GENERAL_TEACHER_STANDALONE_HTML_CHATBOT_PROMPT.md`: 일반 교사가 수업 정보만 바꿔 단일 HTML 질문 챗봇을 만드는 복사형 프롬프트
- `docs/GENERAL_TEACHER_READY_TO_COPY_CHATBOT_PROMPT.md`: 성취기준과 지문 입력란만 바꿔 바로 사용하는 최종 통합 프롬프트

단일 HTML 제작 프롬프트에도 34회기에서 발견한 어휘·문맥 구분, 인과 과장, 자기 수정, 반복 막힘, 감정·입장, 개인정보와 대필 분리, 대필 후 복귀, 구어체 종료 규칙을 반영했다. 생성 단계에서 개발 34회기와 새 자료 홀드아웃 10회기를 함께 검사하도록 했다.

## 남은 위험과 후속 작업

- 합성 학습자 평가는 실제 학생 사용성이나 학습 효과 검증을 대신하지 않는다.
- 이번 홀드아웃은 오류 수정에 한 번 사용됐으므로 다음 개선 주기에는 완전히 새로운 홀드아웃이 필요하다.
- 자동평가의 질문 턴 비율은 4.5%로 낮다. 질문을 억지로 늘리기보다 교사 블라인드 채점으로 필요한 질문까지 줄었는지 확인해야 한다.
- 교사 2명 이상의 블라인드 비교로 자연스러움, 질문 소유권, 적응적 발판, 자료 근거, 종료를 채점해야 한다.
- 학생용 외부 LLM은 제공자 약관, 개인정보, 학교·기관 승인을 완료하기 전까지 기본 차단 상태를 유지한다.
- 현재 요청 제한은 단일 인스턴스 메모리 기반이므로 실제 다중 인스턴스 운영 전 공유 저장소 기반으로 교체한다.

## 2026-08-26 후속 점검 반영

최종 목표를 "학습자의 지문 이해력과 질문하는 능력을 높이는 자연스러운 대화"로 다시 두고, PR #12 이후 라이브 시뮬레이션과 리서치 반영 우선순위를 코드에 추가로 반영했다.

- 생각 카드 검색은 질문 의도, 카드 유형, 지식 상태, 출처 신뢰도, 학년 적합도, 난이도, 리서치 최신성을 함께 점수화한다.
- `needs_review`와 `outdated` 카드는 학생 답변 근거에서 제외해 검토 전 카드가 대화에 섞이지 않게 했다.
- 교사 검증 카드와 출처 있는 리서치 카드가 학생 질문에 더 안정적으로 연결되도록 `targetGrade`를 카드 검색에 전달한다.
- 자료 밖 리서치 답변은 별도 덧붙임 말풍선처럼 보이지 않게 기존 답변 안에 자연스럽게 합친다.
- 낱말 질문은 첫 질문에서 사전적 뜻을 짧게 답하고, 문맥 뜻은 학생이 이어 묻거나 지문 맥락을 요구할 때 설명하도록 Gemini 프롬프트를 조정했다.
- `curriculumCompass.doNotForce`를 프롬프트에 내부 금지 기준으로 전달해 모든 학생을 같은 중심 생각이나 모범 질문으로 밀어 넣지 않게 했다.
- 로컬 fallback의 일반 질문 분기는 두 질문을 한꺼번에 묻지 않고 한 문장에 한 질문만 남기도록 줄였다.

검증은 `npm run typecheck`, `npm run eval:questioning`, `npm run lint`, `npm run build`, 라이브 시뮬레이션으로 재확인했다. 라이브 시뮬레이션은 서버 설정상 여전히 `localFallback: true`였으므로, Gemini 경로의 실제 학생 답변 품질은 Vercel 환경변수와 수업 코드 연결을 켠 뒤 다시 확인해야 한다.

## 2026-08-26 Gemini 실제 경로 재점검

Vercel Production/Preview의 학생 LLM 스위치가 켜져 있음을 확인했고, Production 환경변수를 주입한 라이브 시뮬레이션에서 `localFallback: false`로 실제 Gemini 학생 응답을 확인했다.

실제 Gemini 응답에서 발견된 개인정보 비식별 질문 오분류와 종료 발화 복창은 `lib/gemini/questioning-board.ts`의 서버 정규화 단계에서 보완했다. 수정 후 재실행에서도 `localFallback: false`가 유지됐고, 개인정보 질문은 안전한 비식별 안내로, 종료 발화는 질문 없는 마무리로 처리됐다.
