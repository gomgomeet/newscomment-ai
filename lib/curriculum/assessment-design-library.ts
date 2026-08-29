export type CurriculumSubject =
  | "국어"
  | "사회"
  | "도덕"
  | "수학"
  | "과학"
  | "영어"
  | "실과"
  | "기술·가정"
  | "정보"
  | "음악"
  | "미술";

export type CurriculumAssessmentElement = {
  key: string;
  label: string;
  domain: string;
  lens: string;
  observableEvidence: string;
  criterionStem: string;
  contextKeywords: string[];
};

export type CurriculumSubjectFramework = {
  subject: CurriculumSubject;
  sourceFiles: string[];
  sourceNotes: string[];
  domains: string[];
  assessmentElements: CurriculumAssessmentElement[];
};

export type AssessmentDesignRecommendation = {
  subject: CurriculumSubject;
  sourceFiles: string[];
  sourceNotes: string[];
  domains: string[];
  suggestedGoal: string;
  selectedElements: CurriculumAssessmentElement[];
};

export type ContextRubricCriterion = {
  key: string;
  label: string;
  description: string;
  observableEvidence: string;
};

type RubricAchievementLevel = "매우 잘함" | "잘함" | "보통" | "더 연습 필요";

type RubricAchievementProfile = Record<RubricAchievementLevel, string>;

const RUBRIC_ACHIEVEMENT_LEVELS: RubricAchievementLevel[] = [
  "매우 잘함",
  "잘함",
  "보통",
  "더 연습 필요",
];

export const CURRICULUM_SUBJECTS: CurriculumSubject[] = [
  "국어",
  "사회",
  "도덕",
  "수학",
  "과학",
  "영어",
  "실과",
  "기술·가정",
  "정보",
  "음악",
  "미술",
];

