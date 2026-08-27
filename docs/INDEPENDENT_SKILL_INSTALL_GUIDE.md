# 독립 평가 준비 스킬 설치 안내

## 준비물

- Codex 또는 Claude Code
- 자신의 Notion 수업자료 링크
- 학생 결과물 DB 링크
- 성취기준 또는 수업 의도

## Codex 설치

ZIP을 압축 해제한 뒤 스킬 폴더를 다음 위치에 복사한다.

```text
~/.codex/skills/notion-claude-assessment-prep/
```

Windows 예시:

```text
C:\Users\사용자이름\.codex\skills\notion-claude-assessment-prep\
```

## Claude Code 설치

사용할 프로젝트의 루트에 다음 구조로 복사한다.

```text
.claude/skills/notion-claude-assessment-prep/SKILL.md
```

## 첫 실행

```text
notion-claude-assessment-prep 스킬을 사용해서 내 수업의 평가를 준비해줘.
먼저 필요한 Notion 링크와 정보를 확인해줘.
```

스킬이 요청하면 다음 링크를 제공한다.

1. 수업자료 또는 지문 DB
2. 학생 결과물·제출물 DB
3. 학생 명단 DB 또는 비식별 학생 ID 사용 여부
4. 기존 평가 DB 또는 새 평가 DB를 만들 페이지

## 실습 순서

1. 성취기준과 수업 의도를 입력한다.
2. 평가 문항과 루브릭 초안을 확인한다.
3. 노션폼 질문과 평가 DB 속성을 확인한다.
4. 같은 활동의 결과물 3~5건을 제공한다.
5. 학생별 직접 근거와 참고 점수를 확인한다.
6. 교사 피드백과 다음 활동의 피드포워드를 수정한다.

## 주의

- Notion 링크를 제공해도 모든 DB를 자동으로 연결하지 않는다.
- 챗봇 활동과 NIE 기사 댓글은 별도 활동으로 평가한다.
- 점수는 참고값이며 AI 초안은 교사 검토 전 결과다.
- 개인정보가 있는 원문은 비식별화한다.
- 실제로 생성되지 않은 폼·링크·QR은 생성되었다고 보고하지 않는다.
