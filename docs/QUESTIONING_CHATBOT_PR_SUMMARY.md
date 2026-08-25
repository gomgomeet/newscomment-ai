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

- `evals/questioning-chatbot/fixtures/articles.json`: 가상 기사 6개
- `evals/questioning-chatbot/fixtures/sessions.json`: 합성 학습자 10회기, 40턴
- `scripts/run-questioning-dialogue-eval.mjs`: 실제 로컬 API 재생과 구조 검사
- `npm run eval:questioning`: 대화 회귀평가 명령

최종 자동 평가 결과는 **10회기, 40턴, 실패 0건**이다. 한 응답 최대 한 질문, 내부 정보 비노출, 종료 일관성, 관계 회복 턴의 무질문, 반복 응답 방지를 검사했다.

## 브라우저 검증

- 학교·반·번호 입력부터 채팅 시작, 학생 발화, 챗봇 응답까지 실제 Chrome 흐름을 확인했다.
- 학생 발화와 `studentReply`가 각각 한 말풍선으로 표시됐다.
- 고정 격려 배너와 오류 오버레이가 없음을 확인했다.
- 390px 모바일 환경에서 가로 오버플로가 없음을 확인했다.

## 명령 검증

- `npm run eval:questioning`: 통과, 10회기 40턴 0 failures
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
- `docs/GPT_5_3_CODEX_SPARK_USAGE_GUIDE.md`: Codex Spark를 개발 반복 도구로 사용하는 방법
- `docs/QUESTIONING_CHATBOT_PRD.md`: 현재 V2 대화정책과 학생용 제공자 경계
- `docs/GENERAL_TEACHER_STANDALONE_HTML_CHATBOT_PROMPT.md`: 일반 교사가 수업 정보만 바꿔 단일 HTML 질문 챗봇을 만드는 복사형 프롬프트

## 남은 위험과 후속 작업

- 합성 학습자 평가는 실제 학생 사용성이나 학습 효과 검증을 대신하지 않는다.
- 새 기사와 새 교과를 사용하는 홀드아웃 평가가 필요하다.
- 교사 2명 이상의 블라인드 비교로 자연스러움, 질문 소유권, 적응적 발판, 자료 근거, 종료를 채점해야 한다.
- 학생용 외부 LLM은 제공자 약관, 개인정보, 학교·기관 승인을 완료하기 전까지 기본 차단 상태를 유지한다.
- 현재 요청 제한은 단일 인스턴스 메모리 기반이므로 실제 다중 인스턴스 운영 전 공유 저장소 기반으로 교체한다.
