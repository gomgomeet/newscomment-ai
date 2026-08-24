# 질문 챗봇 리서치 프로젝트 적용 계획

작성일: 2026-08-25

대상 저장소: newscomment-ai

적용 기준 문서:

- QUESTIONING_CHATBOT_LLM_RESEARCH.md
- QUESTIONING_CHATBOT_10_SESSION_SYNTHETIC_DIALOGUE_EVALUATION.md

문서 성격: 코드 변경 전 구현 설계·마이그레이션·검증 계획

## 1. 결론부터

리서치 결과를 이 프로젝트에 적용하는 가장 안전한 방법은 프롬프트만 교체하는 것이 아니다. 다음 다섯 부분을 순서대로 바꿔야 한다.

1. 학생 응답 계약을 answer와 followUpQuestion에서 studentReply 중심으로 전환한다.
2. 성취기준을 curriculumCompass로 변환해 대화의 숨은 방향으로 제공한다.
3. 매 턴 primaryMove, engagementState, curriculumRelation, supportLevel, isClosing을 판단한다.
4. 학생 화면의 고정 격려 문장을 제거하고 모델이 만든 완성된 한 말풍선만 표시한다.
5. 10회기 40교환을 회귀평가 세트로 고정한 뒤 교사 블라인드 비교를 통과한 버전만 학생 파일럿 후보로 올린다.

다만 대화 품질 수정보다 먼저 해결해야 할 출시 차단 조건이 있다.

> 현재 Gemini API Additional Terms는 18세 미만을 대상으로 하거나 18세 미만이 접근할 가능성이 있는 API Client에서 Gemini API를 사용하는 것을 금지한다.

이 프로젝트의 학생 대상은 초등학생이므로 현재 Gemini 호출 경로를 그대로 학생에게 배포해서는 안 된다. 서버에서 교사 키를 숨기는 것만으로 이 약관 문제가 해결되지는 않는다. 즉시 가능한 범위는 성인 교사의 미리보기와 합성 학생 평가이며, 학생용 생성형 AI는 학교·기관 검토와 제공자 약관 확인을 거친 별도 경로가 필요하다.

## 2. 이번 적용 계획의 범위

### 포함

- ChatResult 응답 스키마 마이그레이션
- Gemini 시스템 프롬프트와 JSON Schema 개선
- 학생 UI의 말풍선·종료·대화 이력 처리
- 로컬 fallback의 다중 턴 정책
- curriculumCompass 생성과 저장
- 학생용 DTO와 교사용 내부 분석 분리
- Notion 누적 기록 마이그레이션
- 제공자 사용 경로와 미성년자 출시 차단
- 10회기 회귀평가 자동 재생 구조
- 교사 블라인드 검토와 단계적 출시 기준

### 포함하지 않음

- 실제 학생 대상 실험 실시
- 제공자 법률·약관 검토의 최종 승인
- 학생 로그를 이용한 파인튜닝
- 공개 학생 서비스 즉시 배포
- 새로운 데이터베이스에 학생 대화 본문 저장

## 3. 현재 구현에서 확인한 적용 지점

| 영역 | 현재 상태 | 적용해야 할 변화 |
|---|---|---|
| lib/questioning-board.ts | ChatResult가 answer와 followUpQuestion을 필수로 요구 | V2 필드를 먼저 추가하고 구필드는 한 단계 동안 호환 유지 |
| lib/gemini/questioning-board.ts | 직접 후속 질문 전면 금지, 격려 한 문장 강제 | 조건부 질문, 단일 교수 동작, 종료, 관계 회복 정책으로 교체 |
| app/api/questioning-board/chat/route.ts | 전체 ChatResult를 학생 브라우저로 반환 | 학생용 DTO와 교사용 내부 결과를 분리 |
| student-question-helper-chatbot.tsx | payload.answer만 말풍선에 저장 | studentReply를 실제 화면과 이력의 단일 원본으로 사용 |
| student-question-helper-chatbot.tsx | 모든 결과 아래 같은 재읽기 격려를 고정 출력 | 고정 격려 상자 제거, isClosing과 expectsStudentReply 반영 |
| student-question-helper-chatbot.tsx | 같은 브라우저의 교사 Gemini 키를 읽어 학생 요청에 포함 가능 | 학생 컴포넌트에서 API 키 접근·전송 제거 |
| createLocalQuestionResult | 이전 대화와 학생 상태를 입력받지 않음 | conversation과 dialogueState를 받는 서버 fallback으로 확장 |
| lib/notion/questioning-chatbot.ts | answer와 followUpQuestion을 별도 기록 | studentReply와 내부 상태를 기록하고 학생용·교사용 항목 분리 |
| QuestioningChatbotConfig | 원문 성취기준과 평가 분석 중심 | curriculumCompass를 선택 필드로 추가하고 구설정 자동 보완 |
| 평가 흐름 | 수동 확인 위주 | 가상 기사·페르소나 10회기 자동 재생과 교사 채점표 추가 |

