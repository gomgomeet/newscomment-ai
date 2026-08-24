# 질문 챗봇 작업 인수인계

## 현재 완료 상태

- 교사용 제작보드: `/questioning-board`
- 학생용 챗봇: `/questioning-chatbot`
- 학생용 제목: `챗봇에게 질문하기`
- 학생 첫 화면은 모둠 선택 없이 학교·반·번호만 입력한다.
- 교사용 평가 기록에서는 학생명 대신 `학교_반_번호` 한 열로 관리한다.
- 질문 자료는 교사용 보드에서 입력한 전체 텍스트를 생략하지 않고 표시한다.
- 질문 대화 상단의 `채팅 시작`을 누르면 챗봇이 먼저 인사한 뒤 입력창이 활성화된다.
- 학생의 질문·대답·생각을 먼저 받아 주고, 자료와 연결한 응답 뒤에는 직접적인 후속 질문 대신 짧은 격려 문장만 제시한다.
- 제목을 보고 내용을 예측하는 질문은 제목을 그대로 다시 읽어 주지 않고, 학생의 예상을 받아 준 뒤 자료에서 확인할 점을 안내한다.
- 교사용 보드의 `챗봇 질문 성격 메모`는 PRD와 Gemini 응답 규칙에 반영되며, 학생에게는 메모 원문을 노출하지 않는다.
- 질문 유형과 루브릭 분석은 교사용 내부 정보로만 유지하며 학생 화면에는 표시하지 않는다.
- 학생 화면에서 평가 기준, 질문 분석, 질문 활동 기록 작성란을 제거했다.
- API를 사용할 수 없을 때는 원문에서 관련 문장을 찾는 로컬 응답으로 전환한다.
- 교사용 보드 4번 영역에서 PRD 복사와 학생용 챗봇 열기 버튼을 제거하고, `노션 준비 DB에 저장` 뒤 `현재 설정을 챗봇에 적용` 순서로 정리했다.
- Notion 환경변수가 설정되어 있으면 수업 준비값은 준비 DB에 저장되고, 학생 질문과 챗봇 답변은 결과 DB의 `학교_반_번호` 페이지에 누적된다.
- 운영형 PRD에는 공통 Vercel 웹앱 1개, 교사 개인 Gemini API, 교사 개인 Notion API/DB, 소량 Supabase 연결정보 저장 구조를 반영했다.
- Supabase는 학생 대화 본문 저장소가 아니라 교사별 Gemini 키, Notion 토큰, 자동 탐색된 DB 연결값, 수업 코드를 암호화해 보관하는 연결정보 금고로만 사용한다.
- `questioning_lesson_connections` 마이그레이션과 `/api/questioning-board/connections` route를 추가해 수업 코드 기반 연결 저장·조회 1차 구현을 넣었다.

## 대화 품질 리서치 및 프리파일럿 완료

- `docs/QUESTIONING_CHATBOT_LLM_RESEARCH.md`에 교육적 대화 원리, LLM 구조, 현재 PR 진단, 아동 안전, 평가 방법을 통합했다.
- 성취기준을 매 턴 달성할 목표가 아니라 학생의 관심과 질문이 교육적으로 의미 있는 방향을 잃지 않게 하는 보이지 않는 나침반으로 재정의했다.
- `docs/QUESTIONING_CHATBOT_10_SESSION_SYNTHETIC_DIALOGUE_EVALUATION.md`에 가상 기사 6개, 성취기준 8개, 합성 학생 페르소나 10개를 조합한 다중 턴 형성평가를 기록했다.
- `docs/QUESTIONING_CHATBOT_RESEARCH_APPLICATION_PLAN.md`에 타입, API, UI, fallback, Notion, 평가, 미성년자 제공자 차단을 포함한 단계별 적용 계획을 정리했다.
- 10회기에서 학생 발화 40개와 챗봇 응답 40개를 검토했다.
- 자료 근거와 불확실성 구분은 비교적 안정적이었지만, 자연스러운 리듬, 설명량 조절, 생산적 곁가지, 종료 처리는 개선이 필요했다.
- 현재의 직접 후속 질문 전면 금지와 학생 화면의 고정 격려 문장은 완료된 최종 설계가 아니라 다음 구현에서 바꿔야 할 대상으로 확인됐다.
- 이 평가는 실제 학생 실험이나 운영 Gemini 모델 벤치마크가 아니다. 교사 블라인드 비교와 별도 승인된 제한적 학생 파일럿이 뒤따라야 한다.

## 현재 질문 자료

- 제목: `급식실 남은 음식, 석 달 만에 '절반'으로`
- 전체 원문과 챗봇 설정은 현재 브라우저의 `localStorage`에 연결되어 있다. Notion DB 환경변수를 설정하면 같은 내용을 준비 DB에도 저장할 수 있다.
- API 키도 저장할 경우 같은 브라우저의 `localStorage`에만 보관하며 코드와 문서에는 넣지 않는다.

## 함께 만든 수업 자료

- `output/presentations/questioning_lesson_student_guide.pptx`
- `output/docx/챗봇_질문하기_학습지_초3-4.docx`
- `output/pdf/questioning_pre_chat_worksheet.pdf`
- `output/html/chatbot-question-worksheet-grade3-4.html`

## 검증 완료

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- 브라우저에서 채팅 시작 전 입력 비활성화 확인
- `채팅 시작` 클릭 후 챗봇 첫 인사와 입력 활성화 확인
- 학생 질문 응답과 이어지는 학생 발화를 자연스럽게 받아 주는 두 턴 대화 확인
- 학생 화면에 질문 유형·평가 기준·활동 기록이 노출되지 않는지 확인

