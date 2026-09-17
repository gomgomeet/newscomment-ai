import { createHash } from "node:crypto";

import {
  isQuestioningHintRequest,
  type ChatResult,
  type QuestioningConversationEntry,
} from "@/lib/questioning-board";

export type AssessmentPlan = {
  schemaVersion: 1;
  approved: boolean;
  criteria: Array<{
    id: string;
    criterion: string;
    responseKind: "explanation" | "student_question";
    mainQuestion: string;
    followUpQuestion: string;
    evidenceDescription: string;
    sourceQuote: string;
    requireSourceEvidence: boolean;
  }>;
};

export type AssessmentProgress = {
  schemaVersion: 1;
  planId: string;
  activeIndex: number;
  stage: "main" | "followup" | "complete";
  items: Array<{
    id: string;
    label: string;
    status: "pending" | "awaiting_evidence" | "collected" | "needs_review";
    attempts: number;
    hintCount: number;
    assisted: boolean;
    answerRequestId: string;
    evidenceRequestId: string;
  }>;
  lastEvent: {
    requestId: string;
    criterionId: string;
    kind: "answer" | "hint" | "question" | "skip" | "safety" | "closing" | "prompt";
    evidenceVerified: boolean;
  };
};

type AssessmentBaseResult = Pick<ChatResult,
  "studentReply" | "safetyFlag" | "isClosing" | "primaryMove" | "sourceStatus" |
  "sourceCue" | "questionType" | "curriculumRelation"
>;

export type LiteAssessmentTurn = {
  reply: string;
  progress: AssessmentProgress;
  allowQuestion: boolean;
  managedQuestion: string;
  isClosing: boolean;
  primaryMove: ChatResult["primaryMove"];
  sourceCue: string;
  sourceStatus: ChatResult["sourceStatus"];
};

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const PRIVATE_DATA = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}|\b\d{6}[-\s]?\d{7}\b|\bsk-[A-Za-z0-9_-]{16,})/i;
const HELP_REQUEST = /(?:질문|답|답안|정답|문장|숙제|수행평가).{0,25}(?:대신|만들어\s*(?:줘|주|주세요)|써\s*(?:줘|주|주세요)|작성해\s*(?:줘|주|주세요))|(?:정답|답안)\s*(?:을\s*)?알려|질문.{0,20}(?:어떻게|뭘).{0,15}(?:만들|쓰|적)/;
const SKIP = /^(?:이\s*(?:질문|문제|내용)(?:은|는)?\s*)?(?:그냥\s*)?(?:넘어갈래요?|넘어가(?:요|주세요)|건너뛸래요?|건너뛰(?:기|고\s*싶어요|어\s*주세요)|다음으로\s*(?:갈래요|가요|넘어가요))[.!\s]*$/;

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 형식을 확인해 주세요.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || value.trim().length > max) throw new Error(`${label}은(는) ${max}자 이내의 문자열이어야 합니다.`);
  return value.trim();
}

function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} 설정을 확인해 주세요.`);
  return value;
}

function integer(value: unknown, label: string, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} 범위를 확인해 주세요.`);
  }
  return value;
}