## 4. 반드시 먼저 해결할 운영·보안 조건

### 4.1 Gemini 학생 직접 경로 차단

현재 권장 모드는 다음 세 가지로 분리한다.

| 모드 | 사용자 | 모델 경로 | 허용 상태 |
|---|---|---|---|
| teacher_preview | 성인 교사 | Gemini 가능 | 프롬프트·자료·합성 학생 점검용 |
| student_local | 학생 | 규칙 기반 source-bounded fallback | 즉시 개발·검증 가능 |
| student_approved_provider | 학생 | 기관이 승인한 제공자 또는 기관 운영 모델 | 약관·개인정보·학교 승인 뒤에만 활성화 |

서버 환경변수의 기본값은 학생용 외부 LLM 비활성화여야 한다.

~~~text
QUESTIONING_STUDENT_LLM_ENABLED=false
QUESTIONING_STUDENT_PROVIDER=local
~~~

학생 경로가 명시적으로 승인되기 전에는 targetGrade 문자열만 보고 임의로 외부 모델을 활성화하지 않는다. 배포 설정 자체가 승인 상태를 표현해야 한다.

### 4.2 학생 브라우저에서 교사 API 키 제거

현재 학생 컴포넌트는 같은 브라우저의 localStorage에 저장된 QuestioningAiSettings를 읽고 API 키를 요청 본문에 넣을 수 있다. 로컬 시연에는 편리하지만 학생용 운영 구조로는 적절하지 않다.

적용 원칙:

- 학생 컴포넌트에서 QUESTIONING_AI_SETTINGS_KEY 읽기와 apiKey 전송을 제거한다.
- 교사 키는 교사용 보드에서 서버 연결정보 저장 경로로만 보낸다.
- 학생 요청은 lessonCode만 보내고, 서버가 승인된 연결정보를 조회한다.
- 서버는 학생 대상 모드에서 provider 정책을 다시 확인한다.
- 브라우저 요청에서 넘어온 provider, apiKey, safety 상태를 신뢰하지 않는다.

### 4.3 학생용 응답 DTO 최소화

현재 API는 학생 화면에 표시하지 않는 questionType, typeReason, teacherFeedback, rubricScores까지 브라우저에 반환한다. 화면에서 숨기는 것과 네트워크로 보내지 않는 것은 다르다.

학생 브라우저에는 다음 정도만 반환한다.

~~~ts
type StudentChatResponse = {
  schemaVersion: 2;
  studentReply: string;
  expectsStudentReply: boolean;
  isClosing: boolean;
  localFallback: boolean;
  noticeCode?: "source_limited" | "safety_redirect" | "provider_unavailable";
};
~~~

다음 정보는 서버 내부와 교사용 Notion 기록에만 남긴다.

- questionType와 typeReason
- evidencePrompt와 revisionSuggestion
- rubricScores와 teacherFeedback
- primaryMove와 supportLevel
- safetyFlag의 내부 상세 이유

### 4.4 입력 검증과 요청 제한

Next.js Route Handler의 POST 요청은 캐시되지 않지만 외부에서 직접 호출할 수 있다. 현재 길이 제한 외에 다음 검증이 필요하다.

- lessonCode 형식과 존재 여부
- 질문 최대 길이와 전체 대화 최대 길이
- conversation 역할 순서와 허용 필드
- 학생 프로필의 허용 문자와 길이
- lessonCode별 분당 요청 수 제한
- 요청 본문에 교사 메모, 루브릭, API 키를 임의로 덮어쓰지 못하도록 서버 설정 우선
- 오류 응답에서 모델 제공자 세부 메시지와 내부 프롬프트를 노출하지 않기

## 5. 목표 아키텍처

~~~text
교사용 제작보드
  └─ 성취기준 + 자료 + 교사 메모
       └─ curriculumCompass 생성·교사 검토
            └─ 수업 연결정보에 저장

학생용 챗봇
  └─ lessonCode + 학생 발화 + 최근 대화
       └─ /api/questioning-board/chat
            ├─ 입력 정규화·요청 제한
            ├─ 학생 사용 가능 provider 확인
            ├─ dialogue policy가 상태와 교수 동작 선택
            ├─ provider adapter 또는 local fallback
            ├─ 의미 검증·안전 후처리
            ├─ StudentChatResponse만 브라우저에 반환
            └─ TeacherTurnAnalysis는 Notion에 저장
~~~

핵심은 모델이 모든 결정을 혼자 하게 두지 않는 것이다. 서버 정책이 허용 가능한 상태·동작·종료 규칙을 제한하고, 모델은 그 범위에서 자연스러운 studentReply를 생성한다.

## 6. 권장 응답 계약 V2

### 6.1 내부 전체 결과

~~~ts
type PrimaryMove =
  | "receive"
  | "clarify"
  | "offer_clue"
  | "compare_possibilities"
  | "follow_student_lead"
  | "productive_extension"
  | "check_evidence"
  | "repair"
  | "close"
  | "safety_redirect";

