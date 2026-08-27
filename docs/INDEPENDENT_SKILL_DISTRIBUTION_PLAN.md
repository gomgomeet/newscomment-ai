# 독립 배포 스킬 구성 계획

## 원칙

독립 배포 ZIP은 특정 프로젝트나 개인의 Notion 자료에 의존하지 않는 실행 패키지로 준비한다. 연수 안내, 공유용 Markdown, 실습 예시, 설치 설명은 스킬 본체와 분리해 필요할 때 별도로 배포한다.

## 현재 배포 패키지

```text
notion-claude-assessment-prep/
└── SKILL.md
```

현재 ZIP에는 평가 준비 스킬 본체만 포함한다. 프로젝트 소스, 학생 자료, 개인 Notion 링크, 평가 결과, 연수용 내부 문서는 포함하지 않는다.

## 2단계 스킬 묶음

```text
notion-claude-assessment-prep/
└── SKILL.md

notion-claude-assessment-grader/
└── SKILL.md
```

- `notion-claude-assessment-prep`: 평가 기준안·문항·DB·폼 준비
- `notion-claude-assessment-grader`: 승인된 평가 실행 명세로 Notion 결과물을 자동채점하고 AI 결과 기록·교사 검토·다음 수업 제안

개별 ZIP과 두 스킬 묶음 ZIP을 모두 유지한다. 초보 연수에서는 묶음 ZIP을 설치하되 1번 스킬을 먼저 실행한다.

## 이후 추가할 수 있는 구성물

```text
notion-claude-assessment-prep/
├── SKILL.md
├── references/
│   ├── assessment-db-schema.md
│   ├── notion-form-template.md
│   └── claude-prompt-examples.md
├── examples/
│   ├── sample-assessment-input.md
│   └── sample-assessment-output.md
└── agents/
    └── openai.yaml
```

추가 파일은 실제 사용 필요성이 확인될 때만 넣는다. 학생 개인정보와 실제 Notion 링크는 예시 파일에도 넣지 않는다.

## 별도 보관할 공유 자료

다음 자료는 ZIP에 넣지 않고 `docs/`에 별도로 보관한다.

- 연수 적용안
- 초보 교사용 설치 안내
- 실습용 Markdown
- PR 설명문
- 평가 기준안 작성 예시
- 3차시 교안
- 버전별 변경 기록

이렇게 하면 스킬을 설치하려는 사람은 ZIP만 받고, 연수에 참여하는 사람은 필요한 안내 자료만 선택해서 받을 수 있다.

## 배포 전 점검

- [ ] ZIP 안에 SKILL.md가 있는가
- [ ] ZIP 안에 개인 학생 자료가 없는가
- [ ] ZIP 안에 개인 Notion 링크가 없는가
- [ ] 실행 스킬과 공유 설명 문서가 분리되어 있는가
- [ ] Codex용 `.agents/skills` 경로에 설치 가능한가
- [ ] Claude Code용 `.claude/skills` 경로에 설치 가능한가
- [ ] 스킬 버전과 ZIP 버전이 일치하는가

## 현재 파일 위치

- 실행 스킬: `.agents/skills/notion-claude-assessment-prep/SKILL.md`
- Claude Code 복사본: `.claude/skills/notion-claude-assessment-prep/SKILL.md`
- 배포 ZIP: `dist/notion-claude-assessment-prep.zip`
- 연수 적용안: `docs/ASSESSMENT_PREP_SKILL_TRAINING_APPLICATION.md`
