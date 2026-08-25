import {
  createLessonCode,
  isQuestioningConnectionStorageConfigured,
  loadQuestioningLessonConnection,
  normalizeLessonCode,
  saveQuestioningLessonConnection,
  updateQuestioningLessonConfig,
} from "@/lib/questioning-lesson-connections";
import {
  createQuestioningPreviewToken,
  verifyQuestioningPreviewToken,
} from "@/lib/questioning-preview-token";
import {
  discoverQuestioningDatabasesFromNotion,
  NotionQuestioningError,
  saveQuestioningPreparationToNotion,
} from "@/lib/notion/questioning-chatbot";
import type {
  MaterialAnalysis,
  QuestioningChatbotConfig,
  RubricCriterion,
} from "@/lib/questioning-board";
import {
  createDefaultQuestioningChatbotBehavior,
  normalizeQuestionMaterialForStudentDisplay,
  normalizeQuestioningChatbotConfig,
} from "@/lib/questioning-board";

type ConnectionRequest = {
  config?: unknown;
  lessonCode?: unknown;
  teacherLabel?: unknown;
  setupToken?: unknown;
  geminiApiKey?: unknown;
  geminiModel?: unknown;
  notionApiKey?: unknown;
  notionPrepDatabaseId?: unknown;
  notionResultDatabaseId?: unknown;
  studentChatbotPath?: unknown;
  previewToken?: unknown;
};