type EngagementState =
  | "noticing"
  | "curious"
  | "personally_connecting"
  | "exploring_possibilities"
  | "seeking_evidence"
  | "revising_thought"
  | "disengaged"
  | "ready_to_close";

type CurriculumRelation =
  | "direct"
  | "adjacent"
  | "productive_extension"
  | "disconnected";

type SourceStatus =
  | "supported"
  | "reasonable_inference"
  | "source_insufficient"
  | "out_of_scope";

type ChatResultV2 = {
  schemaVersion: 2;
  studentReply: string;
  expectsStudentReply: boolean;
  isClosing: boolean;
  primaryMove: PrimaryMove;
  engagementState: EngagementState;
  curriculumRelation: CurriculumRelation;
  supportLevel: 0 | 1 | 2 | 3 | 4;
  sourceStatus: SourceStatus;
  sourceCue: string;
  questionType: QuestionType;
  typeReason: string;
  evaluationSignals: string[];
  teacherFeedback: string;
  rubricScores: ChatEvaluation[];
  safetyFlag: boolean;
};
~~~

### 6.2 필드 불변조건

서버 정규화 함수에서 다음을 강제한다.

- studentReply는 비어 있지 않고 학생 학년에 맞는 최대 길이를 넘지 않는다.
- isClosing이 참이면 expectsStudentReply는 거짓이다.
- primaryMove가 close이면 isClosing은 참이다.
- primaryMove가 safety_redirect이면 safetyFlag는 참이다.
- studentReply에 교사 메모, 루브릭 점수, 내부 상태 이름이 포함되지 않는다.
- 학생 질문을 필요로 하지 않는 턴에는 물음표를 강제로 넣지 않는다.
- 질문이 필요한 턴에도 물음표는 최대 하나로 제한한다.
- source_insufficient 또는 out_of_scope이면 자료에 없는 사실을 확정형으로 말하지 않는다.

### 6.3 호환성 마이그레이션

한 번에 answer와 followUpQuestion을 삭제하면 UI, API, Notion 기록이 동시에 깨질 수 있다. 두 단계로 옮긴다.

1단계:

- ChatResult에 V2 필드를 추가한다.
- studentReply가 없으면 answer를 사용한다.
- Notion에는 studentReply를 우선 기록하되 구필드도 읽을 수 있게 한다.
- UI는 studentReply 우선, answer 보조로 렌더링한다.

2단계:

- 모든 저장된 수업 연결이 V2로 정규화되는지 확인한다.
- followUpQuestion 렌더링과 기록을 제거한다.
- answer를 내부 호환 별칭으로만 남겼다가 회귀평가 후 삭제한다.

## 7. 성취기준을 curriculumCompass로 변환하기

### 7.1 설정 타입

~~~ts
type CurriculumCompass = {
  rawStandard: string;
  bigIdeas: string[];
  worthwhileNoticing: string[];
  thinkingDispositions: string[];
  fertileQuestionAreas: string[];
  meaningfulExtensions: string[];
  doNotForce: string[];
};
~~~

QuestioningChatbotConfig에 curriculumCompass를 선택 필드로 먼저 추가한다. 기존 localStorage와 Supabase에 저장된 설정에는 이 필드가 없으므로 normalizeQuestioningConfig에서 자동 보완한다.

### 7.2 기존 함수를 재사용하는 방법

현재 buildStandardAssessmentAnalysis는 성취기준에서 내용 대상, 수행 행동, 평가 요소를 생성한다. 이를 버리지 않고 다음처럼 연결한다.

| 기존 값 | curriculumCompass 변환 |
|---|---|
| coreAchievement | bigIdeas의 초안 |
| contentTargets | worthwhileNoticing의 자료별 초안 |
| performanceBehaviors | thinkingDispositions |
| questionTypeLinks | fertileQuestionAreas의 내부 참고 |
| rubricDesignNotes | doNotForce와 평가 주의사항 검토에 활용 |

meaningfulExtensions와 doNotForce는 자동 생성만 믿지 않고 교사용 보드에서 교사가 검토할 수 있게 한다. 특히 doNotForce에는 “반드시 주제 문장을 말하게 하지 않기”, “모든 질문을 근거 과제로 바꾸지 않기”처럼 이번 수업에서 피할 수렴 행동을 기록한다.

### 7.3 학생 화면 노출 금지

curriculumCompass는 학생에게 보여 주는 목표 목록이 아니다. 학생에게는 rawStandard, bigIdeas, 내부 질문 영역, 도달 상태를 직접 노출하지 않는다. 이 정보는 다음 용도로만 쓴다.

- 학생 관심이 중심, 인접, 생산적 확장, 무관 중 어디에 있는지 판단
- 대화가 막혔을 때 적절한 단서 선택
- 기사 밖이지만 의미 있는 관점인지 판단
- 교사용 사후 기록에서 대화 전체의 교육과정 공명 검토

