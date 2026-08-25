import { answerQuestionWithGemini } from "@/lib/gemini/questioning-board";
import { recordStudentQuestion } from "@/lib/questioning-card-store";
import {
  loadQuestioningLessonConnection,
  normalizeLessonCode,
} from "@/lib/questioning-lesson-connections";
import { saveQuestioningResultToNotion } from "@/lib/notion/questioning-chatbot";
import { checkQuestioningChatRateLimit } from "@/lib/questioning-chat-rate-limit";
import {
  createLocalQuestionResult,
  normalizeQuestioningChatbotConfig,
  normalizeQuestioningChatbotBehavior,
  type ChatResult,
  type MaterialAnalysis,
  type QuestioningChatbotConfig,
  type RubricCriterion,
  type StudentChatResponse,
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
  sessionId?: unknown;
  lessonCode?: unknown;
};

type StudentProfile = {
  school: string;
  classroom: string;
  number: string;
};

const MAX_STUDENT_TURN_LENGTH = 800;
const MAX_CONVERSATION_TURNS = 10;
const MAX_CONVERSATION_CONTENT_LENGTH = 1200;
const MAX_CONVERSATION_TOTAL_LENGTH = 8000;

function isApprovedStudentExternalProviderEnabled() {
  return (
    process.env.QUESTIONING_STUDENT_LLM_ENABLED?.trim().toLowerCase() === "true" &&
    process.env.QUESTIONING_STUDENT_PROVIDER?.trim().toLowerCase() === "approved_gemini"
  );
}

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
    .filter((item) => item.role === "student" || item.role === "assistant")
    .map((item) => ({
      role: item.role as "student" | "assistant",
      content:
        typeof item.content === "string"
          ? item.content.trim().slice(0, MAX_CONVERSATION_CONTENT_LENGTH)
          : "",
    }))
    .filter((item) => item.content)
    .slice(-MAX_CONVERSATION_TURNS);
}

function normalizeStudentProfile(value: unknown): StudentProfile | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const profile = value as Partial<StudentProfile>;
  const school = typeof profile.school === "string" ? profile.school.trim() : "";
  const classroom = typeof profile.classroom === "string" ? profile.classroom.trim() : "";
  const number = typeof profile.number === "string" ? profile.number.trim() : "";

  if (
    !school ||
    !classroom ||
    !number ||
    school.length > 60 ||
    classroom.length > 20 ||
    number.length > 10 ||
    /[\u0000-\u001f\u007f]/.test(`${school}${classroom}${number}`)
  ) {
    return null;
  }

  return { school, classroom, number };
}

