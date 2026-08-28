# 과정중심평가 준비 프렙 구현 계획

이 문서는 `skills/edu-rubric/SKILL.md`의 평가 준비 원칙을 교사 대시보드의 실제 기능으로 옮기는 계획이다.
목표는 교사가 Notion 토큰만 연결하는 설정 화면을 만드는 것이 아니라, **수업 목표부터 평가 증거·루브릭·학생 안내·AI 안전 규칙·샘플 검증까지 한 흐름으로 준비하는 프렙**을 만드는 것이다.

Notion은 학생 결과물을 읽어오는 입력원으로 사용한다. AI 평가 초안, 교사 판단,
평가 포워드와 누적 성장 기록의 기준 저장소는 Supabase 평가 대시보드다.
교사가 최종 평가를 확정한 뒤에는 선택한 결과를 **명시적으로 한 번 내보내어**
사용자 Notion 워크스페이스에 페이지로 만들거나 PDF로 내려받을 수 있다.
이 내보내기는 양방향 동기화나 평가 원본의 이중 저장이 아니다.

현재 1차 연결 화면은 기존 데이터 구조를 이용해 다음 흐름을 바로 확인하도록 구현한다.

```text
평가 목표 → 성취기준 → 평가 기준 → Notion 읽기 → 결과물 수집 → 교사 평가 → 성장 기록
```

- `/dashboard/prep`에서 수업활동별 6단계 연결 상태와 다음 행동을 표시한다.
- 대시보드와 수업활동 화면에서도 동일한 준비 상태를 표시한다.
- Notion 가져오기는 데이터베이스 속성뿐 아니라 학생이 복제한 **각 페이지 본문**도 읽을 수 있다.
- Notion 원본은 수정하지 않으며, 가져온 결과물과 교사 확정 평가는 Supabase 평가 흐름에서 관리한다.
- 교사별 암호화 토큰, 프렙 버전, 결과물 수정본과 평가 포워드 이력은 후속 마이그레이션에서 추가한다.

데이터의 기준 구조는 다음과 같다.

```text
projects                         평가활동
  └─ comments                    Notion에서 읽어온 원결과물
      └─ evaluations             AI 초안·교사 평가
          └─ evaluation_scores   기준별 점수와 근거
  └─ student_activity_results    학생별 활동 최종결과·평가 포워드

students
  └─ student_activity_results    활동별 타임라인
      └─ student_term_summaries  누적 성장·세특 근거·교사 확정본
```

## 1. 제품 원칙

프렙은 다음 원칙을 강제하거나 교사에게 확인시킨다.

- 학생의 찬성·반대 입장이 아니라 사용한 근거의 질을 평가한다.
- 추상적인 인상 대신 결과물에서 찾을 수 있는 관찰 가능한 증거를 정의한다.
- 수준별 기술문은 부사만 바꾸지 않고 서로 다른 행동 증거로 구분한다.
- AI는 먼저 원문 증거를 찾고, 그다음 점수 초안을 제안한다.
- 글이 짧다는 이유만으로 감점하지 않는다.
- 근거가 없거나 판단이 애매하면 점수를 단정하지 않고 교사 검토를 요청한다.
- AI 초안과 교사의 최종 판단을 분리하고 둘 다 이력으로 남긴다.
- 교사용 루브릭과 학생용 자기평가 언어를 분리한다.

## 2. 현재 구현과 스킬 요구사항의 차이

