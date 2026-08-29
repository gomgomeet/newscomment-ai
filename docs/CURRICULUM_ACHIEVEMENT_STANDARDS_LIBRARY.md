# 성취기준 기반 교육과정 라이브러리 연결 기록

> 정리일: 2026-08-29  
> 적용 위치: 평가 준비 보드, 교육과정 라이브러리  
> 핵심 목적: 교사가 학년·교과·수업 맥락을 입력하면 HWP 원문 기반 성취기준을 선택하고, 평가요소·평가목표·루브릭 생성으로 이어지게 한다.

## 1. 구현 방향

이번 작업은 평가 보드 앞단에 `성취기준 기반 평가설계 엔진`을 붙이기 위한 기반 작업이다.

흐름은 다음과 같다.

```text
HWP 교육과정 원문
→ 성취기준 라이브러리
→ 교과별 평가요소 라이브러리
→ 성취기준 선택
→ 수업 맥락 입력
→ 평가목표 제안
→ 평가요소 추천
→ 루브릭 생성
→ 교사 수정·승인
```

기존에는 평가 준비 화면이 `lib/questioning-board.ts`에 들어 있던 작은 샘플 성취기준 목록을 사용했다. 이제 평가 준비 화면은 HWP 원문에서 추출한 `lib/curriculum/achievement-standards.ts`의 성취기준 라이브러리를 사용한다.

## 2. 원문 처리 결과

PDF 원문은 자동 텍스트 추출 시 한글이 깨지거나 빈 텍스트에 가깝게 추출되는 문제가 있었다. 그래서 같은 과목의 HWP 원문을 우선 사용했다.

HWP 원문은 `scripts/extract-hwp-text.py`로 텍스트를 추출했고, 추출된 텍스트에서 `scripts/build-achievement-standard-library.py`가 성취기준을 생성한다.

생성 기준은 다음과 같다.

- 같은 코드가 여러 번 등장하면 첫 번째 성취기준 문장을 우선 사용한다.
- 뒤쪽에 반복되는 성취기준 해설 문장은 제외한다.
- 사회과 일부 코드의 긴 대시 `–`와 일반 하이픈 `-` 차이는 동일하게 처리한다.
- 각 성취기준에는 교과, 학년군, 영역, 원문, 원문 파일, 원문 줄 번호, 연결 평가요소 키를 함께 둔다.

## 3. 생성된 성취기준 수

총 `1,951개`의 성취기준을 라이브러리에 넣었다.

| 교과 | 성취기준 수 |
| --- | ---: |
| 국어 | 257 |
| 사회 | 416 |
| 도덕 | 103 |
| 수학 | 433 |
| 과학 | 472 |
| 영어 | 270 |

실과·기술가정·정보, 음악, 미술은 아직 HWP 원문 추출 대상에 포함하지 않았으므로 교과별 평가요소 라이브러리에는 1차 골격만 들어 있다. 해당 교과의 HWP 원문을 확보하면 같은 방식으로 성취기준 라이브러리에 추가한다.

## 4. 데이터 구조

성취기준 라이브러리의 기본 타입은 다음과 같다.

```ts
export type AchievementStandard = {
  id: string;
  code: string;
  subject: CurriculumSubject;
  gradeBand: string;
  domain: string;
  text: string;
  assessmentElementKeys: readonly string[];
  sourceFile: string;
  sourceLine: number;
};
```

평가 준비 화면에서 바로 사용할 수 있도록 `buildStandardOptions()`도 함께 제공한다.

```ts
export const standardOptions = buildStandardOptions();
```

이 값은 다음 형태로 변환된다.

```ts
{
  id: "4국02-02",
  subject: "국어",
  gradeBand: "초등 3-4학년",
  title: "[4국02-02] 읽기",
  standard: "[4국02-02] 문단과 글에서 중심 생각을 파악하고 내용을 간추린다.",
  classroomGoal: "읽기 성취기준을 이번 수업 맥락에서 구체적으로 평가합니다."
}
```

## 5. 연결된 파일

| 파일 | 역할 |
| --- | --- |
| `scripts/extract-hwp-text.py` | HWP 원문에서 텍스트 추출 |
| `scripts/build-achievement-standard-library.py` | HWP 추출 텍스트에서 성취기준 라이브러리 생성 |
| `lib/curriculum/achievement-standards.ts` | 생성된 성취기준 원문 라이브러리 |
| `lib/curriculum/assessment-design-library.ts` | 교과별 평가영역·평가요소 라이브러리 |
| `components/assessment-prep/prep-editor.tsx` | 평가 준비 화면이 새 성취기준 라이브러리를 사용하도록 연결 |
| `components/assessment-prep/standard-selector.tsx` | 학년·교과별 성취기준 선택 및 평가목표 추천 UI |

## 6. 평가 보드에서의 연결

평가 준비 화면은 이제 다음 순서로 작동한다.

1. 교사가 학년과 교과를 선택한다.
2. 저장된 학년군과 교과에 맞는 성취기준을 `achievement-standards.ts`에서 불러온다.
3. 교사가 성취기준을 선택한다.
4. 선택된 성취기준과 수업 맥락을 `assessment-design-library.ts`의 교과별 평가요소와 대조한다.
5. 앱이 이번 수업에서 관찰 가능한 평가요소와 평가목표를 제안한다.
6. 교사가 저장하면 루브릭 생성 단계에서 이 기준을 사용한다.

즉, 평가 보드가 직접 HWP 파일을 매번 읽는 구조가 아니라, HWP 원문에서 한 번 생성한 정적 교육과정 라이브러리를 앱 코드가 읽는 구조다.

## 7. 검증 결과

다음 명령으로 확인했다.

```bash
npm run typecheck
npm run lint
```

결과:

- `typecheck` 통과
- `lint` 통과
- 기존 미사용 변수 경고 5개는 남아 있음

## 8. 남은 과제

다음 단계에서는 성취기준과 평가요소 연결 정확도를 더 높여야 한다.

1. 사회·과학 고등학교 선택 과목의 세부 영역명을 코드만으로 추론하지 않고 원문의 영역 제목과 더 정확히 연결한다.
2. 성취기준별 `assessmentElementKeys`를 키워드 기반 1차 매칭에서 교과별 내용 체계 기반 매칭으로 보강한다.
3. 실과·기술가정·정보, 음악, 미술 HWP 원문을 추가해 성취기준 라이브러리를 확장한다.
4. 평가 준비 화면에 성취기준 검색, 영역 필터, 코드 직접 검색을 추가한다.
5. 루브릭 생성 시 선택된 성취기준의 `assessmentElementKeys`를 우선 반영하도록 생성 로직을 고도화한다.