## 8. 대화 정책 계층

### 8.1 모델 호출 전에 할 일

새 모듈 lib/questioning-dialogue-policy.ts를 두고 다음을 처리한다.

~~~ts
type DialoguePolicyInput = {
  studentTurn: string;
  recentConversation: ConversationEntry[];
  previousMoves: PrimaryMove[];
  curriculumCompass: CurriculumCompass;
  material: MaterialAnalysis;
};

type DialoguePolicyDecision = {
  likelyEngagementState: EngagementState;
  curriculumRelation: CurriculumRelation;
  allowedMoves: PrimaryMove[];
  maxSupportLevel: 0 | 1 | 2 | 3 | 4;
  allowQuestion: boolean;
  shouldClose: boolean;
};
~~~

정책 계층은 정답 내용을 생성하지 않는다. 모델이 선택할 수 있는 행동 범위를 좁힌다.

### 8.2 결정 규칙의 첫 버전

| 관찰 | 정책 |
|---|---|
| “됐어요”, “그만할래요”, “이제 알겠어요” | close 허용, 질문 금지 |
| “왜 자꾸 안 된다고 해요?” | repair 우선, 새 학습 과제 금지 |
| 학생이 자발적으로 이유·근거·관점을 말함 | supportLevel 한 단계 감소 |
| 최근 두 챗봇 턴이 질문으로 끝남 | 다음 턴 질문 금지 |
| 최근 두 턴에서 “다만/하지만” 사용 | 학생 제안 확장 또는 무질문 수용 우선 |
| 자료에 답은 없지만 감정·윤리·적용과 관련 | productive_extension 허용 |
| 개인정보·대필·위험 입력 | safety_redirect만 허용 |
| 짧은 “몰라요” 첫 발생 | 구체적 단서 하나, 선택지는 최대 둘 |
| 같은 막힘이 두 번 반복 | supportLevel 상승 |

이 규칙은 학생 상태를 정확히 진단했다고 주장하는 심리 평가가 아니다. 현재 대화에 어떤 지원이 덜 부담스러운지 결정하는 운영 상태이다.

### 8.3 모델 호출 뒤 검증

Gemini Structured Outputs는 JSON 문법과 스키마 일치를 돕지만 의미의 정확성까지 보장하지 않는다. 결과를 받은 뒤 normalizeChatResultV2에서 다음을 검사한다.

- enum과 boolean 조합
- studentReply 길이와 빈 값
- 내부 메타데이터 누출 표현
- 과도한 물음표
- close 상태 충돌
- 자료 부족 상태에서 확정적 수치·인물·출처 추가
- 학생에게 루브릭 점수나 질문 유형 이름 노출

검증 실패 시 같은 모델에 무제한 재요청하지 않는다. 한 번의 교정 요청 또는 서버 fallback으로 제한해 비용과 지연을 통제한다.

## 9. 프롬프트 적용 방법

### 9.1 제거할 현재 지시

- 직접 후속 질문을 전면 금지하는 문장
- followUpQuestion에 정확히 한 개 격려 문장을 요구하는 문장
- 교사 메모를 학생 관심보다 항상 높은 수업 운영 지침으로 두는 문장
- 모든 짧은 질문을 자료 재읽기로 보내는 문장

### 9.2 추가할 핵심 정책

~~~text
성취기준은 매 턴 수행시킬 목표가 아니라 대화 전체의 보이지 않는 나침반이다.
학생이 실제로 말한 흥미, 놀람, 경험, 질문을 먼저 이어 받는다.
한 턴에는 중심 교수 동작을 하나만 선택한다.
새 호기심을 즉시 근거 과제로 바꾸지 않는다.
질문은 학생의 생각을 실제로 열 때만 최대 하나 사용한다.
학생이 이미 충분히 말했거나 끝내고 싶어 하면 질문 없이 마친다.
관련된 예상 밖 질문은 생산적인 확장으로 허용한다.
자료 사실, 가능한 추론, 자료 밖 가능성을 구분한다.
학생이 챗봇의 말투를 부담스러워하면 변명하지 말고 대화 방식을 고친다.
~~~

### 9.3 few-shot 선택

모든 예시를 한 프롬프트에 넣지 않는다. 현재 상태와 가까운 예시 2-4개만 선택한다.

권장 예시 묶음:

- 제목 예측을 수정하는 학생
- “몰라요”라고 짧게 답하는 학생
- 숫자로 원인을 확정한 학생
- 자신의 경험과 연결하는 학생
- 기사 밖 감정·권리 질문
- “왜 자꾸 안 된다고 해요?” 관계 회복
- “이제 그만할래요” 종료
- 자료 밖 사실을 묻는 확장

교사가 실제로 고친 문장을 예시 저장소에 추가할 때는 학생 식별정보와 원문 로그를 제거한다.

## 10. 학생 UI 적용

### 10.1 말풍선

현재 message.content를 studentReply의 단일 원본으로 만든다.

