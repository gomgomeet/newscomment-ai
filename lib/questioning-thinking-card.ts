/**
 * 생각 카드(Thinking Card) 생성
 *
 * 배경 지식 카드를 "AI가 알아서 만들어 주는 목록"이 아니라, **학생 관점 시뮬레이션을
 * 거쳐 만드는 절차**로 구조화한다. 지문을 여러 학생 페르소나의 눈으로 훑어 각자가
 * 실제로 던질 법한 질문을 만들고, 그 질문에 지문이 답할 수 있는지 판정한 뒤,
 * 답할 수 없는 것만 배경 지식·확인 질문으로 넘긴다.
 *
 * 이 모듈은 지문에서 관찰 가능한 것만 뽑는다. 지문에 없는 사실을 지어내지 않으며,
 * 교사가 검토·수정할 초안을 만드는 것이 목적이다.
 */

import type { MaterialAnalysis, MaterialVocabularyEntry } from "./questioning-board";

/** 학생 관점: 같은 지문도 아이마다 다른 곳에서 걸린다. */
export type StudentLens =
  | "literal" // 사실 확인부터 하는 학생
  | "vocabulary" // 낱말에서 먼저 막히는 학생
  | "causal" // 까닭을 캐묻는 학생
  | "skeptical" // 정말 그런지 의심하는 학생
  | "personal" // 자기 경험과 잇는 학생
  | "boundary"; // 지문이 안 다룬 데를 짚는 학생

export const STUDENT_LENS_LABELS: Record<StudentLens, string> = {
  literal: "사실 확인",
  vocabulary: "낱말 이해",
  causal: "까닭 탐색",
  skeptical: "근거 의심",
  personal: "경험 연결",
  boundary: "범위 밖 관심",
};

/** 시뮬레이션으로 만든 질문 하나와, 지문이 답할 수 있는지에 대한 판정. */
export type SimulatedQuestion = {
  lens: StudentLens;
  lensLabel: string;
  question: string;
  /** 지문 안에서 답할 수 있는가 */
  answerableFromText: boolean;
  /** 답의 근거가 되는 지문 문장 (있을 때만) */
  evidenceSentence: string;
  /** 교사가 확인할 지점 — 지문 밖 질문일 때 어떻게 다룰지 */
  teacherNote: string;
};

export type ThinkingCard = {
  materialTitle: string;
  /** 지문 핵심 3문장 */
  coreSummary: string[];
  /** 학생 관점별 시뮬레이션 질문 */
  simulatedQuestions: SimulatedQuestion[];
  /** 지문 안에서 답할 수 있는 질문 수 / 전체 */
  answerableCount: number;
  /** 어휘표 초안 (교사 검토 전) */
  vocabulary: MaterialVocabularyEntry[];
  /** 학생이 착각하기 쉬운 지점 */
  misconceptionWatch: string[];
  /** 단정하지 말고 학생과 함께 확인할 질문 */
  openQuestions: string[];
  /** 교사가 카드를 쓰기 전에 채우거나 확인해야 하는 항목 */
  teacherChecklist: string[];
};

const SENTENCE_SPLIT = /(?<=[.!?。])\s+|\n+/;

function splitSentences(value: string): string[] {
  return value
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8);
}

/** 근거는 본문에서 찾는 것이 원칙이므로 본문과 요약을 나누어 둔다. */
function bodySentencesOf(material: MaterialAnalysis): string[] {
  return splitSentences(material.visibleText);
}

