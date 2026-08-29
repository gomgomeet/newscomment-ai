import type { Json } from "@/lib/db/types";

export type AssessmentRubricLevels = Record<"4" | "3" | "2" | "1", string>;

export type AssessmentSurveyConfig = {
  versionId: string;
  title: string;
  sourceText: string;
  prompt: string;
  prompts: string[];
  questionCriteria: string[][];
  questionRubrics: Record<string, AssessmentRubricLevels>[];
  questionTeacherGuidance: string[];
};

export function readAssessmentSurveyConfig(value: Json): AssessmentSurveyConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const survey = value.assessment_survey;
  if (!survey || typeof survey !== "object" || Array.isArray(survey)) return null;

  const versionId = typeof survey.version_id === "string" ? survey.version_id.trim() : "";
  const title = typeof survey.title === "string" ? survey.title.trim() : "";
  const sourceText = typeof survey.source_text === "string" ? survey.source_text.trim() : "";
  const legacyPrompt = typeof survey.prompt === "string" ? survey.prompt.trim() : "";
  const prompts = Array.isArray(survey.prompts)
    ? survey.prompts.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : legacyPrompt ? [legacyPrompt] : [];
  const prompt = prompts[0] ?? "";
  const questionCriteria = Array.isArray(survey.question_criteria)
    ? survey.question_criteria.map((item) => (
        Array.isArray(item)
          ? item.flatMap((criterionId) => typeof criterionId === "string" && criterionId.trim() ? [criterionId.trim()] : [])
          : []
      ))
    : [];
  const questionRubrics = Array.isArray(survey.question_rubrics)
    ? survey.question_rubrics.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return {};
        return Object.fromEntries(Object.entries(item).flatMap(([criterionId, levels]) => {
          if (!levels || typeof levels !== "object" || Array.isArray(levels)) return [];
          const readLevel = (score: "4" | "3" | "2" | "1") => (
            typeof levels[score] === "string" ? levels[score].trim() : ""
          );
          return [[criterionId, { "4": readLevel("4"), "3": readLevel("3"), "2": readLevel("2"), "1": readLevel("1") }]];
        }));
      })
    : [];
  const questionTeacherGuidance = Array.isArray(survey.question_teacher_guidance)
    ? survey.question_teacher_guidance.map((item) => typeof item === "string" ? item.trim() : "")
    : [];

  return versionId && title && prompt
    ? { versionId, title, sourceText, prompt, prompts, questionCriteria, questionRubrics, questionTeacherGuidance }
    : null;
}