~~~ts
const assistantMessage: ChatMessage = {
  id: makeId(),
  role: "assistant",
  content: payload.studentReply || payload.answer,
  result: payload,
};
~~~

호환 기간이 끝나면 answer 보조 경로를 제거한다.

### 10.2 고정 격려 상자 제거

student-question-helper-chatbot.tsx의 모든 결과 아래 렌더링되는 고정 문장을 삭제한다. 격려가 필요하면 studentReply 안에 자연스럽게 포함되어야 한다.

### 10.3 expectsStudentReply와 isClosing

- expectsStudentReply가 거짓이면 응답을 재촉하는 시각 요소를 표시하지 않는다.
- isClosing이 참이면 빠른 질문 제안과 재읽기 안내를 표시하지 않는다.
- 입력창을 영구 비활성화하지는 않는다. 학생이 다시 말하고 싶으면 계속 입력할 수 있다.
- 종료 뒤 학생이 새 발화를 보내면 새 대화처럼 초기화하지 말고 이전 맥락을 유지한다.

### 10.4 빠른 질문 버튼

현재 빠른 질문 버튼은 누르면 “부분이 궁금해요”를 자동으로 붙인다. 학생이 만든 질문처럼 기록될 수 있으므로 다음 중 하나로 바꾼다.

- 버튼을 자료 탐색 필터로만 사용하고 학생 발화로 자동 전송하지 않기
- “숫자 보기”, “달라진 점 보기” 같은 탐색 동작을 입력창 초안으로만 넣기
- 실제 전송 전 학생이 수정하도록 하기

버튼은 대화가 막힌 첫 화면에서만 보이고, 학생이 자기 질문을 내기 시작하면 숨기는 편이 낫다.

## 11. API와 서버 적용

### 11.1 학생 요청

학생 요청에는 다음만 포함한다.

- lessonCode
- studentTurn
- 최근 학생용 대화
- 비식별 수업 참여 식별값이 정말 필요한 경우 최소값

standard, rubric, behavior, material, teacher memo, provider, apiKey는 lessonCode를 기준으로 서버가 불러온 값을 사용한다. 클라이언트가 보내더라도 운영형에서는 무시한다.

### 11.2 내부 결과와 외부 응답 분리

~~~ts
const internalResult = await generateQuestioningReply(...);

await saveQuestioningResultToNotion({
  result: internalResult,
  ...
});

return Response.json(toStudentChatResponse(internalResult));
~~~

Notion 저장 실패 여부는 학생 대화 내용과 분리한다. 학생에게는 기술 상세 대신 저장이 필요한 경우에만 일반적인 안내 코드를 보낸다.

### 11.3 제공자 어댑터

~~~ts
interface QuestioningModelProvider {
  generate(input: QuestioningModelInput): Promise<ChatResultV2>;
}
~~~

초기에는 GeminiTeacherPreviewProvider와 LocalStudentProvider만 구현한다. 학생용 외부 제공자는 기관 승인 뒤 같은 인터페이스로 추가한다. 이 분리는 모델 교체를 쉽게 하려는 목적뿐 아니라 사용자 연령에 따라 허용 경로를 서버에서 강제하기 위한 것이다.

## 12. 로컬 fallback 적용

fallback은 생성형 AI 실패 안내가 아니라 학생용 기본 안전 경로로도 사용할 수 있어야 한다.

### 12.1 함수 입력 확장

~~~ts
createLocalQuestionResult({
  studentTurn,
  material,
  curriculumCompass,
  conversation,
  previousMoves,
  targetGrade,
});
~~~

### 12.2 최소 지원 동작

- 개인정보·대필·위험 입력 전환
- 제목 예측과 본문 확인 구분
- 학생이 말한 핵심어와 가장 가까운 자료 문장 찾기
- 자료 안 사실과 자료 밖 질문 구분
- 최근 응답 반복 방지
- 학생 종료 신호 처리
- 관계 회복
- 질문 없이 끝나는 응답

fallback에서 풍부한 교사 대화를 모두 흉내 내려고 하지 않는다. 정확한 자료 범위, 짧은 응답, 반복 방지, 안전한 종료를 우선한다.

## 13. Notion 기록 적용

### 학생 활동 기록

- 학생이 실제로 본 studentReply
- 학생 발화
- 자료 제목
- 시간

### 교사용 내부 기록

- primaryMove
- engagementState
- curriculumRelation
- supportLevel
- sourceStatus와 sourceCue
- rubricScores와 teacherFeedback
- localFallback 여부와 provider 이름
- schemaVersion과 promptVersion

기존 “격려 문장” 블록은 제거한다. answerLog는 studentReply를 누적한다. 구기록을 다시 쓰는 마이그레이션은 필요하지 않으며, 새 기록부터 schemaVersion 2로 저장한다.

## 14. 10회기 회귀평가를 프로젝트에 넣는 방법

### 14.1 평가 자산

