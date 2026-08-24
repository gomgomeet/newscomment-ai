# 질문 챗봇 제작보드 및 학생용 챗봇 PR 요약

## 요약

- 교사용 질문 챗봇 제작보드와 학생용 질문 챗봇 화면을 추가하고, 두 화면이 같은 설정을 공유하도록 구성했다.
- 생성형 AI 연결은 Gemini 기준으로 정리했고, 교사 개인 Gemini API 키를 사용하는 운영 모델을 PRD에 반영했다.
- Notion 준비 DB와 결과 DB 연동 구조를 추가해 성취기준, 질문 자료, 루브릭, 학생 질문·답변 기록을 교사 개인 Notion DB에 저장할 수 있게 했다.
- 공통 Vercel 웹앱 1개를 유지하고, Supabase는 교사별 수업 연결정보를 암호화해 저장하는 소량 금고로만 사용하는 방향을 정리했다.
- 학생용 화면은 질문 자료와 대화에 집중하도록 정리하고, 교사용 연결 상태나 AI 설정 정보는 노출하지 않는다.
- 학생 식별은 실명이나 모둠 선택이 아니라 학교, 반, 번호를 입력받고, 교사용 기록에서는 `학교_반_번호` 한 열로 합쳐 관리한다.
- 학생 답변은 질문 유형 분석보다 학생 발화에 먼저 반응하도록 조정했고, 직접적인 후속 질문 대신 짧은 격려 문장만 보여 준다.
- 제목을 보고 내용을 예측하는 질문은 제목을 그대로 반복하지 않고, 예측 가능성과 자료 확인을 나누어 답하도록 보강했다.

## 주요 변경

- `/questioning-board`: 성취기준 선택, 질문 자료 입력, 루브릭 확인, 학생용 챗봇 설정 저장, 평가 기록 엑셀 다운로드를 제공한다.
- `/questioning-chatbot`: 학생 정보 입력, 질문 자료 열고 닫기, 곰곰이 프로필이 포함된 질문 대화 화면을 제공한다.
- `/api/questioning-board/connections`: 교사별 Gemini 키, Notion 토큰, 자동 탐색된 준비 DB/결과 DB 연결값, 챗봇 설정을 Supabase에 암호화 저장하고 수업 코드로 조회한다.
- `/api/questioning-board/notion/preparation`: 교사용 보드의 수업 준비값을 Notion 준비 DB에 저장한다.
- `/api/questioning-board/chat`: Gemini 응답 실패 시 로컬 예비 응답으로 전환하고, Notion 결과 DB 환경변수가 있으면 학생별 `학교_반_번호` 페이지에 대화 결과를 누적한다.
- 질문 자료는 짧은 자료는 원문 전체를 보여 주고, 긴 지문 또는 교과서 지문은 `교과서를 살펴보세요.` 안내로 대체한다.
- 학생 화면에서는 질문 유형과 루브릭 분석을 보여 주지 않고, 학생의 질문과 생각에 먼저 응답하도록 조정했다.
- 교사용 보드의 `챗봇 질문 성격 메모`를 PRD와 Gemini 응답 규칙에 반영해, 교사가 의도한 질문 방향을 학생 응답 톤에 적용한다.
- `docs/QUESTIONING_CHATBOT_PRD.md`, `docs/QUESTIONING_CHATBOT_HANDOFF.md`, `docs/QUESTIONING_CHATBOT_NOTION_DB_TEMPLATE.md`, `docs/DEPLOYMENT_CHECKLIST.md`를 현재 운영 모델에 맞게 정리했다.

## 운영 모델 정리

- 1차 구현형: 같은 브라우저의 `localStorage`로 교사용 보드와 학생용 챗봇을 연결하고, 서버 환경변수로 Notion DB를 연결한다.
- 운영형: 교사별 Gemini API 키, Notion API 토큰, 자동 탐색된 준비 DB/결과 DB 연결값, 챗봇 설정을 Supabase `questioning_lesson_connections` 테이블에 암호화 저장하고 수업 코드로 불러온다.
- Supabase에는 학생 질문·답변 본문을 저장하지 않는다. 학생 활동 결과는 교사 개인 Notion 결과 DB에 저장한다.
- 권장 운영 기준은 연수 1회차 30-40명, 1차 목표는 월 누적 교사 400명 내외다.

## 검증

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## 배포 메모

- 권장 배포는 GitHub 브랜치/PR 푸시 후 Vercel 원격 빌드 방식이다.
- 로컬 `vercel build --prod`는 Windows 심볼릭 링크 권한 문제로 실패할 수 있다.
- 불가피하게 로컬 prebuilt 배포를 사용할 경우 관리자 권한 PowerShell 또는 Windows 개발자 모드에서 아래 순서로 진행한다.

```powershell
Remove-Item -Recurse -Force .vercel\output
vercel build --prod
vercel deploy --prebuilt --prod
```

## 남은 확인

- 학교 현장 PC에서 교사 개인 Gemini API 키를 연결한 뒤 학생 질문 응답을 실제 수업 자료로 테스트한다.
- 교사 개인 Notion 템플릿을 복제하고 준비 DB/결과 DB 저장 흐름을 확인한다.
- 다른 컴퓨터에서는 `codex/questioning-chatbot-closeout` 브랜치를 체크아웃하고 `.env.example`을 `.env.local`로 복사한 뒤 개인 키를 다시 입력한다.
- 운영형 후속 작업에서는 Supabase 마이그레이션을 실제 프로젝트에 적용하고, 교사별 로그인·권한 분리·수업 코드 만료 관리를 보강한다.
