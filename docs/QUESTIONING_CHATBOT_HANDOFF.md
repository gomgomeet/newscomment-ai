# 질문 챗봇 작업 인수인계

## 현재 상태

- 교사용 제작보드: `/questioning-board`
- 학생용 챗봇: `/questioning-chatbot`
- 작업 브랜치: `codex/questioning-notion-recording-a`
- 학생은 학교·반·번호를 입력하고 `학교_반_번호` 형식으로 기록된다.
- 교사는 성취기준, 질문 자료, 루브릭, 챗봇 동작을 준비하고 수업 코드로 학생 화면에 연결할 수 있다.
- 질문 자료와 대화 결과는 교사 Notion 준비 DB·결과 DB에 저장할 수 있다.
- Supabase는 수업 코드와 암호화된 교사 연결정보만 보관하며 학생 대화 본문 저장소로 사용하지 않는다.
- 교사용 `평가 불러오기`는 Notion 실제 판정 점수를 우선해 표와 엑셀을 채우고, 해당 기록이 없는 학생에게만 Gemini 추천값을 사용한다.

## A·B·C·D 적용 완료

- **A** 현재 루브릭에 맞춰 Notion 점수 열을 동적으로 연결하고 세특 작성 프롬프트와 더 알아볼 질문을 저장한다.
- **B** 어려운 문장은 원문에 실제로 있는 문장만 받아 사실·숫자·주체·시점을 보존해 풀어 쓴다.
- **C** 학생 질문 1국면 뒤 B1/B2 또는 질문 4개를 기준으로 2국면에 들어가 이해→성취기준→의견 순서로 묻는다.
- **D** 질문하기, 지문 이해, 성취기준, 성찰질문과 의견 표현을 각각 0~5점으로 판정하고 수준 이름을 함께 남긴다.

## V2 대화정책 적용 완료

- 학생 응답의 단일 원본을 `studentReply`로 전환했다.
- 학생 화면의 고정 격려 상자를 제거했다.
- 성취기준을 `curriculumCompass`라는 보이지 않는 대화 방향으로 변환한다.
- 한 턴에 한 가지 교수 동작을 우선한다.
- 질문은 유용할 때만 최대 한 개 사용한다.
- 학생이 막히면 낮은 부담의 단서를 주고, 반복감이나 짜증에는 관계를 회복한다.
- 학생이 대화를 끝내려 하면 질문 없이 마친다.
- 이전 `answer`, `followUpQuestion`은 저장 데이터 호환용으로만 유지한다.
- 교사용 제작보드의 새 챗봇 기본 지시와 자동 생성 PRD는 `30-session-dialogue-v2` 프로파일을 사용한다.
- 브라우저에 저장된 이전 기본 지시는 불러올 때 최신 정책으로 바뀌고, 교사가 직접 작성한 추가 지시는 유지된다.

## 어휘·문맥 질문 적용 완료

- `vocabulary`를 사실·추론과 구분되는 읽기 질문 유형으로 추가했다.
- 학생이 낱말 뜻을 물으면 `사전적 의미 → 실제 지문 문장 → 이 글에서의 문맥적 의미` 순서로 답한다.
- 자료는 `{ term, dictionaryMeaning, contextualMeaning, contextSentence }` 어휘 표를 선택적으로 포함한다.
- 이미지 자료 분석도 핵심·난어휘를 최대 12개까지 같은 구조로 만든다.
- 교사 검토 어휘, 지문 안 직접 풀이, 제한적 내장 어휘 순으로 사용하며 근거가 없으면 뜻을 지어내지 않는다.
- 학생이 뜻을 자기 말로 확인하면 정의를 반복하거나 매번 퀴즈를 붙이지 않고 이해한 내용을 짧게 확인한다.

## 학생용 안전 경계

- 학생 컴포넌트는 교사 Gemini 키를 읽거나 채팅 요청에 보내지 않는다.
- 학생용 기본 대화 경로는 자료 기반 로컬 응답이다.
- 학생용 외부 모델은 서버 환경변수 두 개를 모두 명시한 경우에만 후보가 된다.

```text
QUESTIONING_STUDENT_LLM_ENABLED=true
QUESTIONING_STUDENT_PROVIDER=approved_gemini
```

- 기본값은 `false`, `local`이다.
- 이 스위치는 학교·기관 승인과 제공자 약관 검토를 대신하지 않는다.
- 학생 API는 교사 메모, 루브릭, 내부 정책, 제공자 오류 내용을 반환하지 않는다.

## 회귀평가

평가 하네스는 가상 기사 15개를 사용한다. 개선에 사용하는 개발 세트 39회기 167턴과, 새 기사·학생 반응으로 구성한 홀드아웃 10회기 40턴을 분리해 실제 로컬 API에 재생한다.

최종 결과:

```text
49 sessions
207 turns
0 failures
0 review flags
```