function isMaterialAnalysis(value: unknown): value is MaterialAnalysis {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const material = value as Partial<MaterialAnalysis>;
  return (
    typeof material.materialTitle === "string" &&
    typeof material.summary === "string" &&
    typeof material.visibleText === "string" &&
    Array.isArray(material.keyConcepts)
  );
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

function isQuestioningConfig(value: unknown): value is QuestioningChatbotConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const config = value as Partial<QuestioningChatbotConfig>;
  return (
    typeof config.targetGrade === "string" &&
    typeof config.subjectUnit === "string" &&
    typeof config.standard === "string" &&
    isMaterialAnalysis(config.material) &&
    isRubric(config.rubric) &&
    typeof config.prdText === "string"
  );
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertSetupAllowed(setupToken: unknown) {
  const expectedToken = process.env.QUESTIONING_CONNECTION_SETUP_TOKEN?.trim();
  if (!expectedToken) {
    return;
  }

  if (optionalText(setupToken) !== expectedToken) {
    throw new Error("수업 연결 저장 암호가 올바르지 않습니다.");
  }
}

function normalizeQuestioningConnectionConfig(config: QuestioningChatbotConfig): QuestioningChatbotConfig {
  return normalizeQuestioningChatbotConfig(config);
}

function toStudentLessonConfig(config: QuestioningChatbotConfig): QuestioningChatbotConfig {
  const material = normalizeQuestionMaterialForStudentDisplay(config.material);

  return {
    targetGrade: config.targetGrade,
    subjectUnit: config.subjectUnit,
    standard: "",
    material: {
      materialTitle: material.materialTitle,
      summary: material.summary,
      visibleText: material.visibleText,
      keyConcepts: material.keyConcepts,
      possibleMisconceptions: [],
      questionSeeds: [],
      sourceLimit: "",
      safetyNotice: "개인정보는 입력하지 않습니다.",
    },
    rubric: [],
    behavior: createDefaultQuestioningChatbotBehavior(),
    prdText: "",
    // 학생 화면에서 학교·학년반을 대신 채우기 위해 이것만 함께 보낸다.
    classInfo: config.classInfo,
    updatedAt: config.updatedAt,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lessonCode = normalizeLessonCode(url.searchParams.get("lessonCode") || "");

    if (!lessonCode) {
      return Response.json({ error: "수업 코드를 입력해 주세요." }, { status: 400 });
    }

    const connection = await loadQuestioningLessonConnection(lessonCode);
    const config = toStudentLessonConfig(
      normalizeQuestioningConnectionConfig(connection.chatbotConfig),
    );

    return Response.json({
      ok: true,
      lessonCode: connection.lessonCode,
      lessonTitle: connection.lessonTitle,
      config,
      studentChatbotPath: connection.studentChatbotPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수업 연결 정보를 불러오지 못했습니다.";
    return Response.json({ error: message }, { status: 404 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConnectionRequest;

    assertSetupAllowed(body.setupToken);

    if (!isQuestioningConfig(body.config)) {
      return Response.json({ error: "저장할 챗봇 설정이 올바르지 않습니다." }, { status: 400 });
    }

    if (!isQuestioningConnectionStorageConfigured()) {
      return Response.json({ error: "Supabase 연결정보 저장소가 설정되어 있지 않습니다." }, { status: 400 });
    }

    const lessonCode = normalizeLessonCode(optionalText(body.lessonCode)) || createLessonCode();
    const studentChatbotPath = optionalText(body.studentChatbotPath) || "/questioning-chatbot";
    const studentChatbotUrl = `${studentChatbotPath}?lesson=${encodeURIComponent(lessonCode)}`;
    const geminiApiKey = optionalText(body.geminiApiKey);
    const geminiModel = optionalText(body.geminiModel) || "gemini-2.5-flash";
    const notionApiKey = optionalText(body.notionApiKey);
    let notionPrepDatabaseId = optionalText(body.notionPrepDatabaseId);
    let notionResultDatabaseId = optionalText(body.notionResultDatabaseId);

    if (!notionApiKey) {
      return Response.json({ error: "Notion API 토큰을 입력해 주세요." }, { status: 400 });
    }

    if (!notionPrepDatabaseId || !notionResultDatabaseId) {
      const discoveredDatabases = await discoverQuestioningDatabasesFromNotion({
        apiKey: notionApiKey,
      });
      notionPrepDatabaseId = discoveredDatabases.prepDatabaseId;
      notionResultDatabaseId = discoveredDatabases.resultDatabaseId;
    }

    const config = normalizeQuestioningConnectionConfig(body.config);
    const saved = await saveQuestioningLessonConnection({
      lessonCode,
      teacherLabel: optionalText(body.teacherLabel),
      lessonTitle: config.material.materialTitle || config.subjectUnit,
      geminiApiKey,
      geminiModel,
      notionApiKey,
      notionPrepDatabaseId,
      notionResultDatabaseId,
      chatbotConfig: config,
      studentChatbotPath,
    });

    let notionPreparationPageUrl = "";
    let notionPreparationWarning = "";

    try {
      const notionSave = await saveQuestioningPreparationToNotion({
        config,
        studentChatbotUrl,
        credentials: {
          apiKey: notionApiKey,
          prepDatabaseId: notionPrepDatabaseId,
          resultDatabaseId: notionResultDatabaseId,
        },
      });

      if (notionSave.ok) {
        notionPreparationPageUrl = notionSave.pageUrl || "";
      } else {
        notionPreparationWarning = notionSave.warning || "Notion 준비 DB 기록은 완료하지 못했습니다.";
      }
    } catch (error) {
      notionPreparationWarning =
        error instanceof Error ? error.message : "Notion 준비 DB 기록은 완료하지 못했습니다.";
    }

    return Response.json({
      ok: true,
      ...saved,
      previewToken: createQuestioningPreviewToken(saved.lessonCode),
      studentChatbotUrl,
      notionPreparationPageUrl,
      notionPreparationWarning,
      notionPrepDatabaseId,
      notionResultDatabaseId,
    });
  } catch (error) {
    const message =
      error instanceof NotionQuestioningError || error instanceof Error
        ? error.message
        : "수업 연결 정보를 저장하지 못했습니다.";
    const status = message.includes("암호") ? 401 : error instanceof NotionQuestioningError ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as ConnectionRequest;
    const lessonCode = normalizeLessonCode(optionalText(body.lessonCode));

    if (!lessonCode || !verifyQuestioningPreviewToken(body.previewToken, lessonCode)) {
      return Response.json({ error: "교사 미리보기 권한이 만료되었거나 올바르지 않습니다." }, { status: 403 });
    }
    if (!isQuestioningConfig(body.config)) {
      return Response.json({ error: "게시할 챗봇 설정이 올바르지 않습니다." }, { status: 400 });
    }

    const config = normalizeQuestioningConnectionConfig(body.config);
    const updated = await updateQuestioningLessonConfig(lessonCode, config);

    return Response.json({
      ok: true,
      ...updated,
      previewToken: createQuestioningPreviewToken(lessonCode),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수정한 챗봇 설정을 게시하지 못했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
