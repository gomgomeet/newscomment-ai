import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

const CIPHER_ALGORITHM = "aes-256-gcm";
const DEFAULT_NOTION_VERSION = "2022-06-28";

type AppSupabaseClient = SupabaseClient<Database>;

export type EvaluationNotionConnectionStatus = {
  configured: boolean;
  source: "teacher" | "server" | "none";
  workspaceLabel: string | null;
  defaultExportParentPageId: string | null;
  lastVerifiedAt: string | null;
  storageReady: boolean;
  encryptionReady: boolean;
};

export class EvaluationNotionConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationNotionConnectionError";
  }
}

function encryptionSecret() {
  return process.env.EVALUATION_SECRET_ENCRYPTION_KEY?.trim() ?? "";
}

export function isEvaluationNotionEncryptionConfigured() {
  return encryptionSecret().length >= 16;
}

function getEncryptionKey() {
  const secret = encryptionSecret();
  if (secret.length < 16) {
    throw new EvaluationNotionConnectionError(
      "서버의 EVALUATION_SECRET_ENCRYPTION_KEY를 16자 이상으로 설정해 주세요.",
    );
  }

  return createHash("sha256").update(secret).digest();
}

function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

function decryptToken(value: string) {
  const [version, ivText, tagText, encryptedText, ...rest] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText || rest.length > 0) {
    throw new EvaluationNotionConnectionError("저장된 Notion 연결정보 형식이 올바르지 않습니다.");
  }

  try {
    const decipher = createDecipheriv(CIPHER_ALGORITHM, getEncryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof EvaluationNotionConnectionError) throw error;
    throw new EvaluationNotionConnectionError(
      "저장된 Notion 토큰을 복호화하지 못했습니다. 서버 암호화 키를 확인해 주세요.",
    );
  }
}

function isConnectionTableUnavailable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "42501";
}

function serverFallbackStatus(storageReady: boolean): EvaluationNotionConnectionStatus {
  const configured = Boolean(process.env.NOTION_API_KEY?.trim());
  return {
    configured,
    source: configured ? "server" : "none",
    workspaceLabel: configured ? "서버 공용 시연 연결" : null,
    defaultExportParentPageId: null,
    lastVerifiedAt: null,
    storageReady,
    encryptionReady: isEvaluationNotionEncryptionConfigured(),
  };
}

export async function getEvaluationNotionConnectionStatus({
  supabase,
  userId,
}: {
  supabase: AppSupabaseClient;
  userId: string;
}): Promise<EvaluationNotionConnectionStatus> {
  const { data, error } = await supabase
    .from("teacher_notion_connections")
    .select("workspace_label, default_export_parent_page_id, last_verified_at")
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    if (isConnectionTableUnavailable(error)) return serverFallbackStatus(false);
    throw new EvaluationNotionConnectionError(`Notion 연결 상태를 확인하지 못했습니다: ${error.message}`);
  }

  if (!data) return serverFallbackStatus(true);

  const encryptionReady = isEvaluationNotionEncryptionConfigured();
  return {
    configured: encryptionReady,
    source: "teacher",
    workspaceLabel: data.workspace_label || "내 Notion 워크스페이스",
    defaultExportParentPageId: data.default_export_parent_page_id,
    lastVerifiedAt: data.last_verified_at,
    storageReady: true,
    encryptionReady,
  };
}

export async function getEvaluationNotionAccessToken({
  supabase,
  userId,
}: {
  supabase: AppSupabaseClient;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("teacher_notion_connections")
    .select("token_ciphertext")
    .eq("owner_id", userId)
    .maybeSingle();

  if (error && !isConnectionTableUnavailable(error)) {
    throw new EvaluationNotionConnectionError(`Notion 연결정보를 읽지 못했습니다: ${error.message}`);
  }

  if (data?.token_ciphertext) return decryptToken(data.token_ciphertext);

  const fallback = process.env.NOTION_API_KEY?.trim();
  if (fallback) return fallback;

  throw new EvaluationNotionConnectionError(
    error
      ? "교사별 Notion 연결 마이그레이션을 적용하고 평가 준비 프렙에서 토큰을 연결해 주세요."
      : "평가 준비 프렙에서 내 Notion 통합 토큰을 먼저 연결해 주세요.",
  );
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function verifyEvaluationNotionToken(apiKey: string) {
  let response: Response;
  try {
    response = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": process.env.NOTION_API_VERSION || DEFAULT_NOTION_VERSION,
      },
      cache: "no-store",
    });
  } catch {
    throw new EvaluationNotionConnectionError("Notion에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      throw new EvaluationNotionConnectionError("Notion 통합 토큰이 올바르지 않습니다.");
    }
    const message = asRecord(payload)?.message;
    throw new EvaluationNotionConnectionError(
      typeof message === "string" ? message : `Notion 연결 확인 실패: ${response.status}`,
    );
  }

  const user = asRecord(payload);
  const bot = asRecord(user?.bot);
  return {
    botId: typeof user?.id === "string" ? user.id : null,
    workspaceLabel: typeof bot?.workspace_name === "string"
      ? bot.workspace_name
      : typeof user?.name === "string"
        ? user.name
        : "내 Notion 워크스페이스",
  };
}

export function encryptEvaluationNotionToken(apiKey: string) {
  return encryptToken(apiKey);
}
