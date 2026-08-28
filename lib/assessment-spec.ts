import type { Json } from "@/lib/db/types";

export type AssessmentSpec = {
  schema: "assessment-spec-v1";
  version: string;
  achievementStandard: string;
  learningGoal: string;
  essentialQuestion: string;
  evidenceDescription: string;
  deferConditions: string;
  notionInputProperty: string;
  notionStudentProperty: string;
  notionFeedbackProperty: string;
  approved: boolean;
  approvedBy: string;
  approvedAt: string | null;
  trialCount: number;
  batchSize: number;
};

export function readAssessmentSpec(value: Json): AssessmentSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, Json | undefined>;
  if (data.schema !== "assessment-spec-v1") return null;

  return {
    schema: "assessment-spec-v1",
    version: typeof data.version === "string" ? data.version : "v1.0",
    achievementStandard: typeof data.achievementStandard === "string" ? data.achievementStandard : "",
    learningGoal: typeof data.learningGoal === "string" ? data.learningGoal : "",
    essentialQuestion: typeof data.essentialQuestion === "string" ? data.essentialQuestion : "",
    evidenceDescription: typeof data.evidenceDescription === "string" ? data.evidenceDescription : "",
    deferConditions: typeof data.deferConditions === "string" ? data.deferConditions : "",
    notionInputProperty: typeof data.notionInputProperty === "string" ? data.notionInputProperty : "",
    notionStudentProperty: typeof data.notionStudentProperty === "string" ? data.notionStudentProperty : "",
    notionFeedbackProperty: typeof data.notionFeedbackProperty === "string" ? data.notionFeedbackProperty : "",
    approved: data.approved === true,
    approvedBy: typeof data.approvedBy === "string" ? data.approvedBy : "",
    approvedAt: typeof data.approvedAt === "string" ? data.approvedAt : null,
    trialCount: typeof data.trialCount === "number" ? Math.min(Math.max(data.trialCount, 1), 3) : 3,
    batchSize: typeof data.batchSize === "number" ? Math.min(Math.max(data.batchSize, 3), 5) : 5,
  };
}