/** Approved plans are teacher-authored, bounded data, never provider instructions. */
export function normalizeAssessmentPlan(raw: unknown, materialText: string, validateApproval = true): AssessmentPlan {
  if (raw === undefined || raw === null || raw === "") return { schemaVersion: 1, approved: false, criteria: [] };
  if (typeof raw === "string") {
    if (raw.length > 12_000) throw new Error("질문 계획이 너무 큽니다.");
    try { raw = JSON.parse(raw); } catch { throw new Error("질문 계획 JSON 형식을 확인해 주세요."); }
  }
  const plan = object(raw, "질문 계획");
  if (plan.schemaVersion !== 1) throw new Error("질문 계획 버전을 확인해 주세요.");
  const approved = boolean(plan.approved, "질문 계획 승인");
  if (!Array.isArray(plan.criteria) || plan.criteria.length > 5) throw new Error("질문 계획은 최대 5개까지 작성해 주세요.");
  const ids = new Set<string>();
  const criteria = plan.criteria.map((rawCriterion) => {
    const item = object(rawCriterion, "질문 계획 항목");
    const id = item.id;
    if (typeof id !== "string" || !ID.test(id) || ids.has(id)) throw new Error("기준 ID 형식이나 중복을 확인해 주세요.");
    ids.add(id);
    if (item.responseKind !== "explanation" && item.responseKind !== "student_question") throw new Error("학생 수행 유형을 확인해 주세요.");
    const criterion: AssessmentPlan["criteria"][number] = {
      id,
      criterion: text(item.criterion, "평가기준", 180),
      responseKind: item.responseKind,
      mainQuestion: text(item.mainQuestion, "기본 질문", 250),
      followUpQuestion: text(item.followUpQuestion, "보충 질문", 250),
      evidenceDescription: text(item.evidenceDescription, "확인할 학생 수행", 300),
      sourceQuote: text(item.sourceQuote, "자료 단서", 240),
      requireSourceEvidence: boolean(item.requireSourceEvidence, "자료 인용 필요"),
    };
    if (approved && validateApproval) {
      if (!criterion.criterion || !criterion.mainQuestion || !criterion.followUpQuestion || !criterion.evidenceDescription || !criterion.sourceQuote) {
        throw new Error("질문 계획의 빈 항목을 채운 뒤 승인해 주세요.");
      }
      for (const question of [criterion.mainQuestion, criterion.followUpQuestion]) {
        if ((question.match(/[?？]/g) || []).length !== 1 || !/[?？]$/.test(question)) {
          throw new Error("질문마다 문장 끝에 물음표를 하나만 넣어 주세요.");
        }
      }
      if (!compactWhitespace(materialText).includes(compactWhitespace(criterion.sourceQuote))) {
        throw new Error("자료 단서는 수업자료 본문에 있는 구절을 그대로 넣어 주세요.");
      }
    }
    return criterion;
  });
  return { schemaVersion: 1, approved: approved && criteria.length > 0, criteria };
}

export function createAssessmentPlanId(plan: AssessmentPlan, lessonIdentity: string) {
  return createHash("sha256").update(JSON.stringify([lessonIdentity, plan])).digest("base64url");
}

function initialProgress(plan: AssessmentPlan, lessonIdentity: string): AssessmentProgress {
  return {
    schemaVersion: 1,
    planId: createAssessmentPlanId(plan, lessonIdentity),
    activeIndex: 0,
    stage: "main",
    items: plan.criteria.map((criterion) => ({
      id: criterion.id, label: criterion.criterion.slice(0, 80), status: "pending",
      attempts: 0, hintCount: 0, assisted: false, answerRequestId: "", evidenceRequestId: "",
    })),
    lastEvent: { requestId: "", criterionId: "", kind: "prompt", evidenceVerified: false },
  };
}

