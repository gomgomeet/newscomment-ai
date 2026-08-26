/**
 * 질문 분석 — 평가 기록 초안
 *
 * 서버에 쌓인 학생 질문 기록을 학생별로 묶고, Notion 결과 DB에 저장된 실제 대화
 * 판정 점수를 함께 돌려준다. Gemini 점수는 Notion 기록이 없는 학생에게만 추천값으로
 * 사용하며, 최종 판단은 교사가 한다.
 */

import { loadStudentQuestionStats, isCardStorageConfigured } from "@/lib/questioning-card-store";
import { generateQuestionAnalysisWithGemini } from "@/lib/gemini/questioning-cards";
import { loadQuestioningLessonConnection } from "@/lib/questioning-lesson-connections";
import { loadQuestioningEvaluationRecordsFromNotion } from "@/lib/notion/questioning-chatbot";
import { normalizeQuestioningChatbotConfig } from "@/lib/questioning-board";

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStudentKey(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function assertSetupAllowed(setupToken: unknown) {
  const expectedToken = process.env.QUESTIONING_CONNECTION_SETUP_TOKEN?.trim();
  if (!expectedToken) return;
  if (optionalText(setupToken) !== expectedToken) {
    throw new Error("수업 연결 저장 암호가 올바르지 않습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      lessonCode?: unknown;
      setupToken?: unknown;
      standard?: unknown;
      targetGrade?: unknown;
      geminiApiKey?: unknown;
      geminiModel?: unknown;
    };
    assertSetupAllowed(body.setupToken);

    const lessonCode = optionalText(body.lessonCode);
    if (!lessonCode) {
      return Response.json({ error: "수업 코드를 먼저 연결해 주세요." }, { status: 400 });
    }
    if (!isCardStorageConfigured()) {
      return Response.json({ error: "Supabase 저장소가 설정되어 있지 않습니다." }, { status: 400 });
    }

    const stats = await loadStudentQuestionStats(lessonCode);
    let persistedEvaluations: Awaited<ReturnType<typeof loadQuestioningEvaluationRecordsFromNotion>> = [];
    let evaluationWarning = "";
    try {
      const connection = await loadQuestioningLessonConnection(lessonCode);
      const config = normalizeQuestioningChatbotConfig(connection.chatbotConfig);
      persistedEvaluations = await loadQuestioningEvaluationRecordsFromNotion({
        credentials: {
          apiKey: connection.notionApiKey,
          resultDatabaseId: connection.notionResultDatabaseId,
        },
        rubric: config.rubric,
        materialTitle: config.material.materialTitle,
      });
    } catch (error) {
      evaluationWarning =
        error instanceof Error ? error.message : "Notion 평가 기록을 불러오지 못했습니다.";
    }

    if (stats.length === 0 && persistedEvaluations.length === 0) {
      return Response.json({ lessonCode, students: [], evaluationWarning });
    }

    const evaluationByStudent = new Map(
      persistedEvaluations.map((entry) => [normalizeStudentKey(entry.studentKey), entry]),
    );
    const fallbackStats = stats.filter(
      (entry) => !evaluationByStudent.has(normalizeStudentKey(entry.studentKey)),
    );

    // 평가 문장은 있으면 좋은 것. Gemini가 실패해도 통계는 그대로 돌려준다.
    let comments = new Map<string, { comment: string; scores: number[] }>();
    const geminiApiKey = optionalText(body.geminiApiKey);
    if (geminiApiKey && fallbackStats.length > 0) {
      try {
        comments = await generateQuestionAnalysisWithGemini({
          students: fallbackStats.map((entry) => ({
            studentKey: entry.studentKey,
            sampleQuestions: entry.sampleQuestions,
            intents: entry.intents,
            questionCount: entry.questionCount,
          })),
          standard: optionalText(body.standard),
          targetGrade: optionalText(body.targetGrade),
          apiKey: geminiApiKey,
          model: optionalText(body.geminiModel) || undefined,
        });
      } catch {
        // 문장 없이 통계만 돌려준다.
      }
    }

    const statsByStudent = new Map(
      stats.map((entry) => [normalizeStudentKey(entry.studentKey), entry]),
    );
    const generatedByStudent = new Map(
      Array.from(comments.entries()).map(([studentKey, value]) => [normalizeStudentKey(studentKey), value]),
    );
    const studentKeys = Array.from(
      new Set([...statsByStudent.keys(), ...evaluationByStudent.keys()]),
    ).sort((left, right) => left.localeCompare(right, "ko"));

    return Response.json({
      lessonCode,
      evaluationWarning,
      students: studentKeys.map((studentKey) => {
        const stat = statsByStudent.get(studentKey);
        const persisted = evaluationByStudent.get(studentKey);
        const generated = generatedByStudent.get(studentKey);
        const questions = stat?.questions.length ? stat.questions : persisted?.questions ?? [];
        const answers = stat?.answers.length ? stat.answers : persisted?.answers ?? [];
        return {
          studentKey: persisted?.studentKey ?? stat?.studentKey ?? studentKey,
          questionCount: stat?.questionCount ?? questions.length,
          intents: stat?.intents ?? [],
          sampleQuestions: stat?.sampleQuestions ?? questions.slice(0, 3),
          questions,
          answers,
          answerableRate: stat?.answerableRate ?? 0,
          comment: persisted?.feedback ?? generated?.comment ?? "",
          suggestedScores: persisted?.scores ?? generated?.scores ?? [],
          scoreSource: persisted ? "notion" : generated?.scores.length === 4 ? "gemini" : "none",
          scoreBasis: persisted?.scoreBasis ?? "",
          reachedDifficulty: persisted?.reachedDifficulty ?? "",
          moreToExploreQuestions: persisted?.moreToExploreQuestions ?? [],
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "질문 분석에 실패했습니다.";
    const status = message.includes("암호") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
