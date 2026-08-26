# 마이그레이션 안내

## 마이그레이션이 무엇인가

**데이터베이스 구조를 바꾸는 SQL을 순서대로 적어 둔 파일**이다.

앱 코드는 깃으로 관리되지만 데이터베이스는 그렇지 않다. 표를 만들고 열을 더한 것은
Supabase 안에만 남는다. 그래서 "무엇을 어떤 순서로 바꿨는지"를 파일로 남긴다.
새 환경에 앱을 올릴 때 001부터 차례로 돌리면 똑같은 구조가 만들어진다.

## 지금까지의 마이그레이션

| 파일 | 무엇을 하나 | 적용 |
| --- | --- | --- |
| `001_initial_schema` | 맨 처음 표들 — profiles, rubrics, rubric_criteria, projects, comments, evaluations, evaluation_scores | 필수 |
| `002_project_notion_source` | projects에 `notion_source` 열 | 필수 |
| `003_questioning_lesson_connections` | 챗봇 수업 연결 표 (교사별 수업 코드·암호화된 키) | 챗봇 쓰면 필수 |
| `004_questioning_thinking_cards` | 생각 카드 표 4개 — documents, thinking_cards, card_relations, student_questions | 챗봇 쓰면 필수 |
| `005_questioning_cards_pgvector` | (선택) pgvector 확장 + `embedding vector(768)` 열 | **미적용 — 아직 필요 없음** |
| `006_generated_rubric_metadata` | rubrics에 `auto_generated`, `generation_context` 열 | 루브릭 자동 생성 쓰면 필수 |

## 번호가 중요한 이유

**순서가 곧 의존 관계다.** 004는 003이 만든 `questioning_lesson_connections`를 참조하므로,
003 없이 004를 돌리면 실패한다.

그래서 같은 번호가 둘이면 안 된다. 실제로 루브릭 브랜치를 머지할 때
`003_generated_rubric_metadata.sql`이 이미 있던 `003_questioning_lesson_connections.sql`과
겹쳐서, **006으로 옮긴 뒤에 머지했다.** 그대로 두었다면 어느 것을 먼저 돌려야 하는지
알 수 없었을 것이다.

## 돌리는 방법

Supabase 대시보드 → **SQL Editor** → New query에 파일 내용을 붙여 넣고 Run.
성공하면 `Success. No rows returned`이 뜬다.

한 번 돌린 파일은 다시 돌리지 않는다. 다만 대부분 `if not exists`를 쓰고 있어
실수로 또 돌려도 탈이 나지 않는다.

### 적용됐는지 확인하기

```sql
-- 표가 생겼는지
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'questioning%';

-- 열이 생겼는지
select column_name, data_type from information_schema.columns
where table_name = 'rubrics'
  and column_name in ('auto_generated', 'generation_context');
```

## 003과 004를 한 번에 돌리려면

새 환경을 세팅할 때는 `supabase/manual-apply-003-004.sql` 합본을 쓰면 된다.
번호 순서 실수를 막으려고 만들어 둔 파일이다.

## 안 돌리면 어떻게 되나

읽기와 쓰기가 다르게 동작한다는 것을 알아 두면 증상을 읽기 쉽다.

- **없는 열을 읽으면** `undefined`가 되고 조용히 넘어간다. 화면에서 그 값만 안 보인다.
- **없는 열에 쓰려고 하면** Postgres가 요청을 거절한다. 그 기능만 실패한다.

예를 들어 006을 안 돌리면 루브릭 목록은 열리지만(생성 방식이 늘 `직접 생성`으로 보임)
**자동 생성 버튼만** `column does not exist`로 실패한다. 앱이 죽지는 않는다.

## 새 마이그레이션을 더할 때

1. 다음 번호를 쓴다. 기존 번호와 겹치지 않는지 반드시 확인한다.
2. 되도록 `if not exists` / `add column if not exists`로 쓴다. 두 번 돌려도 안전해진다.
3. 새 표에는 RLS를 켜고 `service_role`에만 권한을 준다 — 학생 브라우저가 직접 닿지 않아야 한다.
4. 파일 맨 위에 무엇을 왜 바꾸는지 주석으로 남긴다.
