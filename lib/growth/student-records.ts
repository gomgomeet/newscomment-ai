import type { Json } from "@/lib/db/types";

export const STUDENT_RECORD_PROMPT_VERSION = "subject-integrated-record-v2";

export type ActivitySpecialRecord = {
  projectId: string;
  activityTitle: string;
  subject: string;
  evaluationIds: string[];
  recordText: string;
  evidenceSummary: string;
  selectedAsRepresentative: boolean;
  generatedBy: "evidence-draft" | "ai-draft";
};

export type StudentRecordEvidence = {
  subject: string;
  gradeLevel: string;
  activityRecords: ActivitySpecialRecord[];
  representativeProjectId: string | null;
  representativeReason: string;
  summaryKind: "one-time" | "cumulative";
  promptVersion: string;
};

export type StudentRecordSummaryPreview = {
  id: string;
  studentKey: string;
  periodLabel: string;
  draftText: string;
  teacherFinalText: string;
  status: "draft" | "confirmed";
  updatedAt: string;
  evidence: StudentRecordEvidence;
};

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function excerpt(value: string, maxLength: number) {
  const normalized = compactText(value).replace(/[“”"]/g, "'");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildEvidenceBasedActivityRecord({
  activityTitle,
  answerTexts,
  criterionLabels,
}: {
  activityTitle: string;
  answerTexts: string[];
  criterionLabels: string[];
}) {
  const answerEvidence = answerTexts.map((value) => excerpt(value, 120)).filter(Boolean).slice(0, 2);
  const criteria = Array.from(new Set(criterionLabels.map(compactText).filter(Boolean))).slice(0, 3);
  const criterionText = criteria.length > 0 ? `${criteria.join("·")}을 중심으로 ` : "";
  const answerCountText = answerEvidence.length > 0 ? ` 학생 결과물 ${answerEvidence.length}건에서 확인된 수행을 바탕으로` : "";

  if (answerEvidence.length > 0) {
    return `${activityTitle}에서 ${criterionText}과제를 수행하며${answerCountText} 글의 내용을 파악하고 자신의 생각을 표현하는 능력을 드러냄.`;
  }

  return `${activityTitle}에서 ${criterionText}교사가 확인한 과제를 수행함. 직접 근거가 더 모이면 활동별 세특 문장을 보완할 수 있음.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseActivityRecord(value: unknown): ActivitySpecialRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.project_id !== "string" ||
    typeof row.activity_title !== "string" ||
    !isStringArray(row.evaluation_ids) ||
    typeof row.record_text !== "string" ||
    typeof row.evidence_summary !== "string"
  ) {
    return null;
  }

  return {
    projectId: row.project_id,
    activityTitle: row.activity_title,
    subject: typeof row.subject === "string" ? row.subject : "",
    evaluationIds: row.evaluation_ids,
    recordText: row.record_text,
    evidenceSummary: row.evidence_summary,
    selectedAsRepresentative: row.selected_as_representative === true,
    generatedBy: row.generated_by === "ai-draft" ? "ai-draft" : "evidence-draft",
  };
}

export function parseStudentRecordEvidence(value: Json): StudentRecordEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json | undefined>;
  const activityRows = Array.isArray(record.activity_records) ? record.activity_records : [];
  const activityRecords = activityRows.map(parseActivityRecord).filter((row): row is ActivitySpecialRecord => Boolean(row));
  if (activityRecords.length === 0) return null;

  return {
    subject: typeof record.subject === "string" ? record.subject : "",
    gradeLevel: typeof record.grade_level === "string" ? record.grade_level : "",
    activityRecords,
    representativeProjectId: typeof record.representative_project_id === "string" ? record.representative_project_id : null,
    representativeReason: typeof record.representative_reason === "string" ? record.representative_reason : "",
    summaryKind: record.summary_kind === "cumulative" ? "cumulative" : "one-time",
    promptVersion: typeof record.prompt_version === "string" ? record.prompt_version : "",
  };
}

export function serializeStudentRecordEvidence({
  subject,
  gradeLevel,
  activityRecords,
  representativeProjectId,
  representativeReason,
  summaryKind,
  projectIds,
  commentIds,
  evaluationIds,
}: StudentRecordEvidence & {
  projectIds: string[];
  commentIds: string[];
  evaluationIds: string[];
}): Json {
  return {
    subject,
    grade_level: gradeLevel,
    project_ids: projectIds,
    comment_ids: commentIds,
    evaluation_ids: evaluationIds,
    evidence_count: evaluationIds.length,
    activity_records: activityRecords.map((record) => ({
      project_id: record.projectId,
      activity_title: record.activityTitle,
      subject: record.subject,
      evaluation_ids: record.evaluationIds,
      record_text: record.recordText,
      evidence_summary: record.evidenceSummary,
      selected_as_representative: record.selectedAsRepresentative,
      generated_by: record.generatedBy,
    })),
    representative_project_id: representativeProjectId,
    representative_reason: representativeReason,
    summary_kind: summaryKind,
    prompt_version: STUDENT_RECORD_PROMPT_VERSION,
  };
}