/** Reject stale/tampered state instead of silently interpreting it using a new rubric. */
export function normalizeAssessmentProgress(raw: unknown, plan: AssessmentPlan, lessonIdentity: string): AssessmentProgress | undefined {
  if (raw === undefined || raw === null) return undefined;
  const state = object(raw, "질문 진행 상태");
  const planId = createAssessmentPlanId(plan, lessonIdentity);
  if (state.schemaVersion !== 1 || state.planId !== planId) throw new Error("질문 계획이 바뀌었습니다. 새 수업 대화로 시작해 주세요.");
  const activeIndex = integer(state.activeIndex, "진행 위치", plan.criteria.length);
  const stage = state.stage;
  if (stage !== "main" && stage !== "followup" && stage !== "complete") throw new Error("질문 진행 단계를 확인해 주세요.");
  if ((stage === "complete") !== (activeIndex === plan.criteria.length)) throw new Error("질문 완료 상태를 확인해 주세요.");
  if (!Array.isArray(state.items) || state.items.length !== plan.criteria.length) throw new Error("질문 진행 항목 수를 확인해 주세요.");
  const items = state.items.map((rawItem, index): AssessmentProgress["items"][number] => {
    const item = object(rawItem, "질문 진행 항목");
    const criterion = plan.criteria[index];
    if (item.id !== criterion.id || item.label !== criterion.criterion.slice(0, 80)) throw new Error("질문 진행 기준이 일치하지 않습니다.");
    const status = item.status;
    if (status !== "pending" && status !== "awaiting_evidence" && status !== "collected" && status !== "needs_review") throw new Error("질문 수집 상태를 확인해 주세요.");
    const attempts = integer(item.attempts, "답변 시도", 2);
    const hintCount = integer(item.hintCount, "힌트 횟수", 99);
    const assisted = boolean(item.assisted, "도움 사용");
    const answerRequestId = text(item.answerRequestId, "답변 요청 ID", 100);
    const evidenceRequestId = text(item.evidenceRequestId, "인용 요청 ID", 100);
    if ((attempts > 0) !== Boolean(answerRequestId) || (hintCount > 0 && !assisted) || (evidenceRequestId && !answerRequestId)) throw new Error("질문 수집 근거를 확인해 주세요.");
    if (index < activeIndex && status !== "collected" && status !== "needs_review") throw new Error("이전 질문 진행 상태를 확인해 주세요.");
    if (index > activeIndex && (status !== "pending" || attempts || hintCount || assisted || answerRequestId || evidenceRequestId)) throw new Error("아직 시작하지 않은 질문 상태를 확인해 주세요.");
    if (index === activeIndex && (stage === "main" ? status !== "pending" || attempts !== 0 : status !== "awaiting_evidence" || attempts !== 1)) throw new Error("현재 질문 진행 상태를 확인해 주세요.");
    if (status === "collected" && (attempts < 1 || (criterion.requireSourceEvidence && !evidenceRequestId))) throw new Error("수집한 응답의 근거를 확인해 주세요.");
    return { id: criterion.id, label: criterion.criterion.slice(0, 80), status, attempts, hintCount, assisted, answerRequestId, evidenceRequestId };
  });
  const rawEvent = object(state.lastEvent, "마지막 진행 사건");
  const requestId = text(rawEvent.requestId, "마지막 요청 ID", 100);
  const criterionId = text(rawEvent.criterionId, "마지막 기준 ID", 40);
  const kinds = ["answer", "hint", "question", "skip", "safety", "closing", "prompt"] as const;
  const kind = rawEvent.kind as AssessmentProgress["lastEvent"]["kind"];
  if (!kinds.includes(kind) || (criterionId && !plan.criteria.some((item) => item.id === criterionId)) || (requestId && !criterionId)) throw new Error("마지막 진행 사건을 확인해 주세요.");
  const evidenceVerified = boolean(rawEvent.evidenceVerified, "마지막 인용 확인");
  if (evidenceVerified && kind !== "answer") throw new Error("인용 확인 사건을 확인해 주세요.");
  return { schemaVersion: 1, planId, activeIndex, stage, items, lastEvent: { requestId, criterionId, kind, evidenceVerified } };
}

function withoutQuestions(value: string) {
  return value.replace(/[^.!?。！？]*[?？]/g, " ").replace(/\s+/g, " ").trim();
}

function verifiedStudentQuote(turn: string, materialText: string) {
  const quotes = [...turn.matchAll(/“([^“”\n]{6,500})”|"([^"\n]{6,500})"|‘([^‘’\n]{6,500})’|'([^'\n]{6,500})'/g)];
  const source = compactWhitespace(materialText);
  return quotes.some((match) => {
    const quote = compactWhitespace(match[1] || match[2] || match[3] || match[4]);
    return quote.length >= 6 && source.includes(quote);
  });
}

function isQuestion(turn: string) {
  const outsideQuotes = turn.replace(/[“"‘'][^“”"‘’']*[”"’']/g, "");
  return /[?？]\s*$/.test(outsideQuotes) || /(?:나요|까요|인가요|무슨\s*뜻|알려\s*주세요|설명해\s*주세요)[.!\s]*$/.test(outsideQuotes);
}

