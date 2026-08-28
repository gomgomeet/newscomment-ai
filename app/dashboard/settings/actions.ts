"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { extractNotionDatabaseId } from "@/lib/notion/import-comments";
import {
  encryptEvaluationNotionToken,
  EvaluationNotionConnectionError,
  isEvaluationNotionEncryptionConfigured,
  verifyEvaluationNotionToken,
} from "@/lib/notion/teacher-connection";

export type NotionConnectionActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialNotionConnectionActionState: NotionConnectionActionState = {
  status: "idle",
  message: "",
};

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function refreshNotionViews() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/prep");
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/growth");
  revalidatePath("/dashboard/settings");
}

export async function updateEvaluationNotionConnection(
  _previousState: NotionConnectionActionState,
  formData: FormData,
): Promise<NotionConnectionActionState> {
  const operation = readText(formData, "operation") || "save";
  const { supabase, user } = await requireUser();

  if (operation === "disconnect") {
    const { error } = await supabase
      .from("teacher_notion_connections")
      .delete()
      .eq("owner_id", user.id);

    if (error) {
      return { status: "error", message: `Notion 연결을 끊지 못했습니다: ${error.message}` };
    }

    refreshNotionViews();
    return { status: "success", message: "내 Notion 연결과 저장된 암호문을 삭제했습니다." };
  }

  if (!isEvaluationNotionEncryptionConfigured()) {
    return {
      status: "error",
      message: "서버에 EVALUATION_SECRET_ENCRYPTION_KEY를 16자 이상으로 먼저 설정해 주세요.",
    };
  }

  const apiKey = readText(formData, "notion_api_key");
  if (apiKey.length < 20 || apiKey.length > 500) {
    return { status: "error", message: "Notion 통합 토큰을 정확히 입력해 주세요." };
  }

  const parentInput = readText(formData, "default_export_parent_page");
  const defaultExportParentPageId = parentInput ? extractNotionDatabaseId(parentInput) : null;
  if (parentInput && !defaultExportParentPageId) {
    return { status: "error", message: "기본 내보내기 상위 페이지 URL 또는 ID 형식을 확인해 주세요." };
  }

  try {
    const verified = await verifyEvaluationNotionToken(apiKey);
    const { error } = await supabase
      .from("teacher_notion_connections")
      .upsert({
        owner_id: user.id,
        token_ciphertext: encryptEvaluationNotionToken(apiKey),
        workspace_label: verified.workspaceLabel,
        bot_id: verified.botId,
        capabilities: ["read_results", "create_pages"],
        default_export_parent_page_id: defaultExportParentPageId,
        last_verified_at: new Date().toISOString(),
      }, { onConflict: "owner_id" });

    if (error) {
      const migrationHint = error.code === "42P01" || error.code === "PGRST205" || error.code === "42501"
        ? " Supabase에 teacher_notion_connections 마이그레이션을 먼저 적용해 주세요."
        : "";
      return { status: "error", message: `Notion 연결을 저장하지 못했습니다: ${error.message}${migrationHint}` };
    }

    refreshNotionViews();
    return {
      status: "success",
      message: `${verified.workspaceLabel} 연결을 확인하고 안전하게 저장했습니다.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof EvaluationNotionConnectionError
        ? error.message
        : "Notion 연결 확인 중 오류가 발생했습니다.",
    };
  }
}