| 스킬이 요구하는 산출물 | 현재 구현 | 프렙 반영 계획 |
| --- | --- | --- |
| 성취기준 코드와 원문 | 코드·요약 일부 저장 | 코드, 원문, 출처, 적용 이유를 구조화 |
| 활동·학년·교과·용도 | 학교급과 기사 주제만 입력 | 활동 유형, 학년, 교과, 평가 용도 추가 |
| 핵심 영역 기본 3개 | 학교급별 4~7개 고정 생성 | 3영역 기본값과 7요소 확장형 선택 제공 |
| 4수준 배타적 기술문 | 한 설명 문자열에 4수준을 합쳐 저장 | 수준별 descriptor를 별도 구조로 저장·편집 |
| 관찰 가능한 평가 증거 | 별도 필드 없음 | 기준마다 evidence indicators 저장 |
| AI 지시 문장 | 별도 필드 없음 | 기준마다 evidence prompt 저장 |
| 낮은/높은 수준 학생 문장 | 없음 | 기준별 contrast examples 저장 |
| 학생 자기평가 체크리스트 | 없음 | 학생용 문장으로 별도 생성·편집 |
| 입장이 다른 모범 예시 2개와 짧은 예시 | 없음 | exemplar 3개와 기준별 근거 매핑 저장 |
| 수업 활용 팁 | 없음 | prep teacher guidance에 저장 |
| AI 안전 규칙 | 프롬프트 일부에만 존재 | 프렙 활성화 전 필수 정책으로 확인 |
| Notion 연결 | 서버 공용 읽기 토큰 | 교사별 암호화 연결과 결과물 읽기 전용 매핑 |

## 3. 교사 화면 흐름

### 3.1 대시보드 준비 배너

대시보드 상단에 `과정중심평가 준비` 배너를 둔다.

```text
과정중심평가 준비  3/6 완료
✓ Notion 연결  ✓ 결과물 DB  ✓ 성취기준
○ 평가 목표   ○ 루브릭 검토  ○ 샘플 평가
[준비 이어서 하기]
```

- 준비 전: 큰 배너와 다음 행동 표시
- 준비 중: 완료 단계와 막힌 단계 표시
- 준비 완료: 한 줄 상태로 접고 `설정 수정` 제공
- 연결 또는 루브릭이 깨진 경우: 다시 펼쳐 경고 표시

### 3.2 `/dashboard/prep` 단계형 마법사

1. **수업 맥락**
   - 활동명, 활동 유형, 학교급·학년, 교과
   - 수업 자료·주제, 평가 용도(교사/학생/AI)
2. **성취기준과 목표**
   - 추천 성취기준 선택 또는 직접 입력
   - 성취기준 원문과 출처
   - 이번 수업에서 실제로 확인할 평가 목표
3. **Notion 연결**
   - 교사 토큰 입력, 서버 연결 시험
   - 학생 결과물 DB 선택
   - 학생 식별자·본문·활동·수정본 속성 매핑
4. **루브릭 설계**
   - 기본 3영역, 0~5점형, 5수준형, 7요소 확장형 선택
   - 영역별 수준 기술문·관찰 증거·AI 지시·대조 예시 편집
5. **학생 안내와 모범 예시**
   - 자기평가 체크리스트
   - 서로 다른 입장의 모범 예시 2개와 짧은 예시
   - 예시 속 평가 증거 매핑
6. **안전 규칙과 시험 평가**
   - AI 안전 규칙 확인
   - 가짜 또는 선택한 결과물 3건으로 dry run
   - 교사 검토 사유와 대시보드 저장 미리보기
   - `이 평가안 활성화`로 명시적 확정

## 4. 데이터 모델

마이그레이션 구현 시 먼저 현재 Supabase CLI의 `--help`와 변경 내역을 확인하고,
`supabase migration new assessment_prep`으로 파일을 만든다.

### 4.1 `assessment_preps`

프렙의 루트이며 교사별 준비 상태와 활성 버전을 가진다.

| 열 | 용도 |
| --- | --- |
| `id` | UUID |
| `owner_id` | `auth.users.id`, 소유 교사 |
| `project_id` | 선택된 수업활동 |
| `title` | 평가 준비안 이름 |
| `activity_type` | 댓글쓰기·발표·보고서 등 |
| `school_level`, `grade`, `subject` | 수업 맥락 |
| `assessment_purposes` | 교사 채점·자기평가·AI 평가 |
| `learning_goal` | 이번 수업의 평가 목표 |
| `status` | `draft/tested/active/archived` |
| `current_version` | 활성 버전 번호 |
| `completed_steps` | 준비 단계 상태 JSON |
| `created_at`, `updated_at` | 감사·정렬 |