## 다음 작업 순서

1. 학생용 Gemini 호출을 기본 차단하고 학생 컴포넌트의 교사 API 키 읽기·전송을 제거한다.
2. 응답 스키마에 `studentReply`, `expectsStudentReply`, `isClosing`을 호환 필드로 먼저 추가한다.
3. 학생 화면의 고정 격려 상자를 제거하고 모델이 만든 완성된 `studentReply` 한 말풍선만 표시한다.
4. 학생이 실제로 본 전체 응답을 다음 대화 이력에 포함한다.
5. 10회기 40교환을 회귀 평가 세트로 고정해 변경 전후 응답을 비교한다.
6. `curriculumCompass`, `primaryMove`, `engagementState`, `curriculumRelation`, `supportLevel`, `repair`를 적용한다.
7. 직접 후속 질문 전면 금지를 조건부 질문 정책으로 바꾸고 로컬 fallback에도 같은 상태·반복·종료 정책을 적용한다.
8. 교사 두 명 이상의 블라인드 비교로 자연스러움, 질문 소유권, 적응적 발판, 자료 근거, 종료를 검토한다.
9. 학생용 제공자 약관, 개인정보, 학교 승인이 완료되기 전에는 교사용 미리보기와 학생용 로컬 모드만 사용한다.
10. Notion·Supabase 운영 연결은 품질·안전 변경 뒤 다시 통합 시험한다.

## 배포형 구현 제안

- 교사용 보드의 `노션 준비 DB에 저장` 버튼으로 성취기준, 질문 자료, 루브릭, 챗봇 설정을 Notion 준비 DB에 저장한다.
- 학생용 챗봇 주소는 `/questioning-chatbot`으로 유지하고, 교사용 보드에서 적용한 최신 설정을 따른다.
- 학생은 모둠 선택 없이 학교·반·번호만 입력하고 챗봇을 사용한다.
- 교사용 보드와 엑셀 기록에는 `학교_반_번호` 형식으로 합쳐 보여 준다.
- 학생 질문, 챗봇 답변, 내부 질문 분류, 다시 쓴 질문, 성찰 내용을 Notion 결과 DB의 `학교_반_번호` 페이지에 누적한다.
- 교사용 보드의 평가 기록 영역은 이후 Notion 결과 DB에 모인 결과를 학생별로 불러오도록 확장한다.
- 엑셀 다운로드는 서버에 저장된 학생 결과를 기준으로 생성한다.
- 교사 API 키는 학생 페이지에 전달하지 않고 서버 API에서만 사용한다.
- 여러 교사가 같은 웹앱을 사용할 때는 Supabase에 수업 코드와 암호화된 교사별 연결정보만 저장하고, 학생 활동 본문은 교사 개인 Notion 결과 DB에 저장한다.
- 웹앱 서버를 회차마다 복제하지 않는 운영을 기본값으로 두되, 학교별 폐쇄망·별도 도메인·별도 운영자가 필요한 경우에만 Vercel 프로젝트 복제를 검토한다.
- 학생 링크는 `/questioning-chatbot?lesson=수업코드` 형식으로 만들며, 학생 화면에서 수업 코드를 직접 입력해 불러올 수도 있다.

## 시작 명령

```powershell
npm run dev
```

기본 주소는 `http://localhost:3000`이다. 학교 공용 PC에서는 수업 종료 후 교사용 보드의 API 키를 반드시 지운다.

## 다른 컴퓨터에서 이어 하기

1. 저장소를 내려받고 현재 작업 브랜치로 이동한다.

```powershell
git clone https://github.com/gomgomeet/newscomment-ai.git
cd newscomment-ai
git checkout codex/questioning-chatbot-closeout
npm install
```

2. 로컬 환경변수를 준비한다. 실제 키는 문서나 저장소에 넣지 않고 각 컴퓨터의 `.env.local`에만 둔다.

```powershell
Copy-Item .env.example .env.local
```

3. 최소 확인값은 다음이다.

```text
NEXT_PUBLIC_SUPABASE_URL=<Supabase Project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
SUPABASE_SECRET_KEY=<Supabase secret key>
QUESTIONING_SECRET_ENCRYPTION_KEY=<직접 만든 긴 랜덤 문자열>
```

4. 개발 서버를 실행한다.

```powershell
npm run dev
```

5. 확인할 주소는 `http://localhost:3000/questioning-board`와 `http://localhost:3000/questioning-chatbot?lesson=수업코드`이다.

## Windows 빌드 오류 메모

Codex 일반 샌드박스에서 `npm run build`가 아래 오류로 멈출 수 있다.

```text
Error: spawn EPERM
```

이 현상은 확인 결과 코드 오류가 아니라 현재 실행 환경이 `C:\Program Files\nodejs\node.exe`를 하위 프로세스로 실행하지 못해서 생긴다. 같은 코드에서 권한 상승 실행으로 `npm run build`는 통과했다.

진단 명령은 다음과 같다.

```powershell
node -e "const {spawnSync}=require('child_process'); const r=spawnSync(process.execPath,['-e','console.log(123)'],{encoding:'utf8'}); console.log(r.error || r.stdout)"
```

이 명령도 `spawnSync ... EPERM`을 출력하면 Next.js 문제가 아니라 터미널/샌드박스 권한 문제다. 다른 컴퓨터에서는 일반 PowerShell에서 먼저 `npm run build`를 실행하고, 실패하면 관리자 권한 PowerShell, Windows 개발자 모드, 또는 GitHub 브랜치 푸시 후 Vercel 원격 빌드를 사용한다.
