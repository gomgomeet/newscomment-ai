import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(rootDir, "evals", "questioning-chatbot", "fixtures");
const resultDir = path.join(rootDir, "evals", "questioning-chatbot", "results");
const baseUrl = (process.env.QUESTIONING_EVAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const suiteFiles = {
  development: ["sessions.json"],
  holdout: ["holdout-sessions.json"],
  all: ["sessions.json", "holdout-sessions.json"],
};

function readSuiteArgument() {
  const inline = process.argv.find((value) => value.startsWith("--suite="));
  if (inline) return inline.slice("--suite=".length);
  const suiteIndex = process.argv.indexOf("--suite");
  return suiteIndex >= 0 ? process.argv[suiteIndex + 1] : "development";
}

const suite = readSuiteArgument();
if (!Object.hasOwn(suiteFiles, suite)) {
  throw new Error(`Unknown suite '${suite}'. Use development, holdout, or all.`);
}

const rubric = [
  { key: "standard_material_alignment", label: "성취기준·자료 연결" },
  { key: "evidence_check", label: "자료 근거 확인" },
  { key: "question_depth", label: "질문 유형 확장" },
  { key: "revision_reflection", label: "질문 다시 쓰기·성찰" },
].map((criterion) => ({
  ...criterion,
  description: criterion.label,
  observableEvidence: "합성 대화에서 관찰",
  feedbackForward: "교사가 검토",
  levels: [],
}));

const repairPattern = /(왜\s*자꾸|자꾸\s*물어|그만\s*물어|계속\s*틀렸|또\s*근거|제가\s*다\s*찾|설명만|부담|재촉)/;

function hasClosingSignal(value) {
  const compact = normalizeForMatch(value);
  return /(네|응|아|오케이|ㅇㅋ)?(이제)?(됐어요|됐어|알겠어요|알겠어|알겠음그만|알겠음|그만할래|그만할게요|그만할게|끝낼래|끝낼게요|끝낼게|여기까지만할게요|여기까지만할게|여기까지만|안할래|쉬고싶|ㅇㅋ이제끝|ㅇㅋ끝|그만)([.!?？]|$)/.test(
    compact,
  );
}
const boilerplatePatterns = [
  /이 부분은 자료에서 확인할 수 있어요/,
  /자료 속 단서는 이 부분과 연결됩니다/,
  /우리 상황에 연결해 보려면 이 부분을 먼저 보면 좋아요/,
  /좋은 점검이에요/,
  /말해 준 생각을 잘 들었어요/,
  /그 내용이 나온 부분을 자료에서 같이 찾아볼까요/,
  /좋아요[.!]\s*(확인한|우리|좋은|교사가)/,
];

function materialFromArticle(article) {
  return {
    materialTitle: article.title,
    summary: article.summary,
    visibleText: article.text,
    keyConcepts: article.keyConcepts,
    vocabulary: Array.isArray(article.vocabulary) ? article.vocabulary : [],
    possibleMisconceptions: [],
    questionSeeds: [],
    sourceLimit: "이 가상 기사에서 확인하거나 합리적으로 추론할 수 있는 범위",
    safetyNotice: "개인정보를 입력하지 않습니다.",
  };
}

function questionMarkCount(value) {
  return (value.match(/[?？]/g) || []).length;
}

function normalizeForMatch(value) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function expectationForTurn(expectations, turnNumber) {
  if (!expectations || typeof expectations !== "object") return [];
  const value = expectations[String(turnNumber)] ?? expectations[turnNumber];
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function matchesAny(reply, candidates) {
  const compactReply = normalizeForMatch(reply);
  return candidates.some((candidate) => compactReply.includes(normalizeForMatch(candidate)));
}

function sentenceCount(value) {
  const matches = value.match(/[^.!?？]+[.!?？]?/g) || [];
  return matches.map((item) => item.trim()).filter(Boolean).length;
}

function isVocabularyQuestion(value) {
  const normalized = value.trim().toLowerCase();
  const compact = normalizeForMatch(normalized);
  const semanticCompact = compact.replace(/["'“”‘’]/g, "");
  if (/(다는|라는|했다는|였다는|없다는|있다는|줄었다는|늘었다는)뜻/.test(semanticCompact)) return false;
  const quotedCandidate = /["'“‘]([^"'”’]{1,30})["'”’]/.exec(normalized)?.[1]?.trim();
  const quotedVocabularyQuestion = Boolean(
    quotedCandidate &&
      quotedCandidate.split(/\s+/).length <= 3 &&
      !/[.!?。？！]/.test(quotedCandidate) &&
      /(뜻|의미|뭐예요|뭔가요|무엇인가요)/.test(normalized),
  );
  return (
    quotedVocabularyQuestion ||
    /(낱말|단어|용어|표현).{0,16}(뜻|의미).{0,12}(뭐|무엇|알려|모르|궁금)/.test(normalized) ||
    /(뜻|의미).{0,12}(뭐|무엇|알려|모르|궁금)/.test(normalized) ||
    /(?:^|\s)[가-힣a-z][가-힣a-z0-9·\-]{1,24}(?:이|가|은|는)?\s*(무슨\s*뜻|무슨\s*말|뭐예요|뭔가요|무엇인가요)/.test(
      normalized,
    ) ||
    /(여기서|이\s*문장에서).{0,30}(뜻|의미|뭐예요|뭔가요)/.test(normalized)
  );
}

function inspectTurn({ response, session, turnNumber, studentTurn, previousReplies }) {
  const failures = [];
  const reviewFlags = [];
  const reply = typeof response.studentReply === "string" ? response.studentReply.trim() : "";
  const questionCount = questionMarkCount(reply);
  const includesAny = expectationForTurn(session.expectReplyIncludesAny, turnNumber);
  const excludes = expectationForTurn(session.expectReplyExcludes, turnNumber);
  const vocabularyQuestion = isVocabularyQuestion(studentTurn);

  if (response.schemaVersion !== 2) failures.push("schemaVersion must be 2");
  if (!reply) failures.push("studentReply is empty");
  if (questionCount > 1) failures.push("studentReply has more than one question mark");
  if (/(primaryMove|engagementState|curriculumRelation|supportLevel|rubricScores|루브릭\s*점수)/i.test(reply)) {
    failures.push("studentReply exposes internal metadata");
  }
  if (response.isClosing && response.expectsStudentReply) {
    failures.push("closing response cannot expect a student reply");
  }
  if (session.expectNoQuestionTurns?.includes(turnNumber) && questionCount > 0) {
    failures.push("turn expected no question");
  }
  if (session.expectClosingTurns?.includes(turnNumber) && !response.isClosing) {
    failures.push("turn expected isClosing=true");
  }
  if (repairPattern.test(studentTurn) && questionCount > 0) {
    failures.push("repair turn must not ask another question");
  }
  if (hasClosingSignal(studentTurn) && (!response.isClosing || questionCount > 0)) {
    failures.push("closing signal must close without a question");
  }
  if (previousReplies.includes(reply)) failures.push("assistant reply repeated exactly");
  if (vocabularyQuestion && !/(사전적으로|사전적|기본 뜻|국어사전)/.test(reply)) {
    failures.push("vocabulary response must distinguish the dictionary meaning");
  }
  if (vocabularyQuestion && !/(이 글|이 문장|이 자료|앞뒤 문장|쓰인 부분)/.test(reply)) {
    failures.push("vocabulary response must connect the meaning to source context");
  }
  if (includesAny.length > 0 && !matchesAny(reply, includesAny)) {
    failures.push(`reply must include one of: ${includesAny.join(" | ")}`);
  }
  if (excludes.length > 0 && matchesAny(reply, excludes)) {
    failures.push(`reply includes forbidden wording: ${excludes.join(" | ")}`);
  }

  if (reply.length > 320) reviewFlags.push("reply is longer than 320 characters");
  if (sentenceCount(reply) > 5) reviewFlags.push("reply has more than five sentences");
  if (boilerplatePatterns.some((pattern) => pattern.test(reply))) {
    reviewFlags.push("reply uses a known mechanical fallback phrase");
  }
  const opening = normalizeForMatch(reply).slice(0, 16);
  if (
    opening.length >= 12 &&
    previousReplies.some((candidate) => normalizeForMatch(candidate).slice(0, 16) === opening)
  ) {
    reviewFlags.push("reply repeats a recent opening");
  }

  return { failures, reviewFlags };
}

async function loadJson(name) {
  return JSON.parse(await readFile(path.join(fixtureDir, name), "utf8"));
}

async function loadSessions() {
  const groups = await Promise.all(suiteFiles[suite].map((name) => loadJson(name)));
  return groups.flat();
}

async function main() {
  const [articles, sessions] = await Promise.all([loadJson("articles.json"), loadSessions()]);
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  const results = [];
  let failureCount = 0;
  let reviewFlagCount = 0;
  let questionTurnCount = 0;
  let closingTurnCount = 0;
  let totalReplyLength = 0;

  for (const session of sessions) {
    const article = articlesById.get(session.articleId);
    if (!article) throw new Error(`Unknown article: ${session.articleId}`);

    const conversation = [];
    const previousReplies = [];
    const turns = [];

    for (const [index, studentTurn] of session.turns.entries()) {
      const startedAt = performance.now();
      const apiResponse = await fetch(`${baseUrl}/api/questioning-board/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standard: session.standard,
          targetGrade: session.targetGrade,
          subjectUnit: "질문 중심 기사 읽기",
          material: materialFromArticle(article),
          rubric,
          sessionId: `eval-${suite}-${session.id}`,
          question: studentTurn,
          conversation,
        }),
      });
      const response = await apiResponse.json();
      const elapsedMs = Math.round(performance.now() - startedAt);
      const inspection = apiResponse.ok
        ? inspectTurn({
            response,
            session,
            turnNumber: index + 1,
            studentTurn,
            previousReplies,
          })
        : {
            failures: [`HTTP ${apiResponse.status}: ${response.error || "unknown error"}`],
            reviewFlags: [],
          };

      failureCount += inspection.failures.length;
      reviewFlagCount += inspection.reviewFlags.length;
      if (questionMarkCount(response.studentReply || "") > 0) questionTurnCount += 1;
      if (response.isClosing) closingTurnCount += 1;
      totalReplyLength += (response.studentReply || "").length;
      turns.push({
        turnNumber: index + 1,
        studentTurn,
        studentReply: response.studentReply || "",
        expectsStudentReply: response.expectsStudentReply,
        isClosing: response.isClosing,
        localFallback: response.localFallback,
        noticeCode: response.noticeCode,
        elapsedMs,
        failures: inspection.failures,
        reviewFlags: inspection.reviewFlags,
      });

      if (apiResponse.ok && response.studentReply) {
        conversation.push({ role: "student", content: studentTurn });
        conversation.push({ role: "assistant", content: response.studentReply });
        previousReplies.push(response.studentReply.trim());
      }
    }

    results.push({
      sessionId: session.id,
      articleId: session.articleId,
      persona: session.persona,
      turns,
    });
  }

  const turnCount = results.reduce((total, session) => total + session.turns.length, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    suite,
    baseUrl,
    sessionCount: sessions.length,
    turnCount,
    failureCount,
    reviewFlagCount,
    metrics: {
      questionTurnRate: turnCount ? Number((questionTurnCount / turnCount).toFixed(3)) : 0,
      closingTurnCount,
      averageReplyLength: turnCount ? Math.round(totalReplyLength / turnCount) : 0,
    },
    results,
  };

  await mkdir(resultDir, { recursive: true });
  await writeFile(
    path.join(resultDir, `latest-${suite}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `Questioning dialogue eval (${suite}): ${report.sessionCount} sessions, ${report.turnCount} turns, ${failureCount} failures, ${reviewFlagCount} review flags\n`,
  );

  if (failureCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