RLS는 `owner_id = auth.uid()` 조건을 SELECT/INSERT/UPDATE/DELETE에 각각 적용하고,
UPDATE에는 `USING`과 `WITH CHECK`를 모두 둔다.

### 4.2 `assessment_prep_versions`

활성화된 평가안을 덮어쓰지 않고 불변 스냅샷으로 남긴다.

- 성취기준 배열: 코드, 원문, 출처, 적용 이유
- 평가 목표와 제외할 판단
- 척도 설정과 총점
- 학생 체크리스트
- 모범 예시와 기준별 근거 매핑
- 수업 활용 팁
- AI 안전 정책
- 내보내기용 보고서 섹션 구성
- 생성 모델·프롬프트 버전

초기 구현은 문서 성격이 강한 필드를 `jsonb` 스냅샷으로 보존하되,
실제 채점과 집계에 쓰는 기준과 수준은 정규화한다.

### 4.3 `rubric_criteria` 확장

기존 평가와 호환되도록 현재 열은 유지하고 다음을 추가한다.

- `essential_question`: 이 영역에서 보는 것
- `evidence_indicators jsonb`: AI와 교사가 찾을 관찰 증거
- `evidence_prompt`: 점수가 아닌 증거 탐색 지시
- `low_example`, `high_example`: 학생 언어 대조 예시
- `student_check_item`: 학생 자기평가 문장

### 4.4 `rubric_level_descriptors`

수준 기술문을 하나의 description 문자열에서 분리한다.

- `criterion_id`
- `score`
- `level_label`
- `descriptor`
- `evidence_required jsonb`
- `sort_order`

기준과 점수 조합을 unique로 하고, 기준 소유 루브릭을 통해 교사 권한을 확인한다.

### 4.5 `teacher_notion_connections`

교사별 Notion 연결을 서버 전용으로 저장한다.

- `owner_id`
- `token_ciphertext`
- `workspace_label`
- `capabilities`: 결과물 읽기, 선택적 페이지 생성 권한
- `export_parent_page_id`: 보고서 페이지를 만들 승인된 상위 페이지
- `last_verified_at`
- `status`
- `last_error_code`

토큰은 브라우저에 되돌려 보내지 않는다. 로그인 사용자를 확인한 Server Action에서만
암호화·연결 시험을 수행한다. 기존 `QUESTIONING_SECRET_ENCRYPTION_KEY`와 용도를 섞지 않고
평가 연결 전용 서버 키를 둔다. 테이블을 Data API에 공개하지 않는 구성을 우선한다.

### 4.6 `assessment_notion_mappings`

- prep/project와 Notion 결과물 DB 연결
- 학생 식별자, 원문, 수정본, 활동명, 상태 속성 매핑
- 읽기 동의 상태, 마지막 동기화 cursor, 원본 페이지 ID

가져온 결과물은 Notion 페이지 ID와 마지막 수정 시각으로 중복을 막고, 평가 원본은
Supabase에만 저장한다. 선택적 보고서 내보내기 대상은 소스 매핑과 분리한다.

### 4.7 `student_activity_results`

기존 `evaluations`는 결과물 하나에 대한 평가다. 여러 결과물 또는 수정본을 포함한
**학생 한 명의 평가활동 최종결과**는 별도로 저장한다.

- `owner_id`, `project_id`, `student_key`
- `status`: `draft/review_required/teacher_confirmed`
- `final_score`, `max_score`
- `criterion_summary jsonb`: 기준별 최종 점수·근거·교사 확인
- `strengths`, `growth_needs`
- `feedback_forward`: 다음 활동에서 학생이 시도할 구체적 행동
- `teacher_decision`, `teacher_note`
- `evidence_refs jsonb`: 원결과물·수정본·평가 근거 ID
- `prep_version`, `rubric_version`
- `confirmed_at`, `created_at`, `updated_at`

`project_id + student_key`를 unique로 두되, 재평가 이력은 별도 revision 테이블 또는
불변 스냅샷으로 보존한다. `student_key`는 실명 대신 학교·반·번호 또는 교사 관리용
비식별 키를 사용한다.