새 디렉터리 예시:

~~~text
evals/questioning-chatbot/
  fixtures/
    articles.json
    sessions.json
  rubrics/
    dialogue-rubric.json
  results/
    .gitkeep
scripts/
  run-questioning-dialogue-eval.mjs
~~~

articles.json에는 가상 기사와 curriculumCompass를 넣고, sessions.json에는 다음을 넣는다.

- sessionId
- targetGrade
- standard
- articleId
- persona 특성
- 학생 발화 4개
- 기대하는 핵심 동작
- 금지 패턴

실제 학생 이름, 학교, 수업 로그는 넣지 않는다.

### 14.2 자동 재생

run-questioning-dialogue-eval.mjs는 실행 중인 로컬 API에 학생 발화를 순서대로 보내고 다음을 JSON으로 저장한다.

- 모델·provider·promptVersion
- 각 턴 studentReply
- primaryMove와 상태
- localFallback 여부
- 응답 시간
- 구조 검증 통과 여부

이 스크립트는 studentProfile을 보내지 않아 Notion 저장을 건너뛴다. 운영 DB와 평가를 분리한다.

### 14.3 결정적 검사

모델 평가자 없이도 확인할 수 있는 항목:

- studentReply 빈 값 없음
- 내부 필드명과 루브릭 점수 노출 없음
- 물음표 최대 한 개
- 종료 턴에 expectsStudentReply가 거짓
- 종료 뒤 고정 재읽기 문구 없음
- 같은 격려 문장 연속 반복 없음
- 자료에 없는 수치·출처 이름 추가 여부
- 학생용 응답에 API 오류 세부정보 없음

### 14.4 교사 평가

자동 점수만으로 자연스러움을 판정하지 않는다. 기존 버전과 V2 응답에서 모델명과 버전을 가리고 다음 8항목을 교사가 채점한다.

1. 학생 발화 이어 받기
2. 질문 소유권
3. 적응적 발판
4. 자료 근거와 인식적 정직성
5. 생산적 확장
6. 자연스러운 말투와 리듬
7. 관심과 즐거운 참여
8. 경계와 종료

교사 블라인드 비교의 1차 통과 기준:

- V2 선호율 70% 이상
- 자연스러운 리듬 평균 4.0 이상
- 자료 근거 평균 4.3 이상 유지
- 종료 10개 장면 모두 새 질문 없이 종료
- 내부 메타데이터 노출 0건
- 학생 질문 대필 0건

## 15. 테스트 전략

Next.js 문서는 단위, 컴포넌트, 통합, E2E 테스트를 구분하고 실제 사용자 흐름에는 E2E 테스트를 권장한다. 이 프로젝트에서는 다음 순서가 적절하다.

### 단위 테스트

- buildCurriculumCompass
- decideDialoguePolicy
- normalizeChatResultV2
- toStudentChatResponse
- 종료·관계 회복·반복 제한 규칙

### 통합 테스트

- API가 클라이언트의 standard, rubric, provider, apiKey 덮어쓰기를 무시하는지
- Gemini 실패 시 서버 fallback으로 전환되는지
- Notion에는 내부 결과가 저장되고 학생 응답에는 DTO만 나가는지
- 구버전 QuestioningChatbotConfig가 V2로 정규화되는지

### E2E 테스트

- 학생 말풍선 아래 고정 격려 상자가 사라졌는지
- 4턴 대화에서 이전 studentReply를 이어 받는지
- isClosing 응답 뒤 재촉 문구가 없는지
- 빠른 질문 버튼이 자동 제출되지 않는지
- 학생 브라우저 요청에 apiKey가 없는지
- 네트워크 응답에 rubricScores와 teacherFeedback이 없는지

테스트 도구 도입은 기존 저장소에 테스트 러너가 없으므로 별도 커밋으로 분리한다. UI 전체 흐름에는 Playwright, 순수 정책 함수에는 Vitest가 적합하지만, 의존성 추가 전 팀의 CI와 실행 환경을 확인한다.

## 16. 단계별 구현 순서

### 단계 0. 학생 외부 LLM 차단선

변경:

- 학생용 외부 LLM 기본 비활성화
- teacher_preview와 student_local 모드 분리
- 학생 컴포넌트의 API 키 읽기·전송 제거
- API 요청 제한과 서버 설정 우선 원칙 문서화

완료 기준:

- 학생 브라우저 네트워크에 API 키가 나타나지 않는다.
- Gemini는 성인 교사용 미리보기에서만 호출된다.
- 제공자 실패 시 학생 경로는 로컬 응답으로 안전하게 끝난다.

중단 조건:

- 수업 코드 없이 학생이 교사 키를 전달해야만 동작하는 구조라면 다음 단계로 가지 않는다.

### 단계 1. V2 타입을 추가하되 기존 화면 유지

변경:

- CurriculumCompass와 ChatResultV2 타입 추가
- 구설정 normalize
- Gemini JSON Schema에 V2 필드 추가
- normalizeChatResultV2와 toStudentChatResponse 추가

