/**
 * 질문 분석 — 평가 기록 초안
 *
 * 서버에 쌓인 학생 질문 기록을 학생별로 묶고, Gemini 키가 있으면 실제 질문을 근거로
 * 평가(세특형) 문장 초안까지 만든다. 점수를 매기지 않는다 — 관찰 사실과 문장 초안만
 * 돌려주고, 판단은 교사가 한다.
 */

import { loadStudentQuestionStats, isCardStorageConfigured } from "@/lib/questioning-card-store";
import { generateQuestionAnalysisWithGemini } from "@/lib/gemini/questioning-cards";

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    if (stats.length === 0) {
      return Response.json({ lessonCode, students: [] });
    }

    // 평가 문장은 있으면 좋은 것. Gemini가 실패해도 통계는 그대로 돌려준다.
    let comments = new Map<string, { comment: string; scores: number[] }>();
    const geminiApiKey = optionalText(body.geminiApiKey);
    if (geminiApiKey) {
      try {
        comments = await generateQuestionAnalysisWithGemini({
          students: stats.map((entry) => ({
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

    return Response.json({
      lessonCode,
      students: stats.map((entry) => ({
        ...entry,
        comment: comments.get(entry.studentKey)?.comment ?? "",
        suggestedScores: comments.get(entry.studentKey)?.scores ?? [],
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "질문 분석에 실패했습니다.";
    const status = message.includes("암호") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