### 4.8 `student_growth_records`

평가활동 간 변화를 기록한다. 단순 점수 평균이 아니라 이전 평가 포워드가 다음 활동에서
어떻게 반영되었는지를 근거와 함께 저장한다.

- `owner_id`, `student_key`
- `from_activity_id`, `to_activity_id`
- `criterion_id` 또는 안정적인 criterion key
- `previous_evidence`, `current_evidence`
- `change_type`: `emerging/improving/stable/needs_support/not_observed`
- `feedback_forward_response`
- `teacher_confirmed`

### 4.9 `student_term_summaries`

여러 평가활동을 묶은 학기·기간별 종합 결과다.

- `owner_id`, `student_key`, `period_label`
- 포함한 `project_ids`와 활동 결과 버전
- 기준별 성장 요약
- 반복해서 확인된 강점과 보완점
- 평가 포워드 반영 사례
- `special_record_evidence jsonb`: 세특에 사용할 관찰 사실과 원근거
- `special_record_draft`: AI 초안
- `teacher_final_text`: 교사 확정 문장
- `status`: `draft/review_required/teacher_confirmed`

세특 초안은 항상 근거 ID를 가져야 하며, 원자료에 없는 성장 서사를 만들지 않는다.
교사가 확정하기 전에는 최종 결과로 표시하거나 내보내지 않는다.

### 4.10 `assessment_exports`

교사가 확정 평가를 외부 문서로 내보낸 감사 기록이다.

- `owner_id`, `project_id`, `evaluation_id` 또는 `report_scope`
- `format`: `notion_page/pdf`
- `status`: `requested/completed/failed`
- `content_hash`: 같은 버전의 중복 내보내기 경고
- `source_version`: 평가·프렙 버전
- `external_page_id`, `external_url`: Notion 내보내기 성공 시에만 저장
- `file_name`: PDF 내보내기 이름
- `error_code`, `created_at`, `completed_at`

내보내기 기록에는 토큰이나 PDF 본문을 저장하지 않는다. Notion 저장 실패가 평가 원본을
바꾸지 않으며, 교사가 재시도하거나 PDF 경로로 전환할 수 있어야 한다.

## 5. 애플리케이션 구조

### 새 경로

- `app/dashboard/prep/page.tsx`: 준비 배너에서 진입하는 프렙 목록/현재 상태
- `app/dashboard/prep/[prepId]/page.tsx`: 단계형 편집 화면
- `app/dashboard/prep/actions.ts`: 생성·저장·활성화 Server Actions
- `app/dashboard/prep/[prepId]/notion/actions.ts`: 토큰 검증·DB 조회·매핑 시험
- `app/dashboard/prep/[prepId]/preview/page.tsx`: 완성 문서와 dry run 결과
- `app/dashboard/reports/[reportId]/page.tsx`: 확정 평가 보고서 미리보기와 내보내기
- `app/dashboard/reports/[reportId]/actions.ts`: Notion 페이지 생성 요청
- `app/dashboard/reports/[reportId]/pdf/route.ts`: 서버 PDF 생성·다운로드
- `app/dashboard/projects/[projectId]/results/page.tsx`: 평가활동별 최종결과 보드
- `app/dashboard/students/[studentKey]/page.tsx`: 학생별 활동 타임라인과 성장 보기
- `app/dashboard/growth/page.tsx`: 성장 기록 보드의 활동·학생 누적 개요
- `app/dashboard/students/[studentKey]/summary/page.tsx`: 학생 종합 기록 편집 화면

### 새 컴포넌트

- `components/assessment-prep/prep-banner.tsx`
- `components/assessment-prep/prep-stepper.tsx`
- `components/assessment-prep/context-step.tsx`
- `components/assessment-prep/standards-step.tsx`
- `components/assessment-prep/notion-step.tsx`
- `components/assessment-prep/rubric-builder.tsx`
- `components/assessment-prep/student-guide-step.tsx`
- `components/assessment-prep/dry-run-step.tsx`
- `components/reports/export-panel.tsx`
- `components/reports/report-preview.tsx`
- `components/results/activity-result-board.tsx`
- `components/results/teacher-review-queue.tsx`
- `components/results/student-activity-row.tsx`
- `components/students/growth-timeline.tsx`
- `components/students/criterion-growth-chart.tsx`
- `components/students/special-record-editor.tsx`

