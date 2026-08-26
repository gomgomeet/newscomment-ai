export type SchoolLevel =
  | "elementary34"
  | "elementary56"
  | "middle"
  | "highCommon"
  | "highElective";

export type CurriculumStandard = {
  code: string;
  level: SchoolLevel;
  subject: "국어" | "사회";
  summary: string;
  activityFit: string;
};

export type RubricCriterionTemplate = {
  label: string;
  description: string;
  maxScore: number;
};

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  elementary34: "초등 3-4학년",
  elementary56: "초등 5-6학년",
  middle: "중학교",
  highCommon: "고등학교 공통",
  highElective: "고등학교 선택",
};

export const NEWS_ARTICLE_STANDARDS: CurriculumStandard[] = [
  {
    code: "4국02-04",
    level: "elementary34",
    subject: "국어",
    summary: "글에 나타난 사실과 의견을 구분하고 필자와 자신의 의견을 비교한다.",
    activityFit: "기사의 사실과 기자 또는 인용된 사람의 의견을 구분하는 데 적합합니다.",
  },
  {
    code: "4국02-05",
    level: "elementary34",
    subject: "국어",
    summary: "글이나 자료의 출처가 믿을 만한지 판단한다.",
    activityFit: "기사 출처와 정보의 신뢰성을 간단히 확인하는 활동에 적합합니다.",
  },
  {
    code: "4국03-03",
    level: "elementary34",
    subject: "국어",
    summary: "대상에 대한 자신의 의견과 그렇게 생각한 이유가 드러나게 글을 쓴다.",
    activityFit: "기사에 대한 자신의 생각과 이유를 문단으로 쓰는 활동에 직접 연결됩니다.",
  },
  {
    code: "6국02-01",
    level: "elementary56",
    subject: "국어",
    summary: "글의 구조를 고려하며 주제나 주장을 파악하고 글 내용을 요약한다.",
    activityFit: "기사의 핵심 쟁점과 주장을 정리하는 활동에 적합합니다.",
  },
  {
    code: "6국02-03",
    level: "elementary56",
    subject: "국어",
    summary: "글이나 자료를 읽고 내용의 타당성과 표현의 적절성을 평가한다.",
    activityFit: "기사 내용이 타당한지, 표현이 적절한지 판단하는 기준이 됩니다.",
  },
  {
    code: "6국03-02",
    level: "elementary56",
    subject: "국어",
    summary: "적절한 근거를 사용하고 인용의 출처를 밝히며 주장하는 글을 쓴다.",
    activityFit: "기사 근거를 활용해 자신의 주장을 쓰고 출처를 밝히는 활동에 적합합니다.",
  },
  {
    code: "6국06-02",
    level: "elementary56",
    subject: "국어",
    summary: "뉴스 및 각종 정보 매체 자료의 신뢰성을 평가한다.",
    activityFit: "뉴스 기사 자체의 신뢰성을 점검하는 활동에 직접 연결됩니다.",
  },
  {
    code: "6사08-03",
    level: "elementary56",
    subject: "사회",
    summary: "미디어의 의미와 역할을 이해하고 여러 가지 미디어의 내용을 비판적으로 분석한다.",
    activityFit: "민주시민 관점에서 기사 내용을 비판적으로 받아들이는 활동에 적합합니다.",
  },
  {
    code: "9국02-04",
    level: "middle",
    subject: "국어",
    summary: "글이나 자료의 내용 타당성, 신뢰성, 표현 방법의 적절성을 평가하며 읽는다.",
    activityFit: "기사의 근거, 자료, 표현 방식을 비판적으로 읽는 활동에 적합합니다.",
  },
  {
    code: "9국02-06",
    level: "middle",
    subject: "국어",
    summary: "동일한 화제를 다룬 여러 글이나 자료를 주제 통합적으로 읽는다.",
    activityFit: "같은 쟁점의 여러 기사를 비교해 자신의 관점을 세우는 활동에 적합합니다.",
  },
  {
    code: "9국03-04",
    level: "middle",
    subject: "국어",
    summary: "의견 차이가 있는 사안에 대해 자료를 수집하고 사회문화적 맥락을 고려하며 주장하는 글을 쓴다.",
    activityFit: "사회 쟁점 기사에 대해 자료 기반 주장 글을 쓰는 활동에 직접 연결됩니다.",
  },
  {
    code: "9국06-06",
    level: "middle",
    subject: "국어",
    summary: "사회문화적 맥락을 고려하여 매체 자료의 공정성을 평가한다.",
    activityFit: "기사의 편향, 누락, 과장 여부를 점검하는 활동에 적합합니다.",
  },
  {
    code: "9사(일사)12-02",
    level: "middle",
    subject: "사회",
    summary: "오늘날의 주요한 사회문제를 조사하고 우리 생활에 미치는 영향을 파악한다.",
    activityFit: "기사 속 사회문제를 조사하고 생활과 연결해 해석하는 활동에 적합합니다.",
  },
  {
    code: "10공국1-02-01",
    level: "highCommon",
    subject: "국어",
    summary: "다양한 글이나 자료를 읽으며 논증의 타당성을 평가하고 자신의 관점으로 논증을 재구성한다.",
    activityFit: "기사 논증의 주장, 이유, 근거를 평가하고 자신의 관점으로 다시 쓰는 활동에 적합합니다.",
  },
  {
    code: "10공국1-03-01",
    level: "highCommon",
    subject: "국어",
    summary: "사회적 쟁점에 대한 자신의 견해를 정교하게 표현하는 글을 쓴다.",
    activityFit: "신문기사 기반 의견문 또는 칼럼형 글쓰기의 핵심 기준입니다.",
  },
  {
    code: "10공국1-06-01",
    level: "highCommon",
    subject: "국어",
    summary: "사회적 의제를 다룬 매체 자료를 비판적으로 분석한다.",
    activityFit: "사회적 의제를 다룬 기사와 온라인 뉴스 자료를 비판적으로 읽는 활동에 적합합니다.",
  },
  {
    code: "12독작01-04",
    level: "highElective",
    subject: "국어",
    summary: "글의 내용이나 관점, 표현 방법, 필자의 의도나 사회문화적 이념을 평가하며 읽는다.",
    activityFit: "기사의 관점과 의도, 사회문화적 전제를 깊게 분석하는 활동에 적합합니다.",
  },
  {
    code: "12독작01-08",
    level: "highElective",
    subject: "국어",
    summary: "사회문화 분야의 글을 읽고 사회문화적 사건에 대한 관점을 담은 글을 쓴다.",
    activityFit: "사회문화 쟁점 기사에 대한 관점 있는 글쓰기 활동에 적합합니다.",
  },
  {
    code: "12독작01-11",
    level: "highElective",
    subject: "국어",
    summary: "글이나 자료에서 타당한 근거를 수집하고 효과적인 설득 전략을 활용하여 논증하는 글을 쓴다.",
    activityFit: "기사, 통계, 보고서 등을 종합해 논증적 의견문을 쓰는 활동에 적합합니다.",
  },
  {
    code: "12사탐04-01~04",
    level: "highElective",
    subject: "사회",
    summary: "사회문제를 선정하고 자료를 수집·분석하여 해결 방안을 제시하고 보고서로 작성한다.",
    activityFit: "신문기사에서 출발한 사회문제 탐구 보고서나 정책 제안형 글쓰기로 확장할 수 있습니다.",
  },
];

