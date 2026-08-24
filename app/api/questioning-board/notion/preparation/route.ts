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

type PreparationRequest = {
  config?: unknown;
  studentChatbotUrl?: unknown;
  notionApiKey?: unknown;
  notionPrepDatabaseId?: unknown;
  notionResultDatabaseId?: unknown;
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PreparationRequest;

    if (!isQuestioningConfig(body.config)) {
      return Response.json({ error: "노션에 저장할 챗봇 수업 준비 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const notionApiKey = optionalText(body.notionApiKey);
    let notionPrepDatabaseId = optionalText(body.notionPrepDatabaseId);
    let notionResultDatabaseId = optionalText(body.notionResultDatabaseId);

    if (!notionApiKey) {
      return Response.json(
        { error: "Notion API 토큰을 입력하고, Notion 템플릿 페이지에 Integration을 연결해 주세요." },
        { status: 400 },
      );
    }

    if (!notionPrepDatabaseId || !notionResultDatabaseId) {
      const discoveredDatabases = await discoverQuestioningDatabasesFromNotion({
        apiKey: notionApiKey,
      });
      notionPrepDatabaseId = discoveredDatabases.prepDatabaseId;
      notionResultDatabaseId = discoveredDatabases.resultDatabaseId;
    }

    const result = await saveQuestioningPreparationToNotion({
      config: body.config,
      studentChatbotUrl:
        typeof body.studentChatbotUrl === "string" ? body.studentChatbotUrl : "/questioning-chatbot",
      credentials: {
        apiKey: notionApiKey,
        prepDatabaseId: notionPrepDatabaseId,
        resultDatabaseId: notionResultDatabaseId,
      },
    });

    if (result.skipped) {
      return Response.json(result, { status: 400 });
    }

    return Response.json({
      ...result,
      notionPrepDatabaseId,
      notionResultDatabaseId,
    });
  } catch (error) {
    const message =
      error instanceof NotionQuestioningError || error instanceof Error
        ? error.message
        : "Notion 준비 DB 저장에 실패했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
