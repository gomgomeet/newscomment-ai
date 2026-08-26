/**
 * 학생의 답에서 '신호'를 찾아 점수를 매긴다.
 *
 * 왜 이렇게 하나 — LLM에게 "몇 점이에요?"라고 물으면 후하게 준다. 첫 실수업에서
 * 낱말 뜻만 넷 물은 학생이 10점을 받았다. 그래서 채점을 판정으로 바꾼다.
 * 모델에게는 "이 신호가 있나?"만 묻고, 점수는 이 파일이 계산한다.
 *
 * 신호는 관찰할 수 있는 것이어야 한다. "생각이 깊다"는 신호가 아니고,
 * "처음엔 …인 줄 알았어처럼 생각이 달라졌음을 말했다"는 신호다.
 */

export type SignalKey =
  | "attempted"       // 답을 했다 — 무응답과 가르는 최소 신호
  | "targetMarker"    // 성취기준 표적 행동의 말투가 보인다
  | "passageEcho"     // 지문의 말을 끌어다 썼다
  | "ownWording"      // 자기 말로 바꿔 말했다
  | "reasonGiven"     // 까닭을 붙였다
  | "hedged"          // 단정하지 않고 가능성으로 말했다
  | "selfReference";  // 자기 생각·느낌을 드러냈다

export type StandardTarget = {
  key: string;
  /** 교사에게 보일 이름 */
  label: string;
  /** 이 성취기준이 학생에게 시키려는 행동 */
  behavior: string;
  /** 표적 행동이 드러날 때 학생 말에 나타나는 말투 */
  markers: RegExp;
  /** 2국면에서 챗봇이 던질 질문의 본. 지문에 맞춰 다듬어 쓴다. */
  askTemplate: string;
};

const TARGETS: StandardTarget[] = [
  {
    key: "monitor_reading",
    label: "읽기 과정 점검",
    behavior: "읽으면서 자기 이해가 달라지거나 막힌 지점을 알아차려 말한다",
    markers:
      /(줄\s*알았|처음(엔|에는|에)|이제\s*보니|다시\s*보니|알고\s*보니|달라졌|바뀌었|헷갈렸|몰랐|착각|아하|그렇구나)/,
    askTemplate: "읽으면서 처음 생각과 달라진 부분이 무엇이었는지 말해 줄래?",
  },
  {
    key: "main_idea",
    label: "중심 생각 파악",
    behavior: "글 전체가 하고 싶은 말을 한 문장으로 짚는다",
    markers: /(하고\s*싶은\s*말|중심\s*(생각|내용)|말하려는|요지|한마디로|결국|전체적으로)/,
    askTemplate: "이 글이 가장 하고 싶은 말은 뭐라고 생각해?",
  },
  {
    key: "cause_effect",
    label: "원인과 영향",
    behavior: "무엇 때문에 그렇게 되었는지 지문 근거로 설명한다",
    markers: /(때문|덕분|그래서|까닭|원인|영향|바람에|탓)/,
    askTemplate: "글에서는 왜 그런 일이 생겼다고 말하고 있어?",
  },
  {
    key: "predict",
    label: "예측하며 읽기",
    behavior: "제목·앞부분을 보고 이어질 내용을 미리 헤아린다",
    markers: /(일\s*것\s*같|나올\s*것\s*같|예상|짐작|아마|~?겠다|겠어|싶었)/,
    askTemplate: "제목을 처음 봤을 때 어떤 내용이 나올 것 같았어?",
  },
  {
    key: "claim_evidence",
    label: "주장과 근거",
    behavior: "주장과 그 근거를 구분해 말한다",
    markers: /(주장|근거|왜냐하면|이유는|뒷받침|타당|반대로|하지만)/,
    askTemplate: "글쓴이는 무엇을 주장하고, 그렇게 말하는 까닭은 뭐라고 했어?",
  },
  {
    key: "compare",
    label: "비교하기",
    behavior: "둘 이상을 견주어 차이를 설명한다",
    markers: /(보다|반면|다르게|차이|둘\s*다|비교|더\s*많|더\s*적)/,
    askTemplate: "글에 나온 것 중 서로 견주어 볼 만한 두 가지는 뭐야?",
  },
  {
    key: "apply",
    label: "적용·제안",
    behavior: "글의 내용을 자기 상황이나 새 상황으로 옮겨 본다",
    markers: /(우리\s*(반|학교|집)|나라면|내가\s*(하면|라면)|하면\s*될|해\s*보면|제안|실천)/,
    askTemplate: "이 글에서 배운 것을 우리 반에서 해 본다면 무엇부터 하면 좋을까?",
  },
];

const DEFAULT_TARGET: StandardTarget = {
  key: "grounded_reading",
  label: "자료 근거로 읽기",
  behavior: "지문에 적힌 것을 근거로 들어 말한다",
  markers: /(자료|글에|여기|이\s*문장|나와\s*있|적혀|써\s*있)/,
  askTemplate: "글에서 가장 중요하다고 생각한 부분은 어디야?",
};

