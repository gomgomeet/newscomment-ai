# simbot 평가기준별 질문·근거 계획 (로컬 구현 계약)

운영 배포 전 교사 검토가 필요하다. 기존 `gas/`는 변경하지 않는다. 기존 키·학생 기록·일반 웹 챗봇 흐름은 유지한다.

## 교사 계획

수업 설정의 `assessmentPlanJson`은 다음 객체의 정규화된 JSON 문자열이다. 중앙 요청에는 같은 객체를 `lesson.assessmentPlan`으로 보낸다. 없으면 `{schemaVersion:1,approved:false,criteria:[]}`다.

```ts
type AssessmentPlan = {
  schemaVersion: 1;
  approved: boolean;
  criteria: Array<{
    id: string;                 // /^[A-Za-z0-9_-]{1,40}$/, 중복 금지
    criterion: string;          // 최대 180자, 교사 확인용 평가기준
    responseKind: 'explanation' | 'student_question';
    mainQuestion: string;       // 최대 250자, 학생에게 한 번에 한 질문
    followUpQuestion: string;   // 최대 250자, 부족한 근거 보완용 한 질문
    evidenceDescription: string;// 최대 300자, 교사가 확인할 학생 수행
    sourceQuote: string;        // 최대 240자, 실제 본문에 있는 힌트용 짧은 구절
    requireSourceEvidence: boolean;
  }>;
};
```

- 최대 5개. 미승인 초안은 빈 필드도 저장 가능하나 자료형·크기·중복 ID는 항상 검사한다.
- 승인할 때는 모든 문자열이 채워지고, 질문마다 물음표가 정확히 한 개/문장 끝에 있어야 한다. `sourceQuote`는 공백 정규화 후 본문에 존재해야 한다. `student_question`은 학생 스스로 질문을 생성하도록 요구한다.
- 카드 또는 교과·학년·목표·성취기준·평가기준·수준·근거·본문·제목·시작질문을 편집하면 UI 승인을 해제한다. 모드만 OFF/ON하면 계획/승인을 보존한다.
- 계획 저장은 수업 hash/revision에 포함한다. 계획/자료 변경 뒤 이전 학생 세션이나 미리보기 증거를 재사용하지 않는다.
- 빈 계획은 하위호환 일반 대화이며 화면에서 '기준별 질문계획 없음'을 명시한다. 비어 있지 않은 미승인 계획은 평가모드 준비/진입을 차단하고 초안 저장만 허용한다. 탐색모드는 계획을 보존하되 실행하지 않는다.

## 중앙 진행 상태

`assessmentProgress`를 중앙 요청의 최상위 필드와 관찰값에 선택적으로 추가한다. GAS는 학생 payload를 신뢰하지 않고 **저장된 마지막 bot 행**에서만 가져온다. 18턴 이력 잘림과 무관하게 보존한다.

```ts
type AssessmentProgress = {
  schemaVersion: 1;
  planId: string;
  activeIndex: number;
  stage: 'main' | 'followup' | 'complete';
  items: Array<{
    id: string;
    label: string;              // 불변 교사 표기, 최대 80자
    status: 'pending' | 'awaiting_evidence' | 'collected' | 'needs_review';
    attempts: number;           // 최대 2, 힌트/질문은 답변 시도가 아님
    hintCount: number;          // 최대 99
    assisted: boolean;
    answerRequestId: string;    // 마지막 실제 답변 requestId, 없으면 ''
    evidenceRequestId: string;  // 검증된 학생 자료 인용의 requestId, 없으면 ''
  }>;
  lastEvent: {
    requestId: string;
    criterionId: string;
    kind: 'answer' | 'hint' | 'question' | 'skip' | 'safety' | 'closing' | 'prompt';
    evidenceVerified: boolean;
  };
};
```