function sentencesOf(material: MaterialAnalysis): string[] {
  return splitSentences(`${material.visibleText}\n${material.summary}`);
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

/** 질문에서 뜻을 나르지 않는 말은 근거 탐색에서 제외한다. */
const EVIDENCE_STOPWORDS = new Set([
  "무엇인가요",
  "무엇인가",
  "어떻게",
  "어떤",
  "왜",
  "정말",
  "그렇게",
  "그런",
  "이런",
  "말고",
  "다른",
  "점은",
  "글에",
  "이글에",
  "숫자만",
  "보고",
  "있나요",
  "되었나요",
  "해보면",
  "우리반에서도",
  "왜안나오나요",
  "무슨뜻이에요",
]);

/**
 * 질문의 핵심어가 지문 문장에 실제로 있는지 확인해 근거 문장을 고른다.
 *
 * 근거는 **학생이 실제로 읽는 본문**에서만 찾는다. 교사 요약에 스치듯 걸린 것을
 * 근거로 인정하면 카드가 "다 답할 수 있다"고 잘못 보고하게 되고, 정작 수업에서
 * 학생이 물으면 챗봇이 답하지 못한다. 본문이 없는 자료(위치 안내형)일 때만
 * 요약을 근거 후보로 쓴다.
 */
function findEvidence(keywords: string[], bodySentences: string[], allSentences: string[]): string {
  const usable = Array.from(
    new Set(
      keywords
        .map(compact)
        .filter((keyword) => keyword.length >= 2 && !EVIDENCE_STOPWORDS.has(keyword)),
    ),
  );
  if (usable.length === 0) return "";

  const scoreOf = (sentence: string) => {
    const compactSentence = compact(sentence);
    return usable.filter((keyword) => compactSentence.includes(keyword)).length;
  };
  const required = usable.length >= 2 ? 2 : 1;

  const pickFrom = (pool: string[]) => {
    let best = "";
    let bestScore = 0;
    pool.forEach((sentence) => {
      const score = scoreOf(sentence);
      if (score > bestScore) {
        best = sentence;
        bestScore = score;
      }
    });
    return bestScore >= required ? best.slice(0, 120) : "";
  };

  // 본문이 있으면 본문에서만 판정한다. 본문이 비어 있을 때만 요약을 본다.
  return bodySentences.length > 0 ? pickFrom(bodySentences) : pickFrom(allSentences);
}

/** 지문에 등장하는 수치 표현을 찾는다. 수치가 있으면 의심·비교 질문이 성립한다. */
function findNumericSentences(sentences: string[]): string[] {
  return sentences.filter((sentence) => /\d/.test(sentence));
}

function firstKeyConcept(material: MaterialAnalysis, fallback: string) {
  const concept = material.keyConcepts.find((item) => item.trim().length >= 2);
  return concept ? concept.trim() : fallback;
}

/**
 * 학생 관점별로 질문을 만들고, 각 질문이 지문으로 답할 수 있는지 판정한다.
 * 판정은 "질문의 핵심어가 지문 문장에 있는가"로 하며, 없으면 지문 밖으로 분류해
 * 교사가 배경 지식으로 채울지 함께 확인할지 정하도록 남긴다.
 */
export function simulateStudentQuestions(material: MaterialAnalysis): SimulatedQuestion[] {
  const bodySentences = bodySentencesOf(material);
  const sentences = sentencesOf(material);
  const numericSentences = findNumericSentences(sentences);
  const topic = firstKeyConcept(material, material.materialTitle || "이 글의 주제");
  const firstVocabulary = material.vocabulary?.[0]?.term || "";
  const seeds = material.questionSeeds.filter((seed) => seed.trim().length > 0);

  const drafts: Array<Omit<SimulatedQuestion, "lensLabel" | "answerableFromText" | "evidenceSentence">> = [
    {
      lens: "literal",
      question: `${topic}에 대해 글에서 알려 준 것은 무엇인가요?`,
      teacherNote: "가장 먼저 나오는 질문이므로 근거 문장을 짚어 주며 시작합니다.",
    },
    {
      lens: "vocabulary",
      question: firstVocabulary
        ? `'${firstVocabulary}'이 무슨 뜻이에요?`
        : "이 글에서 어려운 낱말은 무슨 뜻이에요?",
      teacherNote: "사전 뜻만 먼저 답하고, 학생이 이어서 물으면 글 속 뜻을 설명합니다.",
    },
    {
      lens: "causal",
      question: `왜 ${topic}이 그렇게 되었나요?`,
      teacherNote: "지문이 까닭을 단정하지 않았다면 함께 변한 것과 원인을 구분해 줍니다.",
    },
    {
      lens: "skeptical",
      question:
        numericSentences.length > 0
          ? "이 숫자만 보고 정말 그렇다고 할 수 있나요?"
          : "글에 나온 내용이 정말 맞는지 어떻게 알 수 있나요?",
      teacherNote: "확인할 방법(다른 자료, 조건 비교)을 학생이 찾게 합니다.",
    },
    {
      lens: "personal",
      question: `우리 반에서도 ${topic}을 해 보면 어떻게 될까요?`,
      teacherNote: "지문 속 조건(기간·대상·방법)과 우리 상황을 견주게 합니다.",
    },
    {
      lens: "boundary",
      question: `${topic} 말고 다른 점은 이 글에 왜 안 나오나요?`,
      teacherNote: "지문의 한계를 인정하고, 배경 지식으로 답할지 함께 확인할지 정합니다.",
    },
  ];

  // 교사가 적어 둔 질문 씨앗이 있으면 사실 확인 질문을 그것으로 바꾼다.
  if (seeds.length > 0) {
    drafts[0] = {
      lens: "literal",
      question: seeds[0].trim(),
      teacherNote: "교사가 준비한 질문 씨앗입니다. 근거 문장을 함께 확인합니다.",
    };
  }

  return drafts.map((draft) => {
    const keywords = [topic, firstVocabulary, ...draft.question.split(/\s+/)].filter(Boolean);
    const evidenceSentence = findEvidence(keywords, bodySentences, sentences);
    return {
      ...draft,
      lensLabel: STUDENT_LENS_LABELS[draft.lens],
      answerableFromText: Boolean(evidenceSentence),
      evidenceSentence,
    };
  });
}

/** 지문에서 관찰되는 오개념 위험을 모은다. 지문에 없는 위험은 만들지 않는다. */
export function collectMisconceptionWatch(material: MaterialAnalysis): string[] {
  const watch = material.possibleMisconceptions
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const sentences = sentencesOf(material);
  const numericSentences = findNumericSentences(sentences);
  if (numericSentences.length >= 2 && !watch.some((item) => /원인|인과|때문/.test(item))) {
    watch.push(
      "두 가지가 함께 변했다는 이유만으로 하나가 원인이라고 단정할 수 있습니다. 지문이 원인을 밝혔는지 확인하게 합니다.",
    );
  }
  if (numericSentences.length > 0 && !watch.some((item) => /숫자|수치|비율/.test(item))) {
    watch.push(
      "숫자가 줄었다는 것만 보고 크기를 가늠하지 못할 수 있습니다. 변화량과 남은 양을 함께 보게 합니다.",
    );
  }
  return watch.slice(0, 4);
}

/** 지문이 답하지 않는 질문은 단정 대신 '함께 확인할 질문'으로 남긴다. */
export function buildOpenQuestions(simulated: SimulatedQuestion[]): string[] {
  return simulated
    .filter((item) => !item.answerableFromText)
    .map((item) => `${item.question} (${item.lensLabel} — 지문 밖이므로 함께 확인)`);
}

/**
 * 생각 카드를 만든다. 시뮬레이션 → 판정 → 분류 순서로 진행하며,
 * 교사가 반드시 채워야 할 빈칸은 체크리스트로 남긴다.
 */
export function buildThinkingCard(material: MaterialAnalysis): ThinkingCard {
  const sentences = sentencesOf(material);
  const simulatedQuestions = simulateStudentQuestions(material);
  const answerableCount = simulatedQuestions.filter((item) => item.answerableFromText).length;
  const vocabulary = material.vocabulary ? [...material.vocabulary] : [];

  const coreSummary = (material.summary.trim() ? material.summary.split(SENTENCE_SPLIT) : sentences)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8)
    .slice(0, 3);

  const teacherChecklist: string[] = [];
  if (coreSummary.length < 3) {
    teacherChecklist.push("지문 핵심 정리가 3문장에 못 미칩니다. 요약을 보완해 주세요.");
  }
  if (vocabulary.length === 0) {
    teacherChecklist.push("어휘표가 비어 있습니다. 학생이 물어볼 낱말을 등록해 주세요.");
  }
  const outOfText = simulatedQuestions.filter((item) => !item.answerableFromText);
  if (outOfText.length > 0) {
    teacherChecklist.push(
      `지문으로 답할 수 없는 질문이 ${outOfText.length}개입니다. 배경 지식으로 답할지, 함께 확인할지 정해 주세요.`,
    );
  }
  if (answerableCount === 0 && simulatedQuestions.length > 0) {
    teacherChecklist.push(
      "지문 본문에서 근거를 하나도 찾지 못했습니다. 자료 전체 내용이 입력되었는지, 핵심 개념이 본문 표현과 맞는지 확인해 주세요.",
    );
  }
  teacherChecklist.push("카드의 사실이 맞는지 확인해 주세요. 확인하지 않은 내용은 학생에게 그대로 전달됩니다.");

  return {
    materialTitle: material.materialTitle,
    coreSummary,
    simulatedQuestions,
    answerableCount,
    vocabulary,
    misconceptionWatch: collectMisconceptionWatch(material),
    openQuestions: buildOpenQuestions(simulatedQuestions),
    teacherChecklist,
  };
}