function copiedAssistantQuestion(turn: string, history: QuestioningConversationEntry[]) {
  const normalized = compactWhitespace(turn).replace(/^[^“"‘']{0,25}(?:질문은|질문:|질문입니다:)\s*/, "").replace(/[“”"‘']/g, "").trim();
  return history.some((entry) => entry.role === "assistant" && (entry.content.match(/[^.!?。！？]*[?？]/g) || []).some((question) => {
    const candidate = compactWhitespace(question).replace(/[“”"‘']/g, "").trim();
    return candidate.length >= 6 && (normalized === candidate || normalized.endsWith(candidate));
  }));
}

function completionReply(progress: AssessmentProgress) {
  return progress.items.some((item) => item.status === "needs_review")
    ? "준비된 질문을 여기까지 살펴봤어요. 더 확인할 내용은 선생님이 네 답변을 보고 함께 살펴볼 거예요. 최종 평가는 선생님이 확인해요."
    : "준비된 질문에 대한 네 답변을 모았어요. 답변의 내용과 근거는 선생님이 살펴보고 최종 평가를 확인해요.";
}

/** No score or semantic mastery is inferred: collected means response-format evidence only. */
export function runLiteAssessmentTurn({ plan: rawPlan, lessonIdentity, materialText, currentTurn, requestId, progress: rawProgress, baseResult, history = [] }: {
  plan: AssessmentPlan;
  lessonIdentity: string;
  materialText: string;
  currentTurn: string;
  requestId: string;
  progress?: AssessmentProgress | unknown;
  baseResult: AssessmentBaseResult;
  history?: QuestioningConversationEntry[];
}): LiteAssessmentTurn | null {
  const plan = normalizeAssessmentPlan(rawPlan, materialText);
  if (!plan.approved || !plan.criteria.length) return null;
  const eventRequestId = text(requestId, "요청 ID", 100);
  if (!eventRequestId) throw new Error("요청 ID를 입력해 주세요.");
  const turn = text(currentTurn, "학생 발화", 800);
  const progress = normalizeAssessmentProgress(rawProgress, plan, lessonIdentity) || initialProgress(plan, lessonIdentity);
  const isDuplicate = progress.lastEvent.requestId === eventRequestId || progress.items.some((entry) => entry.answerRequestId === eventRequestId || entry.evidenceRequestId === eventRequestId);
  const active = plan.criteria[progress.activeIndex];
  const item = progress.items[progress.activeIndex];
  const event = (kind: AssessmentProgress["lastEvent"]["kind"], evidenceVerified = false) => {
    if (!isDuplicate) progress.lastEvent = { requestId: eventRequestId, criterionId: active?.id || progress.items.at(-1)!.id, kind, evidenceVerified };
  };
  const result = (lead: string, question = "", sourceCue = "", sourceStatus: ChatResult["sourceStatus"] = "reasonable_inference", primaryMove: ChatResult["primaryMove"] = "receive", isClosing = false): LiteAssessmentTurn => ({
    reply: [lead, question].filter(Boolean).join(" "), progress,
    allowQuestion: Boolean(question), managedQuestion: question, isClosing, primaryMove, sourceCue, sourceStatus,
  });
  const currentQuestion = () => progress.stage === "followup" ? active.followUpQuestion : active.mainQuestion;
  const preserveBase = () => result(baseResult.studentReply, "", baseResult.sourceCue, baseResult.sourceStatus, baseResult.primaryMove, baseResult.isClosing);
  // Safety and student-controlled stopping must never become evaluation attempts.
  if (baseResult.safetyFlag || baseResult.primaryMove === "safety_redirect" || PRIVATE_DATA.test(turn)) {
    event("safety");
    return baseResult.safetyFlag || baseResult.primaryMove === "safety_redirect" ? preserveBase()
      : result("이름이나 연락처 같은 개인정보는 빼고 이야기해 주세요.", "", "", "out_of_scope", "safety_redirect");
  }
  if (baseResult.isClosing) { event("closing"); return preserveBase(); }
  if (progress.stage === "complete") return result(completionReply(progress), "", "", "reasonable_inference", "close", true);
  if (baseResult.questionType === "off_topic" || baseResult.sourceStatus === "out_of_scope" || baseResult.curriculumRelation === "disconnected" || baseResult.primaryMove === "repair") {
    event("question"); return preserveBase();
  }
  const advance = (status: "collected" | "needs_review") => {
    item.status = status;
    progress.activeIndex += 1;
    progress.stage = progress.activeIndex === plan.criteria.length ? "complete" : "main";
  };
  const nextQuestion = () => plan.criteria[progress.activeIndex]?.mainQuestion || "";
  if (SKIP.test(turn)) {
    if (!isDuplicate) { event("skip"); advance("needs_review"); }
    return progress.activeIndex === plan.criteria.length ? result(completionReply(progress), "", "", "reasonable_inference", "close", true)
      : result("이 질문은 선생님과 다시 살펴볼 수 있도록 남겨 둘게요.", nextQuestion());
  }
  if (isQuestioningHintRequest(turn) || /^(?:잘\s*)?(?:모르겠어요|모르겠어|몰라요|모르겠습니다)[.!\s]*$/.test(turn)) {
    if (!isDuplicate) { item.hintCount = Math.min(99, item.hintCount + 1); item.assisted = true; event("hint"); }
    const quote = PRIVATE_DATA.test(active.sourceQuote) ? "" : active.sourceQuote.split(/[?？]/).sort((a, b) => b.length - a.length)[0].trim();
    return result(quote ? `자료의 “${quote}” 부분을 단서로 살펴보세요.` : "개인정보가 없는 자료 부분에서 단서를 찾아보세요.", currentQuestion(), quote, quote ? "supported" : "source_insufficient", "offer_clue");
  }
  const asksHelp = HELP_REQUEST.test(turn);
  const copied = active.responseKind === "student_question" && copiedAssistantQuestion(turn, [
    ...history,
    ...plan.criteria.flatMap((criterion): QuestioningConversationEntry[] => [
      { role: "assistant", content: criterion.mainQuestion },
      { role: "assistant", content: criterion.followUpQuestion },
    ]),
  ]);
  if (asksHelp || copied) {
    if (!isDuplicate) { item.assisted = true; event("question"); }
    return result(copied ? "챗봇이 한 질문을 그대로 옮기기보다는 네가 궁금한 점을 담아 질문을 만들어 보세요." : "완성된 답이나 질문을 대신 만들지는 않을게요. 자료에서 네가 궁금하거나 말하고 싶은 부분부터 골라 보세요.", currentQuestion(), "", "reasonable_inference", "offer_clue");
  }
  if (active.responseKind === "explanation" && isQuestion(turn)) {
    if (!isDuplicate) item.assisted = true;
    event("question");
    return result(withoutQuestions(baseResult.studentReply) || "자료에서 확인할 수 있는 범위를 먼저 살펴볼게요.", currentQuestion(), baseResult.sourceCue, baseResult.sourceStatus, baseResult.primaryMove);
  }
  if (!turn || /^(?:시작|시작할게요|준비됐어요)[.!\s]*$/.test(turn)) {
    event("prompt"); return result("", currentQuestion());
  }
  if (!rawProgress && !history.some((entry) => entry.role === "assistant" && compactWhitespace(entry.content).includes(compactWhitespace(plan.criteria[0].mainQuestion)))) {
    event("prompt"); return result("", currentQuestion());
  }
  // A retry cannot increment attempts or evidence. GAS also deduplicates row writes.
  if (isDuplicate) return result("", currentQuestion());
  const evidenceVerified = verifiedStudentQuote(turn, materialText);
  const enoughResponse = turn.replace(/\s|[.!?？“”"‘']/g, "").length >= 6;
  const collected = enoughResponse && (!active.requireSourceEvidence || evidenceVerified) &&
    (active.responseKind !== "student_question" || isQuestion(turn));
  item.attempts += 1;
  item.answerRequestId = eventRequestId;
  if (evidenceVerified) item.evidenceRequestId = eventRequestId;
  event("answer", evidenceVerified);
  if (collected || item.attempts >= 2) {
    advance(collected ? "collected" : "needs_review");
    if (progress.activeIndex === plan.criteria.length) return result(completionReply(progress), "", "", "reasonable_inference", "close", true);
    return result(collected ? "네 답변을 남겼어요. 이어서 다른 내용을 살펴볼게요." : "이 답변은 선생님이 함께 살펴볼 수 있도록 남겼어요.", nextQuestion());
  }
  item.status = "awaiting_evidence";
  progress.stage = "followup";
  return result(active.responseKind === "student_question"
    ? active.requireSourceEvidence ? "자료에서 찾은 구절을 따옴표로 묶고, 그 구절과 연결되는 네 질문을 남겨 주세요." : "네가 만든 질문 한 가지를 남겨 주세요."
    : active.requireSourceEvidence ? "자료에서 찾은 구절을 따옴표로 묶고 네 설명과 연결해 주세요." : "네가 생각한 내용을 조금 더 풀어서 남겨 주세요.", active.followUpQuestion, "", "reasonable_inference", "check_evidence");
}