const baseCriteria: RubricCriterionTemplate[] = [
  {
    label: "기사 이해와 요약",
    maxScore: 4,
    description:
      "4점: 핵심 사건, 배경, 쟁점을 정확히 요약하고 사실과 의견을 구분함. 3점: 주요 내용을 대체로 정확히 요약함. 2점: 일부 내용은 파악했으나 핵심 쟁점이 흐림. 1점: 기사 내용을 단순 복사하거나 오해함.",
  },
  {
    label: "자료 신뢰성·공정성 판단",
    maxScore: 4,
    description:
      "4점: 출처, 근거, 관점, 누락·과장 가능성을 비판적으로 검토함. 3점: 출처와 근거의 신뢰성을 일부 판단함. 2점: 신뢰성 판단이 피상적임. 1점: 자료를 무비판적으로 수용함.",
  },
  {
    label: "자신의 주장 명확성",
    maxScore: 4,
    description:
      "4점: 입장이 분명하고 쟁점에 직접 답함. 3점: 입장은 드러나지만 일부 모호함. 2점: 의견은 있으나 쟁점과 연결이 약함. 1점: 자신의 의견이 거의 드러나지 않음.",
  },
  {
    label: "근거의 타당성",
    maxScore: 4,
    description:
      "4점: 기사 내용, 추가 자료, 사례를 근거로 논리적으로 뒷받침함. 3점: 기사 내용을 근거로 대체로 뒷받침함. 2점: 근거가 부족하거나 주장과 관련이 약함. 1점: 근거 없이 감상 중심으로 씀.",
  },
  {
    label: "글의 조직과 표현",
    maxScore: 4,
    description:
      "4점: 도입-주장-근거-마무리가 자연스럽고 문장이 명료함. 3점: 글의 기본 구조가 갖추어짐. 2점: 문단 구성이나 연결이 다소 어색함. 1점: 글의 흐름이 불분명함.",
  },
  {
    label: "시민적 관점과 해결 지향",
    maxScore: 4,
    description:
      "4점: 사회적 영향, 다양한 관점, 실천 가능성을 균형 있게 고려함. 3점: 사회적 의미나 해결 방향을 제시함. 2점: 개인적 느낌에 머무르는 부분이 많음. 1점: 사회적 관점이나 책임 의식이 부족함.",
  },
];

export function getStandardsForLevel(level: SchoolLevel) {
  return NEWS_ARTICLE_STANDARDS.filter((standard) => standard.level === level);
}

export function getDefaultStandardCodes(level: SchoolLevel) {
  return getStandardsForLevel(level).map((standard) => standard.code);
}

export function getStandardsByCodes(codes: string[]) {
  const selectedCodes = new Set(codes);
  return NEWS_ARTICLE_STANDARDS.filter((standard) => selectedCodes.has(standard.code));
}

export function buildNewsArticleRubricCriteria(level: SchoolLevel): RubricCriterionTemplate[] {
  if (level === "elementary34") {
    return baseCriteria.filter((criterion) =>
      ["기사 이해와 요약", "자신의 주장 명확성", "근거의 타당성", "글의 조직과 표현"].includes(
        criterion.label,
      ),
    );
  }

  if (level === "elementary56") {
    return baseCriteria;
  }

  return [
    ...baseCriteria,
    {
      label: "논증 재구성과 반론 고려",
      maxScore: 4,
      description:
        "4점: 기사 논증을 평가한 뒤 자신의 관점으로 재구성하고 예상 반론까지 고려함. 3점: 논증 구조와 반론을 일부 고려함. 2점: 주장과 근거의 관계 분석이 제한적임. 1점: 기사 내용을 반복하는 데 그침.",
    },
  ];
}