/** 교사가 읽고 고칠 수 있도록 카드를 글로 정리한다. */
export function formatThinkingCard(card: ThinkingCard): string {
  const lines: string[] = [];
  lines.push(`# 생각 카드 — ${card.materialTitle || "질문 자료"}`);
  lines.push("");
  lines.push("## 1. 지문 핵심");
  card.coreSummary.forEach((sentence, index) => lines.push(`${index + 1}. ${sentence}`));
  lines.push("");
  lines.push(`## 2. 학생 관점 시뮬레이션 (지문으로 답 가능 ${card.answerableCount}/${card.simulatedQuestions.length})`);
  card.simulatedQuestions.forEach((item) => {
    lines.push(`- **[${item.lensLabel}]** ${item.question}`);
    if (item.answerableFromText) {
      lines.push(`  - 지문 근거: "${item.evidenceSentence}"`);
    } else {
      lines.push("  - 지문 안에서 답을 찾지 못했습니다.");
    }
    lines.push(`  - 교사 메모: ${item.teacherNote}`);
  });
  lines.push("");
  if (card.vocabulary.length > 0) {
    lines.push("## 3. 어휘표");
    card.vocabulary.forEach((entry) => {
      lines.push(`- ${entry.term}: ${entry.dictionaryMeaning} / 이 글에서는 ${entry.contextualMeaning}`);
    });
    lines.push("");
  }
  if (card.misconceptionWatch.length > 0) {
    lines.push("## 4. 오개념 주의");
    card.misconceptionWatch.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }
  if (card.openQuestions.length > 0) {
    lines.push("## 5. 함께 확인할 질문");
    card.openQuestions.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }
  lines.push("## 6. 교사 확인 사항");
  card.teacherChecklist.forEach((item) => lines.push(`- [ ] ${item}`));
  return lines.join("\n");
}
