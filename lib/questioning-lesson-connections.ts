import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractNotionDatabaseId } from "@/lib/notion/import-comments";
import type { Json } from "@/lib/db/types";
import type { QuestioningChatbotConfig } from "@/lib/questioning-board";

const CIPHER_ALGORITHM = "aes-256-gcm";

export type QuestioningLessonConnection = {
  lessonCode: string;
  teacherLabel: string;
  lessonTitle: string;
  geminiModel: string;
  geminiApiKey: string;
  notionApiKey: string;
  notionPrepDatabaseId: string;
  notionResultDatabaseId: string;
  chatbotConfig: QuestioningChatbotConfig;
  studentChatbotPath: string;
};

type SaveQuestioningLessonConnectionInput = {
  lessonCode?: string;
  teacherLabel?: string;
  lessonTitle?: string;
  geminiModel?: string;
  geminiApiKey: string;
  notionApiKey: string;
  notionPrepDatabaseId: string;
  notionResultDatabaseId: string;
  chatbotConfig: QuestioningChatbotConfig;
  studentChatbotPath: string;
};

export function isQuestioningConnectionStorageConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) &&
      process.env.QUESTIONING_SECRET_ENCRYPTION_KEY,
  );
}

export function normalizeLessonCode(value: string | undefined) {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  return normalized && normalized.length >= 4 ? normalized : "";
}

export function createLessonCode() {
  return `Q-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function normalizeDatabaseId(value: string) {
  return extractNotionDatabaseId(value) ?? value.trim().replace(/-/g, "");
}

function getEncryptionKey() {
  const secret = process.env.QUESTIONING_SECRET_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("QUESTIONING_SECRET_ENCRYPTION_KEY는 16자 이상으로 설정해야 합니다.");
  }

  return createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

function decryptSecret(value: string) {
  const [version, ivText, tagText, encryptedText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("저장된 연결정보 암호문 형식이 올바르지 않습니다.");
  }

  const decipher = createDecipheriv(CIPHER_ALGORITHM, getEncryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function toQuestioningConfig(value: Json): QuestioningChatbotConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("저장된 챗봇 설정 형식이 올바르지 않습니다.");
  }

  return value as QuestioningChatbotConfig;
}

export async function saveQuestioningLessonConnection(input: SaveQuestioningLessonConnectionInput) {
  if (!isQuestioningConnectionStorageConfigured()) {
    throw new Error("Supabase 연결정보 저장소가 설정되어 있지 않습니다.");
  }

  const lessonCode = normalizeLessonCode(input.lessonCode) || createLessonCode();
  const notionPrepDatabaseId = normalizeDatabaseId(input.notionPrepDatabaseId);
  const notionResultDatabaseId = normalizeDatabaseId(input.notionResultDatabaseId);

  if (!input.notionApiKey.trim()) {
    throw new Error("Notion API 토큰을 입력해 주세요.");
  }

  if (!notionPrepDatabaseId || !notionResultDatabaseId) {
    throw new Error("Notion 준비 DB ID와 결과 DB ID를 모두 입력해 주세요.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("questioning_lesson_connections")
    .upsert(
      {
        lesson_code: lessonCode,
        teacher_label: input.teacherLabel?.trim() || null,
        lesson_title: input.lessonTitle?.trim() || input.chatbotConfig.material.materialTitle || "질문 챗봇 수업",
        gemini_model: input.geminiModel?.trim() || "gemini-2.5-flash",
        gemini_api_key_ciphertext: encryptSecret(input.geminiApiKey.trim()),
        notion_api_key_ciphertext: encryptSecret(input.notionApiKey.trim()),
        notion_prep_database_id: notionPrepDatabaseId,
        notion_result_database_id: notionResultDatabaseId,
        chatbot_config: input.chatbotConfig as unknown as Json,
        student_chatbot_path: input.studentChatbotPath,
        status: "active",
      },
      { onConflict: "lesson_code" },
    )
    .select(
      "lesson_code, teacher_label, lesson_title, gemini_model, notion_prep_database_id, notion_result_database_id, student_chatbot_path, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`Supabase 연결정보 저장 실패: ${error.message}`);
  }

  return {
    lessonCode: data.lesson_code,
    teacherLabel: data.teacher_label ?? "",
    lessonTitle: data.lesson_title ?? "",
    geminiModel: data.gemini_model,
    notionPrepDatabaseId: data.notion_prep_database_id,
    notionResultDatabaseId: data.notion_result_database_id,
    studentChatbotPath: data.student_chatbot_path,
    updatedAt: data.updated_at,
  };
}

export async function loadQuestioningLessonConnection(lessonCodeInput: string) {
  if (!isQuestioningConnectionStorageConfigured()) {
    throw new Error("Supabase 연결정보 저장소가 설정되어 있지 않습니다.");
  }

  const lessonCode = normalizeLessonCode(lessonCodeInput);
  if (!lessonCode) {
    throw new Error("수업 코드 형식이 올바르지 않습니다.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("questioning_lesson_connections")
    .select(
      "lesson_code, teacher_label, lesson_title, gemini_model, gemini_api_key_ciphertext, notion_api_key_ciphertext, notion_prep_database_id, notion_result_database_id, chatbot_config, student_chatbot_path, status, expires_at",
    )
    .eq("lesson_code", lessonCode)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase 연결정보 조회 실패: ${error.message}`);
  }

  if (!data) {
    throw new Error("해당 수업 코드를 찾을 수 없습니다.");
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("수업 코드 사용 기간이 지났습니다.");
  }

  return {
    lessonCode: data.lesson_code,
    teacherLabel: data.teacher_label ?? "",
    lessonTitle: data.lesson_title ?? "",
    geminiModel: data.gemini_model,
    geminiApiKey: decryptSecret(data.gemini_api_key_ciphertext),
    notionApiKey: decryptSecret(data.notion_api_key_ciphertext),
    notionPrepDatabaseId: data.notion_prep_database_id,
    notionResultDatabaseId: data.notion_result_database_id,
    chatbotConfig: toQuestioningConfig(data.chatbot_config),
    studentChatbotPath: data.student_chatbot_path,
  } satisfies QuestioningLessonConnection;
}