/**
 * 성취기준과 교사 메모에서 표적을 고른다.
 * 교사 메모를 함께 보는 이유 — 성취기준 문장에는 안 나오지만 수업에서 강조한 것이
 * 있다. "오늘은 예측이 핵심이에요" 같은 말이 메모에 남는다.
 */
export function buildStandardTargets(standard: string, teacherMemo = ""): StandardTarget[] {
  const source = `${standard} ${teacherMemo}`.trim();
  if (!source) return [DEFAULT_TARGET];

  const hit = (words: string[]) => words.some((word) => source.includes(word));
  const picked: StandardTarget[] = [];
  const take = (key: string) => {
    const found = TARGETS.find((target) => target.key === key);
    if (found && !picked.some((item) => item.key === key)) picked.push(found);
  };

  if (hit(["점검", "성찰", "돌아보", "과정을"])) take("monitor_reading");
  if (hit(["중심 생각", "중심생각", "요지", "주제", "파악"])) take("main_idea");
  if (hit(["원인", "영향", "까닭", "왜"])) take("cause_effect");
  if (hit(["예측", "예상"])) take("predict");
  if (hit(["주장", "근거", "논증", "타당", "설득"])) take("claim_evidence");
  if (hit(["비교", "견주"])) take("compare");
  if (hit(["적용", "해결", "제안", "실천"])) take("apply");

  // 표적이 둘을 넘으면 대화가 길어진다. 앞의 둘만 쓴다.
  return picked.length > 0 ? picked.slice(0, 2) : [DEFAULT_TARGET];
}

// ---------------------------------------------------------------------------
// 신호 찾기
// ---------------------------------------------------------------------------

const HEDGE = /(것\s*같|아마|짐작|~?일지도|수도\s*있|아닐까|생각해|듯)/;
const REASON = /(때문|왜냐|까닭|이유|그래서|덕분|니까|으니|아서|어서|라서|거든)/;
const SELF =
  /(내\s*생각|나는|난\s*|느꼈|느낌|좋았|싫었|놀랐|슬펐|화났|무서|겁나|신기|재미|안타|다행|불쌍|미안|고마|바란다|싶어|같아서)/;

/** 지문에서 뜻을 지닌 낱말만 남긴다. 조사와 흔한 말은 뺀다. */
function contentWordsOf(text: string) {
  const stop = new Set(["그리고", "하지만", "그런데", "이것", "그것", "우리", "있다", "했다", "이다"]);
  return new Set(
    text
      .split(/[^가-힣A-Za-z0-9]+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2)
      .map((word) => word.replace(/(에서는|에서|이라는|으로|에게|은|는|이|가|을|를|도|만|와|과|의)$/, ""))
      .filter((word) => word.length >= 2 && !stop.has(word)),
  );
}

export function detectSignals({
  answer,
  target,
  passage,
}: {
  answer: string;
  target?: StandardTarget;
  passage: string;
}): Set<SignalKey> {
  const found = new Set<SignalKey>();
  const trimmed = answer.trim();
  // 한 글자 대답("응", "네")은 답으로 세지 않는다. 시도조차 아니다.
  if (trimmed.replace(/[\s.!?~]/g, "").length >= 2) found.add("attempted");
  if (!found.has("attempted")) return found;

  if (target?.markers.test(trimmed)) found.add("targetMarker");
  if (HEDGE.test(trimmed)) found.add("hedged");
  if (REASON.test(trimmed)) found.add("reasonGiven");
  if (SELF.test(trimmed)) found.add("selfReference");

  const passageWords = contentWordsOf(passage);
  const answerWords = contentWordsOf(trimmed);
  let shared = 0;
  answerWords.forEach((word) => {
    if (passageWords.has(word)) shared += 1;
  });
  if (shared >= 1) found.add("passageEcho");
  // 지문 말을 가져오되 그대로 옮기지만은 않았다면 자기 말로 바꾼 것으로 본다.
  if (shared >= 1 && answerWords.size >= shared + 2) found.add("ownWording");

  return found;
}

// ---------------------------------------------------------------------------
// 점수
// ---------------------------------------------------------------------------

/**
 * 성취기준 질문(ⓑ)에 대한 답.
 *
 * 답을 했으면 최소 2점을 준다 — 시도 자체를 인정한다. 표적 말투가 없으면
 * 3점을 넘지 못한다. 후해지는 것을 막는 상한이다.
 */
export function scoreStandardResponse(signals: Set<SignalKey>): number {
  if (!signals.has("attempted")) return 1;
  const marker = signals.has("targetMarker");
  const echo = signals.has("passageEcho");
  const reason = signals.has("reasonGiven");
  if (marker && echo && (reason || signals.has("ownWording"))) return 5;
  if (marker && (echo || reason)) return 4;
  if (marker) return 3;
  return echo ? 3 : 2;
}

