# NewsComment AI 마일스톤 13

## 완료

- 홈페이지에서 약속한 기능과 앱 사이의 간격을 줄이기 위해 Notion 데이터베이스 댓글 가져오기를 추가했다.
- Notion URL 또는 원시 ID에서 데이터베이스 ID를 추출하는 `lib/notion/import-comments.ts`를 추가했다.
- 제목, 리치 텍스트, 선택, 다중 선택, 상태, 사람, 숫자, 체크박스, URL, 이메일, 전화번호, 날짜, 생성/수정 시간, 고유 ID, 파일, 수식, 롤업 속성에서 일반 텍스트를 추출하도록 했다.
- 기존 `databases/{id}/query`와 새 `data_sources/{id}/query`를 모두 지원하는 페이지네이션 조회를 추가했다.
- 프로젝트별 속성 매핑을 받는 `importCommentsFromNotion` 서버 액션을 추가했다.
- 같은 Notion 데이터베이스를 다시 가져올 때 새 행만 추가되도록 중복 건너뛰기를 추가했다.
- `lib/notion/dedupe.ts`를 분리해 중복 필터와 메타데이터 빌더를 순수하고 테스트 가능한 함수로 만들고 서버 액션과 공유했다.
- 프로젝트 상세 사이드바에 `NotionCommentImportForm`을 추가했고, `NOTION_API_KEY`가 없을 때 경고를 보여 준다.
- 성공한 가져오기가 오류 카드가 아니라 안내 카드로 보이도록 `notice` 쿼리 파라미터를 추가했다.
- `projects.notion_source`와 댓글의 `notion_page_id` 인덱스를 위한 `002_project_notion_source.sql` 마이그레이션을 추가했다.
- `.env.example`과 설정 화면 환경 패널에 `NOTION_API_KEY`, `NOTION_API_VERSION`을 추가했다.
- `docs/NOTION_IMPORT_GUIDE.md`를 추가하고 README와 교사용 설정 안내를 업데이트했다.
- 라이브 확인 결과 워크스페이스 전체 토큰이 수천 개의 무관한 페이지에 접근할 수 있음을 확인하고, Notion 안내에 연동 범위 제한 설명을 추가했다.

## 검증

```bash
npm run lint
npm run typecheck
npm run build
```

마일스톤 13 변경 후 세 명령이 모두 통과했다.

### 단위 수준 스모크 테스트

`extractNotionDatabaseId`와 `propertyToPlainText`에 대해 19개 중 19개 사례가 통과했다. URL, 원시 ID 파싱, 중첩 수식과 롤업 값을 포함한 모든 지원 속성 유형을 확인했다.

### 라이브 Notion API 테스트

실제 내부 연동 토큰과 `💬 학생 댓글 · 생각 나누기` 데이터베이스로 실행했다.

- 토큰 인증, 데이터베이스 접근, 스키마 읽기가 성공했다. 속성은 23개였다.
- 한글 속성명 `댓글`, `학생 ID`, `기사 ID`가 정상 매칭되었다.
- 7행 중 6행을 가져왔다. 댓글 속성이 빈 행은 설계대로 건너뛰었다.
- 연동 연결이 빠진 경우 문서화된 “데이터베이스를 찾을 수 없음” 메시지가 발생해 오류 경로를 확인했다.

### Supabase 라이브 종단 간 테스트

실제 프로젝트에서 `importCommentsFromNotionDatabase`, `collectImportedNotionPageIds`, `filterNewNotionRows`, `buildNotionCommentMetadata`를 사용해 두 번 연속 가져오기를 실행했다.

| 실행 | Notion에서 읽은 수 | 이미 가져온 것으로 인식한 수 | 저장한 수 |
| --- | --- | --- | --- |
| 1 | 6 | 0 | 6 |
| 2 | 6 | 6 | 0 |

- 두 번 실행 후 `comments`에는 중복 없이 정확히 6행이 있었다.
- 저장된 모든 댓글에는 `notion_page_id`가 있고, `metadata.source`는 `notion`이다.
- `projects.notion_source`가 데이터베이스 URL과 속성 매핑을 저장하므로 이후 가져오기에서 필드를 다시 입력하지 않아도 된다.

각 실행 뒤 임시 스크립트는 제거했다. 이 프로젝트에는 아직 테스트 프레임워크가 설치되어 있지 않다.

## 동작 메모

- 한 번에 최대 200개 댓글을 Notion 생성 시간 순서로 가져온다.
- 댓글 하나는 최대 5000자로 잘린다.
- 댓글 속성이 비어 있는 행은 건너뛴다.
- 댓글 메타데이터에는 `notion_page_id`, `notion_page_url`, `notion_database_id`, `notion_created_time`, `topic`을 저장한다.
- Notion 토큰은 서버에만 머문다. 브라우저는 데이터베이스 URL과 속성명만 보낸다.

## 남은 문제

- Notion 가져오기는 단방향이다. 가져온 뒤 Notion에서 수정한 내용은 저장된 댓글에 자동 반영되지 않는다.
- Next.js 서버 액션 래퍼의 폼 파싱과 리다이렉트는 빌드와 타입 검사로만 확인했다. 브라우저 확장이 `localhost`에 접근하지 못해 UI 경로는 직접 클릭 검증하지 못했다.
- Notion은 `created_time`을 분 단위 정밀도로 반환하므로 같은 분에 생성된 행의 가져오기 순서는 보장되지 않는다.
- 이미 마이그레이션 `001`을 적용한 교사는 가져오기 기능을 쓰기 전에 `002`도 적용해야 한다.
- Notion 페이지 본문인 하위 블록은 읽지 않는다. 데이터베이스 속성만 가져온다.
- 공개 배포 전 라이선스 결정이 필요하다.
- 삭제 흐름은 아직 구현되지 않았다.