완료 기준:

- typecheck 통과
- 구수업 설정 로딩 통과
- 기존 answer 사용자도 깨지지 않음

중단 조건:

- Gemini가 스키마 복잡도로 요청을 거부하면 teacherOnly 중첩을 줄이고 필드 설명을 간결하게 한다.

### 단계 2. 학생 UI를 studentReply로 전환

변경:

- payload.studentReply 우선 렌더링
- 고정 격려 상자 제거
- isClosing과 expectsStudentReply 반영
- 빠른 질문 자동 전송 수정

완료 기준:

- 종료 장면에서 상충 문구가 없음
- 화면의 말풍선과 다음 API 대화 이력이 일치
- 모바일·데스크톱에서 긴 문장 겹침 없음

중단 조건:

- UI에는 studentReply가 보이지만 이력에는 answer가 남는 혼합 상태이면 병합하지 않는다.

### 단계 3. 나침반형 프롬프트와 정책 계층

변경:

- curriculumCompass 생성·저장·교사 검토
- dialogue policy 결정
- 조건부 질문, 단일 교수 동작, repair, close 프롬프트 적용
- 관련 few-shot 선택

완료 기준:

- 10회기 자동 구조 검사 통과
- 매 턴 성취기준 문구 노출 0건
- “다만/하지만” 연속 반박 감소

중단 조건:

- 자료 근거 점수가 기존보다 0.5 이상 떨어지면 자연스러움 개선만 보고 진행하지 않는다.

### 단계 4. fallback과 Notion 전환

변경:

- fallback에 conversation과 상태 입력
- studentReply 누적
- 교사용 상태·버전 기록
- 구 followUpQuestion 기록 제거

완료 기준:

- 외부 모델이 없어도 4턴 동안 같은 문장을 반복하지 않음
- Notion 누적 답변과 학생 화면이 일치
- 구 Notion 속성이 없어도 저장 실패하지 않음

### 단계 5. 평가·교사 검토

변경:

- 10회기 평가 스크립트
- 교사 블라인드 평가표
- 결과 요약 자동 생성

완료 기준:

- 같은 promptVersion의 결과를 다시 추적할 수 있음
- V2 교사 선호율 70% 이상
- 주요 안전·종료·노출 실패 0건

### 단계 6. 제한적 파일럿 결정

선행 조건:

- 학생 사용을 허용하는 제공자 계약과 학교 승인
- 개인정보 처리와 보관 기간 확정
- 보호자·학생 안내와 교사 개입 경로
- 연령 적합 안전 설정과 위험 대응
- 실제 학생 데이터가 모델 학습·평가 데이터로 자동 재사용되지 않는 구조

이 조건이 충족되지 않으면 teacher_preview와 student_local 단계에서 멈춘다.

## 17. 파일별 구현 체크리스트

### lib/questioning-board.ts

- CurriculumCompass, ChatResultV2, 상태 enum 추가
- QuestioningChatbotConfig에 schemaVersion과 curriculumCompass 추가
- 구설정 정규화
- createLocalQuestionResult V2 입력·출력

### lib/gemini/questioning-board.ts

- schema descriptions 추가
- 직접 후속 질문 전면 금지 제거
- dialogue policy와 curriculumCompass 입력
- 의미 검증과 한 번의 fallback
- 교사용 preview 전용임을 함수 경계에서 명확히 표시

### app/api/questioning-board/chat/route.ts

- lessonCode 기반 서버 설정 우선
- 학생 provider 허용 여부 검사
- 입력 총량·역할·빈도 제한
- 내부 결과와 StudentChatResponse 분리
- 제공자 오류 세부정보 비공개

### components/questioning/student-question-helper-chatbot.tsx

- aiSettings와 학생 apiKey 전송 제거
- studentReply 말풍선
- 고정 격려 상자 제거
- isClosing, expectsStudentReply UI
- 빠른 질문 버튼 자동 제출 제거

### lib/notion/questioning-chatbot.ts

- result.studentReply 기록
- followUpQuestion 블록 제거
- 내부 상태, sourceStatus, 버전 기록
- 기존 DB 속성이 없을 때 선택적으로 건너뛰기

### components/questioning/questioning-chatbot-board.tsx

- 교육과정 나침반 교사용 검토 영역
- doNotForce 수정
- teacher_preview와 학생 실행 경로 구분
- 미성년자 provider 승인 상태 표시

### 새 파일 후보

- lib/questioning-dialogue-policy.ts
- lib/questioning-chat-dto.ts
- lib/questioning-provider.ts
- evals/questioning-chatbot/fixtures/articles.json
- evals/questioning-chatbot/fixtures/sessions.json
- scripts/run-questioning-dialogue-eval.mjs

## 18. 완료 정의

### 기능