- `planId`는 승인 계획과 수업 revision/source identity에 바인딩한다. 상태의 항목 순서·ID·한계 검사, 계획 불일치 거절. 학생 화면에는 내부 상태/기준/교사용 증거 설명을 보내지 않는다.
- 평가 시작 질문은 승인 계획의 첫 `mainQuestion`. 공개 bootstrap, 가상 이력, 실제 첫 bot 행 모두 같은 문구를 쓴다.
- 학생 질문에는 자료 안에서 먼저 답하고 현재 과제를 유지한다. 개인정보·대필·이탈·종료 보호가 우선한다.
- 명시 힌트는 현재 기준의 승인된 sourceQuote를 보여주고 같은 과제에 머문다. 채점/기준 전진 없음, 도움받음 기록.
- 설명형: 학생이 실제 답변을 하면 응답을 수집한다. 출처 근거가 필요한 항목에서는 학생이 따옴표로 인용한 6자 이상 구절이 자료 본문에 있는지 검증한다. 일치 자체가 의미상 타당성/성취 충족을 뜻하지 않는다.
- 학생 질문형: 질문 생성이 학생 수행이다. 챗봇이 생성한 질문을 학생 성취로 세지 않는다. 요청/대필/힌트는 질문 생성 증거가 아니다.
- 자료 직접 인용을 켠 경우 설명형과 학생 질문형 모두 현재 학생 응답에 본문과 일치하는 인용이 있어야 수집 상태로 이동한다. 인용만 맞았다고 설명/질문의 질을 인정하는 것은 아니다.
- 근거가 부족하면 승인한 followUpQuestion 한 번으로 보충한다. 두 번째 실제 답변에도 부족하면 `needs_review`로 남겨 교사 확인 대상으로 이동한다. '넘어갈래요' 같은 명시 건너뛰기도 미충족 추정 없이 needs_review.
- `collected`는 응답/자료인용 형식 증거가 수집됐다는 뜻이며 자동 성적/성취 판정이 아니다. 모든 항목 순회를 마쳐도 needs_review가 남으면 교사 확인 필요를 안내한다. 최종 평가는 교사가 확정한다.
- 일반 rubricScores와 responseScore를 계획 판정에 혼용하지 않는다. 계획 진행 턴은 responseScore=null, 공통 rubricScores=[]; 별도 근거 표로 교사에게 제공한다.
- 전체 흐름은 무료 로컬 규칙으로 검증 가능해야 한다. 개인 API 키/새 외부 서비스 불필요. 중앙 plan/finalize digest는 진행상태까지 바인딩하며 정책 버전을 올린다.

## GAS 저장/교사 화면

- 열은 뒤에 추가만 한다: 수업 자료 `assessmentPlanJson`, 질문과 답변 `assessmentProgressJson`, 교사 평가 `criterionEvidenceJson`.
- prepared/candidate/duplicate recovery를 포함한 모든 관찰 whitelist에서 상태를 보존한다. 크기 제한 8,500 bytes를 기존처럼 지킨다.
- 기준별 증거 표는 불변 label/id, status, assisted/hintCount, answer/evidence requestId 및 해당 실제 학생 발화를 보여준다. 학생 내용을 textContent/Sheet 수식 이스케이프로 다룬다.
- 보충 응답이 첫 설명을 가리지 않도록 저장된 사건과 실제 행을 연결해 기준별 최대 2회 답변과 직전 챗봇 질문을 함께 표시한다. 도움/건너뛰기 사건은 답변 증거와 구분한다.
- 교사 초안은 마지막 수집/종료 턴과 generic 점수 0에도 저장한다. requestId 재시도는 중복 증거를 만들지 않는다. 새로운 증거는 교사 기존 피드백을 보존하되 재검수 필요로 바꾸고 reviewVersion에 포함한다.
- 예전 수업 revision의 recovery를 현재 계획의 기준명으로 해석하지 않는다.

## 검증

계획 정규화/승인/본문근거, UI 추가·삭제·승인취소·OFF/ON·저장 경쟁, 기준별 첫 질문·보충·힌트·질문 생성·건너뛰기·종료, 18턴 이후 상태유지, plan/finalize 일관성, 저장/재시도/교사 재검수, 개인정보/이탈/대필, 기존 일반대화 하위호환을 로컬에서 검사한다. 운영 키나 실제 학생 데이터는 테스트에 쓰지 않는다.

### 2026-09-17 로컬 확인 결과

- `npm run test:gas-lite`: 통과. 계획 엔진 22개, 중앙 통합 12개(실제 Node route handler 및 35턴/18행 이력 포함), 기존 대화 83개와 GAS 저장·UI·교사 검수·배포 패키지·요청 제한 검사.
- `npm run typecheck`, `npm run build`, 변경 JS/TS 파일 ESLint, `git diff --check`: 통과. Windows 빌드/자식 프로세스 제한은 같은 명령의 승인된 재실행으로 검증했다.
- `node evals/gas/run.mjs`: 기존 GAS 31개 통과.
- 실제 로컬 브라우저: 교사 승인, OFF/ON 보존, 저장 후 다시 열기, 질문 편집 시 승인 해제와 4단계 미승인 표시 확인. 교사 검수 표는 가상 학생 예제로 첫 설명과 보충 인용이 함께 표시됨을 확인했다.
- 전체 `npm run lint`는 기존 미수정 파일 `scripts/check-gas-browser.cjs`, `scripts/check-gas-conversation.cjs`, `scripts/test-gas-lightweight.cjs`의 require-import 규칙 오류 11개로 실패한다. 이번 변경 파일의 오류는 없다.
- 운영 Google Sheet/Apps Script/중앙 서버는 이 작업에서 갱신하지 않았다. Git push 및 배포 전 사용자 확인 필요.