const subjectFrameworks: CurriculumSubjectFramework[] = [
  {
    subject: "국어",
    sourceFiles: ["[별책5] 국어과 교육과정"],
    sourceNotes: [
      "공통 교육과정 영역은 듣기·말하기, 읽기, 쓰기, 문법, 문학, 매체로 설정됨.",
      "내용 체계는 지식·이해, 과정·기능, 가치·태도의 세 범주로 구성됨.",
      "평가는 실제 언어생활 맥락에서 학습한 내용을 적용하는 역량과 통합적인 언어 수행 능력을 중점으로 함.",
    ],
    domains: ["듣기·말하기", "읽기", "쓰기", "문법", "문학", "매체"],
    assessmentElements: [
      element("korean-reading-core", "중심 내용 파악", "읽기", "내용 이해", "글의 중심 생각, 핵심 정보, 세부 내용을 자기 말로 정리한다.", "글이나 자료의 중심 내용과 핵심 정보를 정확히 파악하는가?", ["중심", "핵심", "요약", "읽", "기사", "자료"]),
      element("korean-reading-critical", "자료의 타당성 판단", "읽기·매체", "비판적 읽기", "출처, 근거, 관점, 표현의 적절성을 들어 자료를 판단한다.", "자료의 출처와 근거를 바탕으로 타당성과 신뢰성을 판단하는가?", ["출처", "신뢰", "타당", "매체", "뉴스", "비판"]),
      element("korean-writing-evidence", "근거 있는 생각 표현", "쓰기", "내용 생성", "자신의 의견을 밝히고 글이나 자료의 내용과 연결한 이유를 제시한다.", "자신의 생각을 자료의 내용과 연결하여 근거 있게 표현하는가?", ["의견", "생각", "댓글", "쓰기", "근거", "주장"]),
      element("korean-communication", "상호작용과 존중", "듣기·말하기·매체", "의사소통", "친구의 의견을 듣고 질문, 응답, 보완 의견을 존중하는 태도로 주고받는다.", "상대의 의견을 이해하고 적절한 질문이나 응답으로 소통하는가?", ["토의", "발표", "댓글", "소통", "친구", "질문"]),
    ],
  },
  {
    subject: "사회",
    sourceFiles: ["[별책7] 사회과 교육과정"],
    sourceNotes: [
      "사회과는 지리, 일반사회, 역사 관련 영역을 중심으로 인간과 사회현상을 종합적으로 이해하도록 구성됨.",
      "과정·기능은 자료 및 정보 수집·해석·활용·창조, 탐구, 문제 해결 및 의사 결정, 의사소통 및 참여를 포함함.",
      "평가 요소는 지식·이해에 치우치지 않고 과정·기능과 가치·태도를 균형 있게 선정해야 함.",
    ],
    domains: ["지리 인식", "자연환경과 인간생활", "인문환경과 인간생활", "지속가능한 세계", "정치", "법", "경제", "사회·문화", "역사"],
    assessmentElements: [
      element("social-problem", "사회문제 인식", "일반사회", "문제 인식", "사회 현상의 특징과 쟁점을 생활 모습 또는 공동체 문제와 연결해 설명한다.", "자료 속 사회 현상이나 문제의 핵심 쟁점을 파악하는가?", ["사회문제", "쟁점", "문제", "생활", "공동체", "변화"]),
      element("social-evidence", "자료·정보 활용", "지리·일반사회·역사", "자료 수집·해석·활용", "지도, 기사, 통계, 사진, 사료 등 자료에서 필요한 정보를 수집하고 해석해 활용한다.", "자료와 정보를 수집·해석·활용하여 탐구나 주장의 근거로 삼는가?", ["자료", "정보", "지도", "통계", "기사", "사료", "조사"]),
      element("social-cause", "원인과 영향 분석", "일반사회·역사", "관계 분석", "사회 현상의 원인, 결과, 영향을 구분하고 관계를 설명한다.", "사회 현상의 원인과 영향을 구분하여 설명하는가?", ["원인", "영향", "결과", "변화", "왜", "관계"]),
      element("social-solution", "의사 결정과 참여", "정치·경제·사회문화", "문제 해결·참여", "다양한 관점을 고려해 합리적으로 의사 결정하고 실현 가능한 해결 방안이나 참여 방법을 제안한다.", "사회문제 해결을 위해 합리적인 의사 결정과 참여 방안을 제시하는가?", ["해결", "방안", "실천", "참여", "정책", "제안", "의사 결정"]),
    ],
  },
  {
    subject: "도덕",
    sourceFiles: ["[별책6] 도덕과 교육과정"],
    sourceNotes: [
      "도덕과는 자신과의 관계, 타인과의 관계, 사회·공동체와의 관계, 자연과의 관계라는 가치관계 확장을 중심으로 구성됨.",
      "과정·기능은 도덕적 탐구와 성찰의 과정을 포함하고, 가치·태도는 일상 속 실천과 수양을 중심으로 함.",
      "평가는 단편 지식 중심을 지양하고 도덕적 지식과 실천 요소, 학생의 변화와 성장을 통합적으로 평가함.",
    ],
    domains: ["자신과의 관계", "타인과의 관계", "사회·공동체와의 관계", "자연과의 관계"],
    assessmentElements: [
      element("moral-value", "도덕적 가치 이해", "도덕적 탐구", "가치 이해", "상황에 담긴 도덕적 가치와 규범을 구체적으로 설명한다.", "상황에 관련된 도덕적 가치와 규범을 이해하는가?", ["가치", "규범", "예절", "책임", "존중"]),
      element("moral-judgement", "도덕적 판단", "도덕적 사고", "판단과 근거", "여러 선택의 이유와 결과를 비교하고 타당한 근거로 판단한다.", "도덕적 문제 상황에서 타당한 근거를 들어 판단하는가?", ["판단", "갈등", "선택", "이유", "근거"]),
      element("moral-empathy", "공감과 관계 성찰", "관계 윤리", "공감", "타인의 입장과 감정을 고려해 자신의 말과 행동을 성찰한다.", "타인의 입장과 감정을 고려하여 관계를 성찰하는가?", ["공감", "친구", "관계", "배려", "감정"]),
      element("moral-practice", "실천 계획", "실천", "행동화", "배운 가치를 생활 속에서 실천할 방법을 구체적으로 제시한다.", "도덕적 가치를 생활 속 실천 계획으로 구체화하는가?", ["실천", "계획", "약속", "생활", "행동"]),
    ],
  },
  {
    subject: "수학",
    sourceFiles: ["[별책8] 수학과 교육과정"],
    sourceNotes: [
      "수학 교과 역량은 문제해결, 추론, 의사소통, 연결, 정보처리로 설정됨.",
      "내용 체계는 핵심 아이디어와 지식·이해, 과정·기능, 가치·태도의 세 범주로 구성됨.",
      "평가 방법에서는 성취기준을 중심으로 세 범주를 평가 요소로 구체화하도록 제시함.",
    ],
    domains: ["수와 연산", "변화와 관계", "도형과 측정", "자료와 가능성"],
    assessmentElements: [
      element("math-concept", "개념과 원리 이해", "내용 영역", "개념 이해", "수학적 개념, 원리, 성질을 상황에 맞게 설명하거나 적용한다.", "수학적 개념과 원리를 이해하고 적절히 적용하는가?", ["개념", "원리", "성질", "이해", "적용"]),
      element("math-problem", "문제 해결 전략", "수학 과정", "문제 해결", "문제 조건을 파악하고 알맞은 전략을 선택해 해결 과정을 전개한다.", "문제 조건에 맞는 해결 전략을 세우고 실행하는가?", ["문제", "해결", "전략", "조건", "구하기"]),
      element("math-reasoning", "추론", "수학 과정", "추론", "규칙, 관계, 근거를 바탕으로 수학적 결론을 설명한다.", "수학적 근거를 바탕으로 추론하고 결론을 설명하는가?", ["추론", "규칙", "관계", "왜", "증명", "근거"]),
      element("math-communication", "수학적 의사소통", "수학 과정", "표현과 소통", "식, 표, 그래프, 그림, 말과 글로 수학적 생각을 명료하게 표현한다.", "수학적 생각을 적절한 표현으로 설명하고 소통하는가?", ["설명", "표현", "식", "표", "그래프", "그림"]),
      element("math-connection-data", "연결과 정보처리", "수학 과정", "연결·정보처리", "수학적 개념을 생활·타 교과·자료 상황과 연결하고 필요한 정보를 표, 그래프, 공학 도구 등으로 처리한다.", "수학적 내용을 다른 상황과 연결하고 정보를 적절히 처리하는가?", ["연결", "정보", "자료", "공학", "실생활", "그래프"]),
    ],
  },
  {
    subject: "과학",
    sourceFiles: ["[별책9] 과학과 교육과정"],
    sourceNotes: [
      "과학과 영역은 운동과 에너지, 물질, 생명, 지구와 우주, 과학과 사회의 5개 영역으로 구성됨.",
      "과정·기능은 문제 인식 및 가설 설정, 탐구 설계 및 수행, 자료 수집·분석 및 해석, 결론 도출 및 일반화, 의사소통과 협업을 근간으로 함.",
      "평가는 지식·이해 중심을 지양하고 지식·이해, 과정·기능, 가치·태도를 균형 있게 평가하도록 제시함.",
    ],
    domains: ["운동과 에너지", "물질", "생명", "지구와 우주", "과학과 사회"],
    assessmentElements: [
      element("science-concept", "과학 개념 이해", "지식·이해", "개념 이해", "과학 개념과 원리를 현상이나 사례와 연결해 설명한다.", "과학 개념과 원리를 현상 설명에 적절히 사용하는가?", ["개념", "원리", "현상", "이유", "설명"]),
      element("science-inquiry", "탐구 설계와 수행", "과정·기능", "탐구", "관찰, 측정, 변인 통제, 자료 수집 등 탐구 절차를 타당하게 수행한다.", "탐구 문제에 맞는 절차를 세우고 자료를 수집하는가?", ["탐구", "실험", "관찰", "측정", "변인", "조사"]),
      element("science-data", "자료 해석", "과정·기능", "증거 기반 해석", "관찰·실험 자료를 표, 그래프, 수치 등으로 해석해 결론을 이끈다.", "자료를 근거로 과학적 결론을 도출하는가?", ["자료", "그래프", "결과", "분석", "증거", "결론"]),
      element("science-attitude", "과학적 태도와 실천", "가치·태도", "과학과 사회", "안전, 협력, 생태·사회적 영향을 고려해 과학적 실천 방안을 제시한다.", "과학적 근거를 바탕으로 안전하고 책임 있는 실천을 제안하는가?", ["안전", "협력", "환경", "실천", "사회", "책임"]),
    ],
  },
  {
    subject: "영어",
    sourceFiles: ["[별책14] 영어과 교육과정"],
    sourceNotes: [
      "영어과는 언어의 사회적 목적 관점에 따라 이해(reception)와 표현(production)의 두 영역을 설정함.",
      "지식·이해는 언어와 맥락, 과정·기능은 상호 작용과 영어 사용 목적 달성 기능, 가치·태도는 정의적 내용을 포함함.",
      "평가는 성취기준을 근거로 내용과 수준을 선정하며 표현 영역은 가급적 수행평가 같은 직접 평가를 활용함.",
    ],
    domains: ["이해", "표현"],
    assessmentElements: [
      element("english-listen-read", "의미 이해", "이해", "듣기·읽기", "영어 표현의 핵심 정보, 세부 정보, 맥락을 파악한다.", "영어 자료의 핵심 의미와 세부 정보를 이해하는가?", ["듣기", "읽기", "이해", "정보", "text", "listen", "read"]),
      element("english-interaction", "상호작용", "표현", "의사소통", "상황과 목적에 맞게 묻고 답하며 의미를 주고받는다.", "상황과 목적에 맞게 영어로 상호작용하는가?", ["대화", "질문", "응답", "말하기", "conversation", "ask"]),
      element("english-expression", "목적에 맞는 표현", "표현", "말하기·쓰기", "어휘와 언어 형식을 활용해 자신의 생각이나 정보를 말하거나 쓴다.", "목적과 상황에 맞게 영어로 생각이나 정보를 표현하는가?", ["쓰기", "말하기", "표현", "의견", "write", "speak"]),
      element("english-culture", "문화 이해와 태도", "문화", "문화 인식", "문화적 다양성을 이해하고 존중하는 태도로 의사소통한다.", "문화적 맥락과 다양성을 고려하여 의사소통하는가?", ["문화", "다양성", "존중", "culture"]),
    ],
  },
  {
    subject: "실과",
    sourceFiles: ["[별책10] 실과(기술·가정)/정보과 교육과정"],
    sourceNotes: [
      "아직 HWP 원문 미제공 상태라 PDF/교과 구조 기반의 1차 골격임.",
      "추후 HWP 원문이 제공되면 영역명과 평가요소를 원문 기준으로 보강해야 함.",
    ],
    domains: ["인간 발달과 주도적 삶", "생활환경과 지속가능한 선택", "기술적 문제 해결", "디지털 사회와 인공지능"],
    assessmentElements: [
      element("practical-life", "생활 문제 인식", "생활", "문제 인식", "가정·생활 속 문제와 필요를 구체적으로 파악한다.", "생활 속 문제와 필요를 구체적으로 파악하는가?", ["생활", "가정", "문제", "필요", "관리"]),
      element("practical-solution", "실천적 해결 방안", "실천", "문제 해결", "자원, 안전, 지속가능성을 고려해 실행 가능한 방법을 제시한다.", "생활 문제에 대한 실행 가능한 해결 방안을 제시하는가?", ["실천", "해결", "안전", "지속가능", "자원"]),
      element("practical-making", "제작과 개선", "기술", "설계·제작", "목적에 맞게 설계, 제작, 점검, 개선 과정을 수행한다.", "목적에 맞게 만들고 점검하며 개선하는가?", ["제작", "설계", "만들기", "개선", "도구"]),
    ],
  },
  {
    subject: "기술·가정",
    sourceFiles: ["[별책10] 실과(기술·가정)/정보과 교육과정"],
    sourceNotes: [
      "아직 HWP 원문 미제공 상태라 PDF/교과 구조 기반의 1차 골격임.",
      "추후 HWP 원문이 제공되면 영역명과 평가요소를 원문 기준으로 보강해야 함.",
    ],
    domains: ["인간 발달과 가족", "생활 문화와 안전", "기술 시스템", "기술 활용"],
    assessmentElements: [
      element("tech-family-life", "생활 맥락 분석", "가정", "맥락 분석", "개인·가족·사회 맥락에서 생활 문제의 원인과 영향을 분석한다.", "생활 문제의 원인과 영향을 맥락 속에서 분석하는가?", ["가족", "생활", "사회", "원인", "영향"]),
      element("tech-design", "기술적 문제 해결", "기술", "설계와 해결", "요구 조건을 분석해 아이디어를 설계하고 구현·평가한다.", "요구 조건에 맞는 기술적 해결 방안을 설계하고 평가하는가?", ["기술", "설계", "아이디어", "구현", "평가"]),
      element("tech-safety", "안전과 지속가능성", "생활·기술", "책임 있는 선택", "안전, 윤리, 지속가능성을 고려해 선택과 실천을 판단한다.", "안전과 지속가능성을 고려하여 책임 있게 판단하는가?", ["안전", "윤리", "환경", "지속가능", "책임"]),
    ],
  },
  {
    subject: "정보",
    sourceFiles: ["[별책10] 실과(기술·가정)/정보과 교육과정"],
    sourceNotes: [
      "아직 HWP 원문 미제공 상태라 PDF/교과 구조 기반의 1차 골격임.",
      "추후 HWP 원문이 제공되면 영역명과 평가요소를 원문 기준으로 보강해야 함.",
    ],
    domains: ["컴퓨팅 시스템", "데이터", "알고리즘과 프로그래밍", "인공지능", "디지털 문화"],
    assessmentElements: [
      element("info-data", "데이터 이해와 표현", "데이터", "자료 표현", "데이터를 수집, 분류, 표현하고 의미를 해석한다.", "데이터를 목적에 맞게 표현하고 해석하는가?", ["데이터", "자료", "분류", "표", "시각화"]),
      element("info-algorithm", "알고리즘 설계", "알고리즘", "절차적 사고", "문제를 작은 단계로 나누고 절차를 논리적으로 설계한다.", "문제를 절차로 나누어 논리적인 알고리즘을 만드는가?", ["알고리즘", "순서", "절차", "문제", "단계"]),
      element("info-programming", "프로그램 구현과 디버깅", "프로그래밍", "구현", "프로그램을 만들고 오류를 찾아 수정하며 결과를 확인한다.", "프로그램을 구현하고 오류를 찾아 개선하는가?", ["코딩", "프로그램", "오류", "디버깅", "실행"]),
      element("info-ethics", "디지털 윤리", "디지털 문화", "윤리와 안전", "개인정보, 저작권, 인공지능 윤리 등 디지털 사회의 책임을 고려한다.", "디지털 사회의 윤리와 안전을 고려하여 판단하는가?", ["윤리", "개인정보", "저작권", "인공지능", "AI", "안전"]),
    ],
  },
  {
    subject: "음악",
    sourceFiles: ["[별책12] 음악과 교육과정"],
    sourceNotes: [
      "아직 HWP 원문 미제공 상태라 PDF/교과 구조 기반의 1차 골격임.",
      "추후 HWP 원문이 제공되면 영역명과 평가요소를 원문 기준으로 보강해야 함.",
    ],
    domains: ["연주", "감상", "창작"],
    assessmentElements: [
      element("music-performance", "표현과 연주", "연주", "음악 표현", "음악 요소와 기능을 활용해 악곡의 특징을 살려 표현한다.", "음악 요소를 살려 악곡을 표현하는가?", ["노래", "연주", "표현", "리듬", "가락"]),
      element("music-appreciation", "감상과 해석", "감상", "음악 이해", "음악 요소, 분위기, 문화적 맥락을 근거로 음악을 해석한다.", "음악의 특징과 맥락을 근거로 감상 내용을 설명하는가?", ["감상", "느낌", "특징", "문화", "해석"]),
      element("music-creation", "창작과 구성", "창작", "음악 만들기", "소리와 음악 요소를 선택·조직해 의도에 맞게 음악을 만든다.", "음악 요소를 선택하고 조직하여 의도에 맞게 창작하는가?", ["창작", "만들기", "작곡", "소리", "구성"]),
    ],
  },
  {
    subject: "미술",
    sourceFiles: ["[별책13] 미술과 교육과정"],
    sourceNotes: [
      "아직 HWP 원문 미제공 상태라 PDF/교과 구조 기반의 1차 골격임.",
      "추후 HWP 원문이 제공되면 영역명과 평가요소를 원문 기준으로 보강해야 함.",
    ],
    domains: ["미적 체험", "표현", "감상"],
    assessmentElements: [
      element("art-experience", "관찰과 미적 탐색", "미적 체험", "탐색", "대상과 환경을 관찰하고 조형 요소, 느낌, 의미를 발견한다.", "대상과 환경에서 미적 특징과 의미를 발견하는가?", ["관찰", "탐색", "느낌", "환경", "조형"]),
      element("art-expression", "표현 의도와 방법", "표현", "시각적 표현", "주제와 의도에 맞게 재료, 용구, 표현 방법을 선택해 작품을 만든다.", "표현 의도에 맞게 재료와 방법을 선택하여 작품을 만드는가?", ["표현", "작품", "재료", "방법", "주제"]),
      element("art-reflection", "작품 감상과 성찰", "감상", "해석과 비평", "작품의 특징과 의미를 근거로 감상하고 자신의 표현 과정을 성찰한다.", "작품의 특징과 의미를 근거로 감상하고 성찰하는가?", ["감상", "비평", "의미", "성찰", "작품"]),
    ],
  },
];

