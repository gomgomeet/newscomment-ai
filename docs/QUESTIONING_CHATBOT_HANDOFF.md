# 질문 챗봇 작업 인수인계

## 현재 상태

- 교사용 제작보드: `/questioning-board`
- 학생용 챗봇: `/questioning-chatbot`
- 작업 브랜치: `codex/questioning-chatbot-closeout`
- 학생은 학교·반·번호를 입력하고 `학교_반_번호` 형식으로 기록된다.
- 교사는 성취기준, 질문 자료, 루브릭, 챗봇 동작을 준비하고 수업 코드로 학생 화면에 연결할 수 있다.
- 질문 자료와 대화 결과는 교사 Notion 준비 DB·결과 DB에 저장할 수 있다.
- Supabase는 수업 코드와 암호화된 교사 연결정보만 보관하며 학생 대화 본문 저장소로 사용하지 않는다.

## V2 대화정책 적용 완료

- 학생 응답의 단일 원본을 `studentReply`로 전환했다.
- 학생 화면의 고정 격려 상자를 제거했다.
- 성취기준을 `curriculumCompass`라는 보이지 않는 대화 방향으로 변환한다.
- 한 턴에 한 가지 교수 동작을 우선한다.
- 질문은 유용할 때만 최대 한 개 사용한다.
- 학생이 막히면 낮은 부담의 단서를 주고, 반복감이나 짜증에는 관계를 회복한다.
- 학생이 대화를 끝내려 하면 질문 없이 마친다.
- 이전 `answer`, `followUpQuestion`은 저장 데이터 호환용으로만 유지한다.

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

평가 하네스는 가상 기사 15개를 사용한다. 개선에 사용하는 개발 세트 30회기 120턴과, 새 기사·학생 반응으로 구성한 홀드아웃 10회기 40턴을 분리해 실제 로컬 API에 재생한다.

최종 결과:

```text
40 sessions
160 turns
0 failures
0 review flags
```

검사 항목은 V2 응답, 빈 응답, 한 턴 최대 한 질문, 내부 정보 비노출, 종료 일관성, 관계 회복, 복사 요구, 인과 과장, 반복 문장, 기계적 문구다. 최초 확장 실행의 실패 19건과 검토 플래그 95건을 오류 유형별로 수정한 결과다.

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
- `docs/QUESTIONING_CHATBOT_PR_SUMMARY.md`
- `docs/GENERAL_TEACHER_STANDALONE_HTML_CHATBOT_PROMPT.md`
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

## 다음 단계

1. 교사 2명 이상의 블라인드 비교로 자연스러움, 질문 소유권, 적응적 발판, 자료 근거, 종료를 채점한다.
2. 이번 홀드아웃은 수정 근거로 사용됐으므로 현재 fixture에 없는 새 기사·교과·학생 유형으로 다음 홀드아웃을 만든다.
3. 제공자 약관, 개인정보, 학교·기관 승인을 확인한 뒤에만 제한적 학생 파일럿을 설계한다.
4. Notion·Supabase 운영 연결과 수업 코드 만료를 실제 배포 환경에서 통합 시험한다.
5. 다중 인스턴스 운영 전 메모리 요청 제한을 공유 저장소 기반으로 교체한다.

## 현재 한계

- 40회기 결과는 시나리오 기반 합성 학습자 다중 턴 형성평가이며 실제 학습 효과 연구가 아니다.
- 홀드아웃도 한 차례 수정에 사용됐으므로 일반화 성능의 확정치로 해석할 수 없다.
- 자동평가 질문 턴 비율은 5%다. 교사 평가에서 질문 기회를 지나치게 줄였는지 확인해야 한다.
- 학생용 외부 LLM은 현재 기본 차단 상태다.