검사 항목은 V2 응답, 빈 응답, 한 턴 최대 한 질문, 내부 정보 비노출, 종료 일관성, 관계 회복, 복사 요구, 인과 과장, 반복 문장, 기계적 문구, 어휘 답변의 사전적 의미와 문맥 근거 포함 여부다. 최초 확장 실행의 실패 19건과 검토 플래그 95건을 오류 유형별로 수정한 결과다.

## 브라우저 확인

- 학생 정보 입력, 채팅 시작, 발화 전송, 챗봇 응답 표시 흐름을 실제 Chrome에서 확인했다.
- `뭐가 중요한지 모르겠어요.` 발화에 학생 말풍선과 챗봇의 단일 응답 말풍선이 표시됐다.
- 고정 격려 배너와 오류 오버레이가 없었다.
- 390px 폭에서 `innerWidth=390`, `scrollWidth=390`이고 화면 밖 요소가 없었다.

## 검증 완료

```powershell
npm run eval:questioning:development
npm run eval:questioning:holdout
npm run eval:questioning
npm run lint
npm run typecheck
npm run build
```

모두 통과했다. 샌드박스의 첫 빌드는 `spawn EPERM`이었으나 권한 허용 빌드에서 정상 완료됐다.

## 주요 문서

- `docs/QUESTIONING_CHATBOT_LLM_RESEARCH.md`
- `docs/QUESTIONING_CHATBOT_10_SESSION_SYNTHETIC_DIALOGUE_EVALUATION.md`
- `docs/QUESTIONING_CHATBOT_RESEARCH_APPLICATION_PLAN.md`
- `docs/QUESTIONING_CHATBOT_RESEARCH_APPLICATION_RESULT.md`
- `docs/QUESTIONING_CHATBOT_30_SESSION_ITERATIVE_LEARNING.md`
- `docs/QUESTIONING_CHATBOT_VOCABULARY_CONTEXT_UPDATE.md`
- `docs/QUESTIONING_CHATBOT_PR_SUMMARY.md`
- `docs/GENERAL_TEACHER_STANDALONE_HTML_CHATBOT_PROMPT.md`
- `docs/GENERAL_TEACHER_READY_TO_COPY_CHATBOT_PROMPT.md`
- `docs/GPT_5_3_CODEX_SPARK_USAGE_GUIDE.md`
- `docs/QUESTIONING_CHATBOT_PRD.md`

## 환경변수

최소 Supabase·암호화 설정은 `.env.example`을 따른다. 학생용 외부 모델은 기본 차단 상태를 유지한다.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

개발 주소는 `http://localhost:3000`이며 확인 경로는 `/questioning-board`와 `/questioning-chatbot?lesson=수업코드`이다.

## 배포 전 필수 작업

운영 Notion 결과 DB에 아래 열이 없으면 저장은 경고와 함께 중단된다.

- 숫자: `질문하기`, `지문 이해`, `성취기준 점수`, `성찰질문과 의견 표현`
- 선택 또는 텍스트: `도달 난이도`
- 텍스트: `더 알아볼 질문`

2026-08-26 읽기 전용 점검 결과, 현재 공유된 운영 결과 DB에는 구형 평가 열만 있고 위 6개 열은 아직 없다. 새 열 추가는 운영 데이터베이스 변경이므로 이 점검에서는 수행하지 않았다.

브랜치 푸시로 생성된 Vercel Preview에서 새 열로 실제 저장되는지 확인한 뒤 Production으로 승격한다. 앱 코드는 운영 Notion DB 스키마를 자동 변경하지 않는다.

## 다음 단계

1. 교사 2명 이상의 블라인드 비교로 자연스러움, 질문 소유권, 적응적 발판, 어휘 설명의 정확성, 자료 근거, 종료를 채점한다.
2. 이번 홀드아웃은 수정 근거로 사용됐으므로 현재 fixture에 없는 새 기사·교과·학생 유형으로 다음 홀드아웃을 만든다.
3. 제공자 약관, 개인정보, 학교·기관 승인을 확인한 뒤에만 제한적 학생 파일럿을 설계한다.
4. 운영 Notion 결과 DB에 6개 열을 추가하고 실제 학생 1건의 저장→`평가 불러오기`→엑셀 흐름을 Preview에서 통합 시험한다.
5. 다중 인스턴스 운영 전 메모리 요청 제한을 공유 저장소 기반으로 교체한다.

## 현재 한계

- 49회기 결과는 시나리오 기반 합성 학습자 다중 턴 형성평가이며 실제 학습 효과 연구가 아니다.
- 로컬 경로는 범용 전자사전이 아니므로 교사가 검토한 어휘 표 밖의 임의 낱말은 제한적으로만 답한다.
- 홀드아웃도 한 차례 수정에 사용됐으므로 일반화 성능의 확정치로 해석할 수 없다.
- 자동평가 질문 턴 비율은 31.9%다. 2국면 질문의 양과 부담을 교사 평가에서 확인해야 한다.
- 학생용 외부 LLM은 현재 기본 차단 상태다.