function element(
  key: string,
  label: string,
  domain: string,
  lens: string,
  observableEvidence: string,
  criterionStem: string,
  contextKeywords: string[],
): CurriculumAssessmentElement {
  return { key, label, domain, lens, observableEvidence, criterionStem, contextKeywords };
}

export function getSubjectFramework(subject: string) {
  return subjectFrameworks.find((framework) => framework.subject === subject);
}

export function getCurriculumSubjects() {
  return CURRICULUM_SUBJECTS;
}

export function buildAssessmentDesignRecommendation({
  subject,
  gradeBand,
  lessonContext,
  standards,
}: {
  subject: string;
  gradeBand: string;
  lessonContext: string;
  standards: string[];
}): AssessmentDesignRecommendation | null {
  const framework = getSubjectFramework(subject);
  if (!framework) return null;

  const searchText = [lessonContext, ...standards].join(" ").toLowerCase();
  const ranked = framework.assessmentElements
    .map((item, index) => ({
      item,
      index,
      score: item.contextKeywords.reduce(
        (sum, keyword) => sum + (searchText.includes(keyword.toLowerCase()) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selectedElements = ranked
    .filter((entry) => entry.score > 0)
    .map((entry) => entry.item)
    .slice(0, 4);
  const fallbackElements = ranked.map((entry) => entry.item).slice(0, 3);
  const elements = selectedElements.length > 0 ? selectedElements : fallbackElements;

  return {
    subject: framework.subject,
    sourceFiles: framework.sourceFiles,
    sourceNotes: framework.sourceNotes,
    domains: framework.domains,
    selectedElements: elements,
    suggestedGoal: buildSuggestedGoal({
      subject: framework.subject,
      gradeBand,
      lessonContext,
      standards,
      elements,
    }),
  };
}

export function buildContextRubricCriteria(lessonContext: string): ContextRubricCriterion[] {
  const context = lessonContext.trim();
  const usesSource = /(글|기사|자료|뉴스|지문|사례)/.test(context);
  const expressesThought = /(생각|의견|주장|이유|근거|표현|댓글|쓰기)/.test(context);

  if (usesSource && expressesThought) {
    return [{
      key: "context-source-connection",
      label: "자료와 자신의 생각 연결",
      description: "자료의 내용과 자신의 생각·경험·지식을 구체적으로 연결하고 그 관계를 설명하는가?",
      observableEvidence: `${context} 이 활동에서 자료의 내용과 자신의 생각·경험·지식을 연결해 표현한 부분`,
    }];
  }

  const profiles: Array<ContextRubricCriterion & { keywords: string[] }> = [
    {
      key: "context-research",
      label: "자료 탐색과 이해",
      description: "수업 과제에 필요한 사례나 자료를 찾아 핵심 내용을 정확하게 이해하는가?",
      observableEvidence: `${context} 이 활동에서 필요한 사례·자료를 찾고 핵심 내용을 자기 말로 정리한 결과`,
      keywords: ["찾", "읽", "자료", "기사", "조사", "사례", "탐색"],
    },
    {
      key: "context-analysis",
      label: "비교와 분석 과정",
      description: "자료의 공통점과 차이점, 원인과 영향을 근거를 들어 분석하는가?",
      observableEvidence: `${context} 이 활동에서 비교 기준, 분석 근거, 판단 이유를 기록한 내용`,
      keywords: ["비교", "분석", "판단", "구분", "원인", "영향", "평가"],
    },
    {
      key: "context-expression",
      label: "자신의 생각 표현",
      description: "수업에서 이해한 내용을 바탕으로 자신의 생각이나 의견을 구체적으로 표현하는가?",
      observableEvidence: `${context} 이 활동을 마친 뒤 자신의 생각을 이유나 자료의 내용과 연결해 표현한 결과물`,
      keywords: ["생각", "의견", "표현", "주장", "설명", "발표", "댓글", "쓰기"],
    },
    {
      key: "context-solution",
      label: "해결 방안과 참여",
      description: "문제 상황을 고려하여 실현 가능한 해결 방안이나 참여 방법을 제안하는가?",
      observableEvidence: `${context} 이 활동에서 제안한 해결 방안, 참여 방법, 실천 계획의 구체성`,
      keywords: ["해결", "방안", "참여", "실천", "제안", "계획", "민주주의"],
    },
    {
      key: "context-product",
      label: "과제 수행과 결과물",
      description: "수업 맥락에서 요구한 절차와 조건을 지켜 결과물을 완성하는가?",
      observableEvidence: `${context} 이 활동에서 요구한 절차, 조건, 결과물의 완성 정도`,
      keywords: ["만들", "제작", "완성", "수행", "실험", "연주", "그리"],
    },
  ];

  const ranked = profiles
    .map((profile, index) => ({
      profile,
      index,
      score: profile.keywords.reduce((sum, keyword) => sum + (context.includes(keyword) ? 1 : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .map(({ profile }) => ({
      key: profile.key,
      label: profile.label,
      description: profile.description,
      observableEvidence: profile.observableEvidence,
    }));

  if (ranked.length > 0) return ranked;

  return [{
    key: "context-task",
    label: "수업 과제 수행",
    description: "수업 맥락에서 요구한 활동을 이해하고 과정과 결과를 충실하게 수행하는가?",
    observableEvidence: `${context || "이번 수업 활동"}의 수행 과정과 결과물`,
  }];
}

export function buildRubricCriterionDescription({
  key,
  focus,
  observableEvidence,
}: {
  key: string;
  focus: string;
  observableEvidence: string;
}) {
  const profiles: Record<string, RubricAchievementProfile> = {
    content: {
      "매우 잘함": "자료의 핵심 내용과 중요한 정보를 정확하게 이해하고, 자신의 말로 정리하여 결과물에 구체적으로 활용한다.",
      "잘함": "자료의 핵심 내용을 대체로 정확하게 이해하고, 관련 정보를 결과물에 활용한다.",
      "보통": "자료 내용의 일부를 이해하지만 핵심 내용이 빠지거나 중요한 정보의 활용이 부족하다.",
      "더 연습 필요": "자료 내용을 잘못 이해했거나 자료와 관련된 내용이 결과물에 거의 나타나지 않는다.",
    },
    connection: {
      "매우 잘함": "자료의 내용과 자신의 생각·경험·지식을 구체적으로 연결하고, 서로 어떤 관계인지 분명하게 설명한다.",
      "잘함": "자료의 내용과 자신의 생각을 자연스럽게 연결하여 표현한다.",
      "보통": "자신의 생각은 나타나지만 자료 내용과의 연결이나 비교가 약하다.",
      "더 연습 필요": "자신의 생각과 자료 내용의 관계가 거의 나타나지 않는다.",
    },
    expression: {
      "매우 잘함": "자신의 의견이 분명하며, 자료에서 찾은 내용이나 구체적인 이유를 근거로 들어 설득력 있게 표현한다.",
      "잘함": "자신의 의견과 그 이유를 비교적 분명하게 표현한다.",
      "보통": "자신의 의견은 나타나지만 이유나 근거가 부족하거나 설명이 충분하지 않다.",
      "더 연습 필요": "자신의 의견이 불분명하거나 이유와 근거가 거의 나타나지 않는다.",
    },
    analysis: {
      "매우 잘함": "비교 기준이나 자료의 근거를 바탕으로 공통점·차이점 또는 원인·영향의 관계를 정확하고 구체적으로 설명한다.",
      "잘함": "알맞은 기준을 사용하여 자료의 관계를 대체로 정확하게 분석한다.",
      "보통": "자료의 관계를 일부 설명하지만 비교 기준이나 분석 근거가 부족하다.",
      "더 연습 필요": "자료의 관계를 단순히 나열하거나 분석한 내용이 거의 나타나지 않는다.",
    },
    solution: {
      "매우 잘함": "문제 상황과 여러 관점을 고려하여 구체적이고 실천 가능한 해결 방안이나 참여 방법을 제안한다.",
      "잘함": "문제 상황에 맞는 해결 방안이나 참여 방법을 알맞게 제안한다.",
      "보통": "해결 방안을 제안하지만 문제 상황과의 연결이나 구체성이 부족하다.",
      "더 연습 필요": "문제와 관련된 해결 방안이 거의 없거나 실천하기 어렵다.",
    },
    interaction: {
      "매우 잘함": "상대의 의견을 정확히 이해하고 존중하며, 알맞은 질문·응답·보완 의견으로 생각을 발전시킨다.",
      "잘함": "상대의 의견을 존중하며 알맞게 질문하거나 응답한다.",
      "보통": "질문이나 응답은 있으나 상대 의견과의 연결이 부족하다.",
      "더 연습 필요": "상대 의견을 고려한 질문이나 응답이 거의 나타나지 않는다.",
    },
    performance: {
      "매우 잘함": "수업에서 요구한 절차와 조건을 정확히 이해하고, 과정과 결과를 충실하고 완성도 있게 수행한다.",
      "잘함": "수업에서 요구한 주요 절차와 조건을 지켜 결과물을 완성한다.",
      "보통": "수업 과제를 일부 수행했지만 필요한 절차·조건이나 결과가 충분하지 않다.",
      "더 연습 필요": "수업 과제의 요구를 이해한 흔적이나 완성된 결과가 거의 나타나지 않는다.",
    },
  };
  const profileKey = rubricAchievementProfileKey(key, focus);
  const profile = profiles[profileKey];
  const levels = RUBRIC_ACHIEVEMENT_LEVELS
    .map((level) => `${level}: ${profile[level]}`)
    .join("\n");

  return `평가 초점: ${focus}\n\n성취수준\n${levels}\n\n관찰 증거: ${observableEvidence}`;
}

function rubricAchievementProfileKey(key: string, focus: string) {
  if (/(source-connection)/.test(key)) return "connection";
  if (/(writing-evidence|expression)/.test(key)) return "expression";
  const signal = `${key} ${focus}`;
  if (/(생각.*연결|경험.*연결)/.test(signal)) return "connection";
  if (/(의견|주장|근거.*표현|생각 표현)/.test(signal)) return "expression";
  if (/(analysis|compare|comparison|cause|비교|분석|원인|영향|타당성 판단)/.test(signal)) return "analysis";
  if (/(solution|practice|participation|해결|참여|실천|의사 결정)/.test(signal)) return "solution";
  if (/(interaction|communication|상호작용|존중|소통)/.test(signal)) return "interaction";
  if (/(product|making|performance|수행|결과물|제작|연주)/.test(signal)) return "performance";
  return "content";
}

function buildSuggestedGoal({
  lessonContext,
  standards,
}: {
  subject: CurriculumSubject;
  gradeBand: string;
  lessonContext: string;
  standards: string[];
  elements: CurriculumAssessmentElement[];
}) {
  return buildEvaluationGoalFromStandards({ lessonContext, standards });
}

export function buildEvaluationGoalFromStandards({
  lessonContext,
  standards,
}: {
  lessonContext: string;
  standards: string[];
}) {
  const contextLead = toActivityContext(lessonContext.trim() || "이번 수업 활동");
  const achievementClauses = Array.from(new Set(
    standards
      .map(stripStandardCode)
      .filter(Boolean)
      .map(toAchievementClause),
  ));

  if (achievementClauses.length === 0) {
    return `${contextLead} 학생이 수업에서 배운 내용을 수행 과정과 결과물에 적용하는지를 평가한다.`;
  }

  return `${contextLead} 학생이 ${achievementClauses.join("와 ")}를 평가한다.`;
}

function stripStandardCode(value: string) {
  return value
    .trim()
    .replace(/^\[[^\]]+\]\s*(?:\|\s*)?/, "")
    .replace(/[.。]+$/, "")
    .trim();
}

function toActivityContext(value: string) {
  const context = value.trim().replace(/[.。]+$/, "");
  if (/\s*할 수 있다$/.test(context)) return context.replace(/\s*할 수 있다$/, "하는 활동에서");
  if (/한다$/.test(context)) return context.replace(/한다$/, "하는 활동에서");
  return `${context} 활동에서`;
}

function toAchievementClause(value: string) {
  const endings: Array<[RegExp, string]> = [
    [/수 있다$/, "수 있는지"],
    [/기른다$/, "기르는지"],
    [/갖는다$/, "갖는지"],
    [/만든다$/, "만드는지"],
    [/쓴다$/, "쓰는지"],
    [/읽는다$/, "읽는지"],
    [/한다$/, "하는지"],
    [/이다$/, "인지"],
  ];

  for (const [pattern, replacement] of endings) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }

  if (value.endsWith("다")) {
    const stem = value.slice(0, -1);
    const lastCharacter = stem.at(-1);
    if (lastCharacter) {
      const code = lastCharacter.charCodeAt(0);
      const hangulBase = 0xac00;
      const hangulEnd = 0xd7a3;
      const finalConsonant = code >= hangulBase && code <= hangulEnd ? (code - hangulBase) % 28 : -1;
      if (finalConsonant === 4) {
        const withoutFinalN = String.fromCharCode(code - finalConsonant);
        return `${stem.slice(0, -1)}${withoutFinalN}는지`;
      }
    }
    return `${stem}는지`;
  }

  return `${value}에 도달했는지`;
}
