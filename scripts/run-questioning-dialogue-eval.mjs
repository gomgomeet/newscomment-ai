import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(rootDir, "evals", "questioning-chatbot", "fixtures");
const resultDir = path.join(rootDir, "evals", "questioning-chatbot", "results");
const baseUrl = (process.env.QUESTIONING_EVAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

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

const behavior = {
  classifierKeywords: {
    safety: ["전화번호", "주소", "비밀번호", "답 다 써", "대필"],
    off_topic: ["게임", "연예인", "주식"],
    reflection: ["내 생각", "달라진", "배운 점"],
    extension: ["더 알아", "모든 학교", "다른 예"],
    application: ["우리", "나라면", "실천", "해결"],
    inference: ["왜", "어떻게", "까닭", "원인"],
  },
  offTopicResponse: "수업 내용과 관련된 질문에 대해서만 응답할 수 있어요.",
  insufficientQuestionResponse: "바로 답을 정하지 않아도 괜찮아요.",
  additionalInstructions:
    "학생의 실제 관심을 먼저 이어 받고 질문은 생각을 열 때만 최대 하나 사용한다.",
};

function materialFromArticle(article) {
  return {
    materialTitle: article.title,
    summary: article.summary,
    visibleText: article.text,
    keyConcepts: article.keyConcepts,
    possibleMisconceptions: [],
    questionSeeds: [],
    sourceLimit: "이 가상 기사에서 확인하거나 합리적으로 추론할 수 있는 범위",
    safetyNotice: "개인정보를 입력하지 않습니다.",
  };
}

function questionMarkCount(value) {
  return (value.match(/[?？]/g) || []).length;
}

function inspectTurn({ response, session, turnNumber, previousReply }) {
  const failures = [];
  const reply = typeof response.studentReply === "string" ? response.studentReply.trim() : "";

  if (response.schemaVersion !== 2) failures.push("schemaVersion must be 2");
  if (!reply) failures.push("studentReply is empty");
  if (questionMarkCount(reply) > 1) failures.push("studentReply has more than one question mark");
  if (/(primaryMove|engagementState|curriculumRelation|supportLevel|rubricScores|루브릭\s*점수)/i.test(reply)) {
    failures.push("studentReply exposes internal metadata");
  }
  if (response.isClosing && response.expectsStudentReply) {
    failures.push("closing response cannot expect a student reply");
  }
  if (session.expectNoQuestionTurns?.includes(turnNumber) && questionMarkCount(reply) > 0) {
    failures.push("turn expected no question");
  }
  if (session.expectClosingTurns?.includes(turnNumber) && !response.isClosing) {
    failures.push("turn expected isClosing=true");
  }
  if (previousReply && previousReply === reply) failures.push("assistant reply repeated exactly");

  return failures;
}

async function loadJson(name) {
  return JSON.parse(await readFile(path.join(fixtureDir, name), "utf8"));
}

async function main() {
  const [articles, sessions] = await Promise.all([
    loadJson("articles.json"),
    loadJson("sessions.json"),
  ]);
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  const results = [];
  let failureCount = 0;

  for (const session of sessions) {
    const article = articlesById.get(session.articleId);
    if (!article) throw new Error(`Unknown article: ${session.articleId}`);

    const conversation = [];
    let previousReply = "";
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
          behavior,
          sessionId: `eval-${session.id}`,
          question: studentTurn,
          conversation,
        }),
      });
      const response = await apiResponse.json();
      const elapsedMs = Math.round(performance.now() - startedAt);
      const failures = apiResponse.ok
        ? inspectTurn({
            response,
            session,
            turnNumber: index + 1,
            previousReply,
          })
        : [`HTTP ${apiResponse.status}: ${response.error || "unknown error"}`];

      failureCount += failures.length;
      turns.push({
        turnNumber: index + 1,
        studentTurn,
        studentReply: response.studentReply || "",
        expectsStudentReply: response.expectsStudentReply,
        isClosing: response.isClosing,
        localFallback: response.localFallback,
        noticeCode: response.noticeCode,
        elapsedMs,
        failures,
      });

      if (apiResponse.ok && response.studentReply) {
        conversation.push({ role: "student", content: studentTurn });
        conversation.push({ role: "assistant", content: response.studentReply });
        previousReply = response.studentReply.trim();
      }
    }

    results.push({ sessionId: session.id, articleId: session.articleId, turns });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    sessionCount: sessions.length,
    turnCount: results.reduce((total, session) => total + session.turns.length, 0),
    failureCount,
    results,
  };

  await mkdir(resultDir, { recursive: true });
  await writeFile(path.join(resultDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Questioning dialogue eval: ${report.sessionCount} sessions, ${report.turnCount} turns, ${failureCount} failures\n`,
  );

  if (failureCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
