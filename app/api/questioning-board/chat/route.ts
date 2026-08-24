import { answerQuestionWithGemini } from "@/lib/gemini/questioning-board";
import { loadQuestioningLessonConnection } from "@/lib/questioning-lesson-connections";
import { saveQuestioningResultToNotion } from "@/lib/notion/questioning-chatbot";
import {
  createLocalQuestionResult,
  normalizeQuestionMaterialForStudentDisplay,
  normalizeQuestioningChatbotBehavior,
  type ChatResult,
  type MaterialAnalysis,
  type QuestioningChatbotConfig,
  type RubricCriterion,
} from "@/lib/questioning-board";

type ChatRequest = {
  standard?: unknown;
  targetGrade?: unknown;
  subjectUnit?: unknown;
  material?: unknown;
  rubric?: unknown;
  behavior?: unknown;
  question?: unknown;
  conversation?: unknown;
  studentProfile?: unknown;
  apiKey?: unknown;
  model?: unknown;
  lessonCode?: unknown;
};

type StudentProfile = {
  school: string;
  classroom: string;
  number: string;
};

function isMaterialAnalysis(value: unknown): value is MaterialAnalysis {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const material = value as Partial<MaterialAnalysis>;
  return typeof material.summary === "string" && Array.isArray(material.keyConcepts);
}

function isRubric(value: unknown): value is RubricCriterion[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const criterion = item as Partial<RubricCriterion>;
    return typeof criterion.key === "string" && typeof criterion.label === "string";
  });
}

function normalizeConversation(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      role: item.role === "assistant" ? ("assistant" as const) : ("student" as const),
      content: typeof item.content === "string" ? item.content.trim().slice(0, 1200) : "",
    }))
    .filter((item) => item.content)
    .slice(-8);
}

function normalizeStudentProfile(value: unknown): StudentProfile | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const profile = value as Partial<StudentProfile>;
  const school = typeof profile.school === "string" ? profile.school.trim() : "";
  const classroom = typeof profile.classroom === "string" ? profile.classroom.trim() : "";
  const number = typeof profile.number === "string" ? profile.number.trim() : "";

  if (!school || !classroom || !number) {
    return null;
  }

  return { school, classroom, number };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const lessonCode = typeof body.lessonCode === "string" ? body.lessonCode.trim() : "";

    if (!question) {
      return Response.json({ error: "학생 질문을 입력해 주세요." }, { status: 400 });
    }

    const lessonConnection = lessonCode ? await loadQuestioningLessonConnection(lessonCode) : null;
    const requestMaterial = lessonConnection?.chatbotConfig.material ?? body.material;
    const requestRubric = lessonConnection?.chatbotConfig.rubric ?? body.rubric;

    if (!isMaterialAnalysis(requestMaterial)) {
      return Response.json({ error: "질문 자료를 먼저 준비해 주세요." }, { status: 400 });
    }

    if (!isRubric(requestRubric)) {
      return Response.json({ error: "평가 루브릭을 먼저 준비해 주세요." }, { status: 400 });
    }

    const material = normalizeQuestionMaterialForStudentDisplay(requestMaterial);
    const behavior = normalizeQuestioningChatbotBehavior(lessonConnection?.chatbotConfig.behavior ?? body.behavior);
    const conversation = normalizeConversation(body.conversation);
    const config: QuestioningChatbotConfig = {
      standard:
        lessonConnection?.chatbotConfig.standard ?? (typeof body.standard === "string" ? body.standard : ""),
      targetGrade:
        lessonConnection?.chatbotConfig.targetGrade ?? (typeof body.targetGrade === "string" ? body.targetGrade : ""),
      subjectUnit:
        lessonConnection?.chatbotConfig.subjectUnit ?? (typeof body.subjectUnit === "string" ? body.subjectUnit : ""),
      material,
      rubric: requestRubric,
      behavior,
      assessmentAnalysis: lessonConnection?.chatbotConfig.assessmentAnalysis,
      prdText: lessonConnection?.chatbotConfig.prdText ?? "",
      updatedAt: new Date().toISOString(),
    };
    let localFallback = false;
    let aiWarning = "";
    let result: ChatResult & { model?: string };

    try {
      result = await answerQuestionWithGemini({
        standard: config.standard,
        targetGrade: config.targetGrade,
        subjectUnit: config.subjectUnit,
        material: config.material,
        rubric: config.rubric,
        behavior,
        question,
        conversation,
        apiKey:
          lessonConnection?.geminiApiKey ?? (typeof body.apiKey === "string" ? body.apiKey : undefined),
        model: lessonConnection?.geminiModel ?? (typeof body.model === "string" ? body.model : undefined),
      });
    } catch (error) {
      localFallback = true;
      aiWarning = error instanceof Error ? error.message : "Gemini 응답을 사용할 수 없습니다.";
      result = createLocalQuestionResult({
        question,
        material: config.material,
        rubric: config.rubric,
        behavior,
      });
    }

    const studentProfile = normalizeStudentProfile(body.studentProfile);
    let notionSave = studentProfile
      ? await saveQuestioningResultToNotion({
          config,
          studentProfile,
          question,
          result,
          conversation,
          credentials: lessonConnection
            ? {
                apiKey: lessonConnection.notionApiKey,
                prepDatabaseId: lessonConnection.notionPrepDatabaseId,
                resultDatabaseId: lessonConnection.notionResultDatabaseId,
              }
            : undefined,
        }).catch((error: unknown) => ({
          ok: false,
          warning: error instanceof Error ? error.message : "Notion 결과 DB 저장에 실패했습니다.",
        }))
      : {
          ok: false,
          skipped: true,
          warning: "학생의 학교·반·번호가 없어 Notion 결과 DB 저장을 건너뛰었습니다.",
        };

    if ("skipped" in notionSave && notionSave.skipped) {
      notionSave = { ...notionSave, warning: undefined };
    }

    return Response.json({
      ...result,
      localFallback,
      aiWarning: localFallback ? aiWarning : undefined,
      notionSave,
      lessonCode: lessonConnection?.lessonCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "챗봇 응답 생성에 실패했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