/** 지문 이해 질문(ⓐ)에 대한 답. 지문 근거가 있느냐가 중심이다. */
export function scoreComprehensionResponse(signals: Set<SignalKey>): number {
  if (!signals.has("attempted")) return 1;
  const echo = signals.has("passageEcho");
  if (echo && signals.has("ownWording") && signals.has("reasonGiven")) return 5;
  if (echo && signals.has("ownWording")) return 4;
  if (echo) return 3;
  return 2;
}

/**
 * 생각·의견 질문(ⓒ)에 대한 답.
 *
 * 여기에는 정답이 없다. 옳고 그름이 아니라 '자기 말로 표현했는가'만 본다.
 * 그래서 지문 인용이 없어도 4점까지 갈 수 있다.
 */
export function scoreOpinionResponse(signals: Set<SignalKey>): number {
  if (!signals.has("attempted")) return 1;
  const self = signals.has("selfReference");
  const reason = signals.has("reasonGiven");
  if (self && reason && signals.has("passageEcho")) return 5;
  if (self && (reason || signals.has("passageEcho"))) return 4;
  if (self) return 3;
  return 2;
}

/**
 * 지문을 넘어서는 추론 질문 — 학생이 '물은' 것을 본다.
 *
 * 이건 답이 아니라 질문을 평가한다. 자료 밖으로 나갔다고 깎지 않는다.
 * 스스로 궁금해했다는 것 자체가 값지고, 근거를 붙였다면 더 값지다.
 */
export function scoreBeyondTextQuestion(signals: Set<SignalKey>): number {
  if (!signals.has("attempted")) return 0;
  const grounded = signals.has("passageEcho");
  const reason = signals.has("reasonGiven") || signals.has("hedged");
  if (grounded && reason) return 5;   // 글에서 출발해 근거를 대며 넘어갔다
  if (grounded) return 4;             // 글에서 출발했다
  if (reason) return 3;               // 까닭을 붙여 물었다
  return 2;                           // 궁금해했다
}

// ---------------------------------------------------------------------------
// 세특 초안 프롬프트
// ---------------------------------------------------------------------------

/**
 * 네 항목의 점수와 근거를 주고 세특 문장을 받는다.
 *
 * 첫 실수업에서 나온 세특 문장 대부분이 "…설명했습니다", "…안내했습니다"처럼
 * **챗봇이 한 일**을 적고 있었다. 세 건은 챗봇이 학생에게 한 말이 그대로
 * 들어갔다. 세특은 학생을 적는 글이므로 주어를 못박는다.
 */
export function buildStudentRecordPrompt({
  standard,
  targetGrade,
  materialTitle,
  targets,
}: {
  standard: string;
  targetGrade: string;
  materialTitle: string;
  targets: StandardTarget[];
}) {
  return [
    `${targetGrade} 학생의 질문하기 수업 기록을 읽고 세특 초안을 씁니다.`,
    `수업 자료: ${materialTitle}`,
    `성취기준: ${standard}`,
    `이 수업의 표적 행동: ${targets.map((target) => `${target.label} — ${target.behavior}`).join(" / ")}`,
    "",
    "네 항목의 점수와 근거를 함께 줍니다. 항목마다 학생이 실제로 한 말이 근거로 붙습니다.",
    "① 질문하기 ② 지문 이해 ③ 성취기준 ④ 성찰과 의견 표현",
    "",
    "반드시 지킬 것",
    "1. 주어는 학생이다. '학생은 …했다'로 쓴다. 챗봇이 무엇을 설명했는지 쓰지 않는다.",
    "2. 챗봇이 학생에게 한 말을 그대로 옮기지 않는다. 학생의 말과 행동만 근거로 쓴다.",
    "3. 하지 않은 것을 쓰지 않는다. 점수가 낮은 항목은 억지로 좋게 쓰지 말고 그대로 둔다.",
    "4. 학생 이름을 쓰지 않는다. 기록에는 학교_반_번호만 있다.",
    "5. 두세 문장. 첫 문장은 가장 점수가 높은 항목의 구체적 행동으로 시작한다.",
    "6. 학생이 실제로 쓴 표현을 한 번은 인용해 근거를 보이게 한다.",
    "7. 마지막에 다음 수업에서 도울 한 가지를 한 문장으로 붙인다.",
    "",
    "쓰지 말아야 할 말",
    "'적극적으로', '열심히', '뛰어난'처럼 근거 없이 칭찬하는 말. 대신 무엇을 했는지 적는다.",
    "'AI를 활용하여'처럼 도구를 주어로 삼는 말.",
    "",
    "보기",
    "좋음: 학생은 '잠식되다'의 뜻을 물은 뒤 그 낱말이 쓰인 문장을 다시 찾아 읽으며 글의 첫 문단을 이해하려 했다. 읽는 도중 '그린피스가 나라인 줄 알았다'며 자기 오해를 스스로 알아차려 말했다. 다음에는 까닭을 묻는 질문으로 넓혀 가도록 돕는다.",
    "나쁨: 학생의 질문에 자료의 핵심 내용을 정확히 요약하여 제공했습니다.  ← 챗봇이 한 일이다",
  ].join("\n");
}