### 도메인 모듈

- `lib/assessment-prep/schema.ts`: 입력 검증과 타입
- `lib/assessment-prep/readiness.ts`: 6단계 완료 조건
- `lib/assessment-prep/rubric-builder.ts`: `edu-rubric` 규칙의 결정적 생성 로직
- `lib/assessment-prep/prompt.ts`: AI 사용 시 구조화 출력 프롬프트
- `lib/assessment-prep/notion-connection.ts`: 암호화된 교사 연결
- `lib/assessment-prep/notion-mapping.ts`: DB 속성 검증
- `lib/assessment-prep/versioning.ts`: 활성화 스냅샷 생성
- `lib/reports/build-assessment-report.ts`: Notion/PDF가 공유하는 보고서 모델
- `lib/reports/notion-export.ts`: 명시적 Notion 페이지 생성
- `lib/reports/pdf-export.ts`: 보고서 PDF 렌더링

## 5.1 결과 내보내기 UX

확정된 평가 결과 화면에 `결과 내보내기` 패널을 둔다.

1. 범위 선택: 학생 1명, 선택 학생, 학급 요약
2. 포함 항목 선택: 점수, 원문 증거, 교사 피드백, 평가 포워드, 성장 변화
3. 개인정보 미리보기와 학생 식별 방식 확인
4. 출력 선택
   - `Notion 페이지로 저장`: 쓰기 권한이 승인된 연결이 있을 때
   - `PDF 다운로드`: 별도 Notion 권한 없이 항상 제공
   - `Notion용 Markdown 복사`: 자동 페이지 생성이 불가능할 때 대체 경로
5. 교사가 미리보기를 확인한 뒤 실행

Claude와 Notion이 이미 연결된 수업 환경이라도 그 권한이 이 웹앱으로 자동 전달되지는
않는다. 자동 페이지 생성을 쓰려면 앱 자체의 Notion Integration/OAuth 승인이 필요하다.
PDF와 Markdown 복사는 이 추가 승인이 없어도 동작해야 한다.

## 5.2 평가 결과 보드

### 평가활동별 보드

`/dashboard/projects/[projectId]/results`에서 다음을 한눈에 본다.

- 제출·AI 평가·교사 확정 진행률
- `교사 검토 필요`, `근거 부족`, `재작성 권장`, `성장 확인` 필터
- 학생별 기준 점수, 원문 근거, 교사 메모, 평가 포워드
- 학급 기준별 분포와 취약 기준
- 이전 활동 대비 큰 변화와 좋은 예시 후보

### 학생별 누적 보드

`/dashboard/students/[studentKey]`에서 다음을 본다.

- 평가활동별 결과 타임라인
- 기준별 변화
- 이전 평가 포워드와 다음 결과물의 반영 증거
- 반복되는 강점·보완점
- 교사가 확정한 피드백 이력

### 성장 기록 보드와 종합 기록 편집

- 포함할 평가활동 선택
- 세특에 사용할 관찰 사실과 원근거 검토
- 위험하거나 근거가 부족한 표현 표시
- AI 초안과 교사 수정본 나란히 보기
- 교사 확정 후에만 PDF·Notion·Markdown 내보내기

## 6. 생성 방식

프렙 생성은 두 층으로 나눈다.

1. **규칙 기반 생성**
   - 척도, 총점, 필수 안전 규칙
   - 학교급별 기본 영역
   - 기존 성취기준 카탈로그
   - 저장 구조와 필수 필드
2. **AI 보조 생성**
   - 수준별 행동 기술문
   - 낮은/높은 예시
   - 자기평가 문장
   - 상반된 입장의 모범 예시