function toStudentChatResponse(
  result: ChatResult,
  {
    localFallback,
    providerUnavailable,
    recordUnavailable,
  }: {
    localFallback: boolean;
    providerUnavailable: boolean;
    recordUnavailable: boolean;
  },
): StudentChatResponse {
  const noticeCode = result.safetyFlag
    ? "safety_redirect"
    : providerUnavailable
      ? "provider_unavailable"
      : result.sourceStatus === "source_insufficient" || result.sourceStatus === "out_of_scope"
        ? "source_limited"
        : recordUnavailable
          ? "record_unavailable"
          : undefined;

  return {
    schemaVersion: 2,
    studentReply: result.studentReply,
    expectsStudentReply: result.expectsStudentReply,
    isClosing: result.isClosing,
    localFallback,
    ...(noticeCode ? { noticeCode } : {}),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const rawLessonCode = typeof body.lessonCode === "string" ? body.lessonCode.trim() : "";
    const lessonCode = normalizeLessonCode(rawLessonCode);

    if (!question) {
      return Response.json({ error: "학생 질문을 입력해 주세요." }, { status: 400 });
    }

    if (question.length > MAX_STUDENT_TURN_LENGTH) {
      return Response.json({ error: "학생 발화는 800자 이내로 입력해 주세요." }, { status: 400 });
    }

    if (rawLessonCode && !lessonCode) {
      return Response.json({ error: "수업 코드 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const rateLimit = checkQuestioningChatRateLimit(request, lessonCode, sessionId);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "잠시 뒤에 다시 이야기해 주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const conversation = normalizeConversation(body.conversation);
    const conversationLength = conversation.reduce((total, entry) => total + entry.content.length, 0);
    if (conversationLength > MAX_CONVERSATION_TOTAL_LENGTH) {
      return Response.json({ error: "대화 내용이 너무 깁니다. 최근 대화만 다시 보내 주세요." }, { status: 400 });
    }

    let lessonConnection: Awaited<ReturnType<typeof loadQuestioningLessonConnection>> | null = null;
    if (lessonCode) {
      try {
        lessonConnection = await loadQuestioningLessonConnection(lessonCode);
      } catch {
        return Response.json({ error: "사용할 수 있는 수업 코드를 찾지 못했습니다." }, { status: 404 });
      }
    }

    const requestMaterial = lessonConnection?.chatbotConfig.material ?? body.material;
    const requestRubric = lessonConnection?.chatbotConfig.rubric ?? body.rubric;

    if (!isMaterialAnalysis(requestMaterial)) {
      return Response.json({ error: "질문 자료를 먼저 준비해 주세요." }, { status: 400 });
    }

    if (!isRubric(requestRubric)) {
      return Response.json({ error: "평가 루브릭을 먼저 준비해 주세요." }, { status: 400 });
    }

    const rawConfig: QuestioningChatbotConfig = {
      standard:
        lessonConnection?.chatbotConfig.standard ?? (typeof body.standard === "string" ? body.standard : ""),
      targetGrade:
        lessonConnection?.chatbotConfig.targetGrade ?? (typeof body.targetGrade === "string" ? body.targetGrade : ""),
      subjectUnit:
        lessonConnection?.chatbotConfig.subjectUnit ?? (typeof body.subjectUnit === "string" ? body.subjectUnit : ""),
      material: requestMaterial,
      rubric: requestRubric,
      behavior: normalizeQuestioningChatbotBehavior(
        lessonConnection?.chatbotConfig.behavior ?? body.behavior,
      ),
      assessmentAnalysis: lessonConnection?.chatbotConfig.assessmentAnalysis,
      curriculumCompass: lessonConnection?.chatbotConfig.curriculumCompass,
      prdText: lessonConnection?.chatbotConfig.prdText ?? "",
      updatedAt: new Date().toISOString(),
    };
    const config = normalizeQuestioningChatbotConfig(rawConfig);
    const behavior = config.behavior;
    const useApprovedExternalProvider = Boolean(
      lessonConnection && isApprovedStudentExternalProviderEnabled(),
    );
    let localFallback = !useApprovedExternalProvider;
    let providerUnavailable = false;
    let result: ChatResult & { model?: string };

    if (useApprovedExternalProvider && lessonConnection) {
      // 무료 키는 분당 요청 제한에 자주 걸린다. 한 번 실패했다고 바로 규칙 엔진으로
      // 떨어지면 대화가 "좋았다 나빴다"를 오간다 — 잠깐 기다렸다 한 번 더 부른다.
      const callGemini = () =>
        answerQuestionWithGemini({
          standard: config.standard,
          targetGrade: config.targetGrade,
          subjectUnit: config.subjectUnit,
          material: config.material,
          curriculumCompass: config.curriculumCompass!,
          rubric: config.rubric,
          behavior,
          question,
          conversation,
          apiKey: lessonConnection.geminiApiKey,
          model: lessonConnection.geminiModel,
        });
      try {
        try {
          result = await callGemini();
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          result = await callGemini();
        }
      } catch {
        localFallback = true;
        providerUnavailable = true;
        result = createLocalQuestionResult({
          studentTurn: question,
          material: config.material,
          rubric: config.rubric,
          behavior,
          conversation,
          curriculumCompass: config.curriculumCompass,
          targetGrade: config.targetGrade,
        });
      }
    } else {
      result = createLocalQuestionResult({
        studentTurn: question,
        material: config.material,
        rubric: config.rubric,
        behavior,
        conversation,
        curriculumCompass: config.curriculumCompass,
        targetGrade: config.targetGrade,
      });
    }

    const studentProfile = normalizeStudentProfile(body.studentProfile);
    const notionSave = studentProfile
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
    const recordUnavailable = !notionSave.ok && !("skipped" in notionSave && notionSave.skipped);

    // 카드로 답하지 못한 질문을 남겨 교사가 다음 수업에 채울 수 있게 한다.
    // 기록에 실패해도 아이와의 대화는 이어져야 하므로 오류를 삼킨다.
    const answeredFromSource =
      result.sourceStatus === "supported" || result.sourceStatus === "reasonable_inference";
    await recordStudentQuestion({
      lessonCode,
      studentKey: studentProfile
        ? `${studentProfile.school}_${studentProfile.classroom}_${studentProfile.number}`
        : undefined,
      rawQuestion: question,
      questionIntent: result.typeLabel,
      answerText: result.studentReply,
      answerable: answeredFromSource,
      missingInformation: answeredFromSource ? undefined : result.sourceStatus,
    }).catch(() => {
      // 저장소가 준비되지 않았거나 잠시 끊긴 경우. 수업을 멈출 이유는 아니다.
    });

    return Response.json(
      toStudentChatResponse(result, {
        localFallback,
        providerUnavailable,
        recordUnavailable,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "챗봇 응답 생성에 실패했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
