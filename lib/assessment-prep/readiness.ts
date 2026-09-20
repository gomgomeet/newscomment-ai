import type { Json } from "@/lib/db/types";

export type AssessmentPrepStage = {
  key: "context" | "standards" | "rubric" | "notion";
  label: string;
  description: string;
  complete: boolean;
  href: string;
};

export type AssessmentPrepReadiness = {
  projectId: string;
  projectTitle: string;
  completedCount: number;
  stages: AssessmentPrepStage[];
  nextStage: AssessmentPrepStage | null;
  selectedStandards: string[];
};

function asRecord(value: Json | undefined) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : null;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function readSelectedStandardCodes(generationContext: Json | null | undefined) {
  const context = asRecord(generationContext ?? undefined);
  const selectedStandards = context?.selected_standards;
  if (!Array.isArray(selectedStandards)) {
    return [];
  }

  return selectedStandards
    .map((standard) => {
      const record = asRecord(standard);
      const code = record?.code;
      return typeof code === "string" ? code.trim() : "";
    })
    .filter(Boolean);
}

export function isNotionResultMetadata(metadata: Json) {
  return asRecord(metadata)?.source === "notion";
}

export function readAchievementStandardCodes(value: Json | null | undefined) {
  if (!Array.isArray(value)) return [];

  return value
    .map((standard) => {
      const record = asRecord(standard);
      const code = record?.code;
      const text = record?.text ?? record?.summary;
      if (typeof code === "string" && code.trim()) return code.trim();
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean);
}

export function buildAssessmentPrepReadiness({
  project,
  rubricGenerationContext,
  criterionCount,
  notionConnectionConfigured,
  notionResultCount,
  assessmentPrep,
}: {
  project: {
    id: string;
    title: string;
    description: string | null;
    rubric_id: string | null;
    notion_source: Json;
  };
  rubricGenerationContext: Json | null | undefined;
  criterionCount: number;
  notionConnectionConfigured: boolean;
  notionResultCount: number;
  assessmentPrep?: {
    id: string;
    grade_level: string;
    subject: string;
    lesson_context: string;
    evaluation_goal: string;
    achievement_standards: Json;
    safety_rules: string;
    student_guidance: string;
    notion_config: Json;
    sample_evaluation_notes: string;
  } | null;
}): AssessmentPrepReadiness {
  const savedStandards = readAchievementStandardCodes(assessmentPrep?.achievement_standards);
  const selectedStandards = savedStandards.length > 0
    ? savedStandards
    : readSelectedStandardCodes(rubricGenerationContext);
  const notionSource = asRecord(project.notion_source);
  const prepNotionConfig = asRecord(assessmentPrep?.notion_config);
  const hasNotionMapping = hasText(
    typeof prepNotionConfig?.database_url === "string"
      ? prepNotionConfig.database_url
      : typeof notionSource?.database_url === "string"
        ? notionSource.database_url
        : "",
  );

  const prepHref = assessmentPrep ? `/dashboard/prep/${assessmentPrep.id}` : `/dashboard/prep#project-${project.id}`;
  const stages: AssessmentPrepStage[] = [
    {
      key: "context",
      label: "수업 맥락",
      description: "학년·교과·수업 맥락을 기록합니다.",
      complete: Boolean(
        assessmentPrep
        && hasText(assessmentPrep.grade_level)
        && hasText(assessmentPrep.subject)
        && hasText(assessmentPrep.lesson_context),
      ),
      href: prepHref,
    },
    {
      key: "standards",
      label: "성취기준·목표",
      description: "성취기준 원문과 이번 평가 목표를 연결합니다.",
      complete: Boolean(assessmentPrep && selectedStandards.length > 0 && hasText(assessmentPrep.evaluation_goal)),
      href: prepHref,
    },
    {
      key: "rubric",
      label: "평가 기준",
      description: "실제 결과물에서 관찰할 기준과 배점을 확인합니다.",
      complete: Boolean(project.rubric_id) && criterionCount > 0,
      href: prepHref,
    },
    {
      key: "notion",
      label: "Notion 읽기",
      description: notionConnectionConfigured
        ? notionResultCount > 0
          ? `학생 결과물 위치가 연결되어 있고 ${notionResultCount}개를 읽었습니다.`
          : "학생 결과물 데이터베이스와 읽기 위치를 연결합니다."
        : "서버의 Notion 읽기 연결을 먼저 설정합니다.",
      complete: notionConnectionConfigured && hasNotionMapping,
      href: prepHref,
    },
  ];

  return {
    projectId: project.id,
    projectTitle: project.title,
    completedCount: stages.filter((stage) => stage.complete).length,
    stages,
    nextStage: stages.find((stage) => !stage.complete) ?? null,
    selectedStandards,
  };
}