AI 출력은 구조화된 스키마로 검증하고, 실패하면 규칙 기반 초안으로 돌아간다.
AI가 만든 평가안은 `draft`이며 교사가 수정하고 dry run을 확인하기 전에는 활성화하지 않는다.

## 7. 단계별 코딩 계획

### 0단계 — 계약과 테스트 고정

- `edu-rubric`의 7개 산출 블록을 TypeScript 타입과 fixture로 표현
- 4수준·0~5점·5수준·7요소 변형 fixture 작성
- 기존 루브릭과 평가 저장 흐름의 회귀 테스트 범위 결정

완료 기준:

- 모든 프렙 산출물이 타입으로 표현된다.
- 입장 평가 금지와 AI 안전 규칙이 필수 필드다.

### 1단계 — 프렙 골격과 준비 배너

- `assessment_preps`와 버전 테이블 추가
- 대시보드 배너 및 `/dashboard/prep` 생성
- 수업 맥락·성취기준·평가 목표 저장
- 기존 뉴스 기사 루브릭 생성기를 프렙 진입점으로 연결

완료 기준:

- 교사가 준비도를 0/6~6/6으로 확인할 수 있다.
- 새로고침·재로그인 후에도 진행 단계가 유지된다.
- 다른 교사의 프렙은 조회·수정할 수 없다.

### 2단계 — 완결형 루브릭 편집기

- 수준 기술문 분리 저장
- 관찰 증거, AI 지시, 대조 예시, 학생 체크리스트 편집
- 3영역 기본형과 척도 변형 지원
- 완성 문서 미리보기 제공

완료 기준:

- 스킬의 7개 블록이 순서대로 렌더링된다.
- 수준 기술문 누락·중복·총점 불일치를 활성화 전에 차단한다.
- 교사용 언어와 학생용 언어가 별도 필드다.

### 3단계 — 교사별 Notion 연결

- 토큰 암호화 저장, 교체, 연결 해제
- 연결 시험 후에만 저장 완료 처리
- 결과물 DB 선택과 읽기 속성 매핑
- 선택 사항으로 보고서 페이지를 만들 상위 페이지와 쓰기 권한 확인
- 토큰 마스킹 상태와 마지막 검증 시각 표시

완료 기준:

- 토큰이 HTML, RSC payload, 로그, 오류 메시지에 나타나지 않는다.
- 연결한 교사만 자신의 매핑을 사용할 수 있다.
- 권한 부족과 DB 미공유를 서로 다른 안내로 보여준다.
- Notion 쓰기 권한 없이 결과물 가져오기가 동작한다.
- 쓰기 권한이 없어도 PDF·Markdown 내보내기를 사용할 수 있다.

### 4단계 — dry run과 활성화

- 샘플 결과물 3건 평가
- 원문 증거 → 기준 판정 → 점수 초안 순서 표시
- 낮은 확신도·근거 부족·모순을 교사 검토 대상으로 표시
- 교사가 수정한 뒤 버전 스냅샷 활성화

완료 기준:

- 원문에 없는 내용을 근거로 사용한 결과는 승인할 수 없다.
- 교사 수정 전후와 사용한 프렙 버전이 기록된다.
- 활성 버전 변경이 과거 평가 결과를 소급 변경하지 않는다.

### 5단계 — 운영 연결

- Notion 결과물 증분 동기화
- 활성 프렙 버전으로 AI 평가 초안 생성
- 교사 검토 큐와 평가 포워드 생성
- 교사 최종 평가와 누적 성장 기록을 Supabase에 저장
- 평가활동별 학생 최종결과와 평가 포워드 확정
- 학생별 활동 타임라인과 기준별 성장 비교
- 성장 기록 보드와 학생 종합 기록 편집
- 원본 확인이 필요할 때만 Notion 페이지 링크 제공
- 확정 평가 보고서 미리보기
- 명시적 Notion 페이지 내보내기, PDF 다운로드, Markdown 복사

완료 기준:

- 중복 가져오기와 중복 기록이 발생하지 않는다.
- Notion 읽기 장애가 나도 이미 가져온 결과물과 평가는 유지된다.
- 교사 최종 확정 없이 학생 공개 상태가 되지 않는다.
- Notion 내보내기 실패가 확정 평가를 변경하거나 삭제하지 않는다.
- PDF는 페이지 잘림·겹침·한글 글꼴 문제 없이 렌더링 검증을 통과한다.
- 한 학생의 활동 결과에서 원결과물·평가 기준·교사 판단까지 추적할 수 있다.
- 세특 초안의 모든 관찰 사실에 하나 이상의 근거 ID가 연결된다.

## 8. 검증 계획

### 단위 테스트

- 척도별 총점과 level descriptor 생성
- 수준 누락·중복 검사
- readiness 계산
- Notion 속성 매핑 검증
- 암호화 round trip과 잘못된 키 처리

### 통합 테스트

- 로그인 교사의 프렙 생성·수정·활성화
- 다른 교사 데이터 접근 차단
- 기존 루브릭을 프렙으로 연결
- dry run 결과와 프렙 버전 연결
- Notion 연결 성공·토큰 오류·권한 부족·DB 미공유
- Notion 원본 페이지 중복 가져오기 방지
- 동일 평가 버전의 Notion 중복 내보내기 경고와 재시도
- PDF 다운로드 응답, 한글 텍스트, 긴 표와 페이지 나눔
- 학생별 활동 결과 upsert와 revision 보존
- 평가 포워드가 다음 활동의 성장 비교에 연결되는지 확인
- 다른 교사의 학생 키·활동 결과·기간 요약 접근 차단

### 브라우저 검증

- 모바일/데스크톱 단계 이동
- 중간 저장 후 복귀
- 키보드만으로 단계와 폼 사용
- 긴 성취기준·기술문·예시의 레이아웃
- 토큰 입력 후 화면과 네트워크 응답에 평문이 남지 않는지 확인
- 학생·선택 학생·학급 범위별 보고서 미리보기
- Notion 쓰기 권한이 없을 때 PDF·Markdown 대체 동선

### PDF 시각 검증

- 최종 PDF를 PNG로 렌더링해 모든 페이지를 검사
- 제목·학생 식별·루브릭 표·평가 증거·피드백·페이지 번호 확인
- 잘린 문장, 표 겹침, 빈 페이지, 한글 네모 글자 여부 확인
- 텍스트 추출로 학생 범위와 확정 평가 버전이 맞는지 교차 검증

### 배포 전 보안 검증

- 새 public 테이블 전체 RLS 확인
- 소유권 없는 `TO authenticated` 정책 금지
- 서비스 키·Notion 토큰의 클라이언트 번들 노출 검사
- 실제 학생 자료가 아닌 fixture로 자동평가 검증
- 학교·기관의 개인정보 및 생성형 AI 사용 정책 확인

## 9. 이번 구현에서 하지 않을 것

- 교육과정 전체 성취기준 DB를 첫 단계에 모두 탑재하지 않는다.
- AI가 평가안을 자동 활성화하거나 학생 평가를 자동 확정하지 않는다.
- 평가 결과를 Notion과 자동 동기화하지 않는다. 교사가 확정 결과를 선택해 실행하는
  일회성 페이지 내보내기만 지원한다.
- 기존 `rubrics`, `evaluations`, `evaluation_scores`를 한 번에 교체하지 않는다.
- 세특 자동 확정은 구현하지 않고 근거와 초안만 생성한다.

## 10. 권장 첫 개발 묶음

첫 PR은 1단계까지만 포함한다.

1. 프렙 타입과 readiness 규칙
2. 프렙·버전 마이그레이션
3. 대시보드 준비 배너
4. 수업 맥락·성취기준·평가 목표 저장 화면
5. 기존 루브릭 생성기로 이동하는 연결
6. RLS·타입·빌드·브라우저 검증

이 범위는 Notion 토큰 저장과 자동평가를 아직 건드리지 않으면서도 교사가 평가 준비 흐름을 실제로 시작하게 한다.
보안과 데이터 동기화 위험이 큰 Notion 연결은 3단계의 별도 PR로 분리한다.
