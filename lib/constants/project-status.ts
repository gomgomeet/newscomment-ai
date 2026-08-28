import type { Database } from "@/lib/db/types";

type ProjectStatus = Database["public"]["Tables"]["projects"]["Row"]["status"];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: "준비 중",
  active: "진행 중",
  archived: "종료",
};