- 학생은 모델이 만든 자연스러운 한 말풍선만 본다.
- 모든 턴이 질문이나 재읽기 과제로 끝나지 않는다.
- 학생 질문과 생산적인 곁가지가 대화 방향을 움직인다.
- 성취기준은 내부 나침반으로만 작동한다.
- 종료와 관계 회복이 정식 상태로 처리된다.

### 안전·보안

- 학생 브라우저에 교사 API 키가 없다.
- 학생 네트워크 응답에 교사용 평가 정보가 없다.
- Gemini가 학생용 경로에서 기본적으로 차단된다.
- 학생용 외부 제공자는 명시적 승인 없이는 활성화되지 않는다.
- 학생 대화가 평가 fixture나 파인튜닝 자료로 자동 복사되지 않는다.

### 품질

- 10회기 40교환 구조 검사 통과
- 교사 블라인드 V2 선호율 70% 이상
- 자료 근거 평균 4.3 이상
- 자연스러운 리듬 평균 4.0 이상
- 종료·대필·내부 노출 실패 0건

### 기술

- npm run typecheck 통과
- npm run lint 통과
- npm run build 통과
- 추가한 단위·통합·E2E 검사 통과
- 구버전 수업 설정 로딩 확인

## 19. 권장 커밋 단위

1. Gate student model providers and remove client API keys
2. Add curriculum compass and dialogue V2 contracts
3. Render unified student replies and closing states
4. Add adaptive dialogue policy and prompt examples
5. Align local fallback and Notion persistence
6. Add synthetic dialogue regression evaluation

각 커밋은 typecheck와 lint를 통과해야 한다. UI 전환과 구필드 삭제를 같은 커밋에 넣지 않아 되돌리기와 원인 추적을 쉽게 한다.

## 20. 예상 위험과 대응

| 위험 | 대응 |
|---|---|
| 스키마가 커져 Gemini가 거부 | 필드 중첩과 description 길이를 줄이고 교사용 분석을 후처리로 이동 |
| 자연스러움 개선 중 근거성 하락 | sourceStatus와 sourceCue를 필수로 유지하고 회귀 점수 하한 설정 |
| 질문이 줄어 대화가 너무 빨리 끝남 | 질문 수가 아니라 학생의 다음 자발 발화를 평가 |
| 상태 분류가 학생을 고정적으로 낙인 | 상태를 매 턴 재계산하고 교사용 심리 진단으로 사용하지 않음 |
| 구 localStorage 설정 로딩 실패 | normalizeQuestioningConfig에서 V2 기본값 생성 |
| Notion 기존 속성 불일치 | applyProperty의 선택적 매핑 유지 |
| 외부 모델 장애 | student_local fallback을 정상 운영 경로로 유지 |
| 합성 평가 점수 과신 | 교사 블라인드와 실제 파일럿을 별도 단계로 유지 |
| 미성년자 제공자 약관 위반 | 학생 외부 LLM 기본 차단과 서버 승인 목록 적용 |

## 21. 최종 권장 실행 순서

가장 먼저 구현할 묶음:

1. 학생 Gemini 호출 차단과 클라이언트 API 키 제거
2. studentReply, isClosing, expectsStudentReply 추가
3. 고정 격려 상자 제거
4. 실제 화면 응답을 대화 이력에 사용

그다음 구현할 묶음:

5. curriculumCompass
6. primaryMove와 engagementState
7. 조건부 질문·repair·close 정책
8. fallback과 Notion V2

마지막 검증:

9. 10회기 자동 재생
10. 교사 블라인드 비교
11. 제공자·개인정보·학교 승인
12. 제한적 학생 파일럿 여부 결정

프롬프트만 먼저 바꾸면 현재 고정 UI와 불완전한 이력이 좋은 응답을 다시 기계적으로 만든다. 반대로 UI만 바꾸면 모델은 여전히 직접 질문 금지와 성취기준 수렴 지시를 따른다. 따라서 첫 구현 단위는 **학생용 데이터 계약과 화면의 일치**여야 한다.

## 22. 공식 자료

- Google, Gemini API Additional Terms of Service: https://ai.google.dev/gemini-api/terms
- Google, Gemini Structured Outputs: https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- Google, Gemini Safety and Factuality Guidance: https://ai.google.dev/gemini-api/docs/safety-guidance
- Google, Gemini Safety Settings: https://ai.google.dev/gemini-api/docs/safety-settings
- Google, Zero Data Retention in the Gemini Developer API: https://ai.google.dev/gemini-api/docs/zdr
- OpenAI, Under 18 API Guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- Next.js, Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js, Data Security: https://nextjs.org/docs/app/guides/data-security
- Next.js, Testing: https://nextjs.org/docs/app/guides/testing
- Maurya et al., Unifying AI Tutor Evaluation: https://aclanthology.org/2025.naacl-long.57/
- Dou et al., SimulatorArena: https://aclanthology.org/2025.emnlp-main.1786/
- Scarlatos et al., Simulated Students in Tutoring Dialogues: https://aclanthology.org/2026.acl-long.1960/
