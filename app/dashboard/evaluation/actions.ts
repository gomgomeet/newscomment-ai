"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import type { Json } from "@/lib/db/types";
import { readAssessmentSurveyConfig } from "@/lib/evaluation/assessment-survey";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readTexts(formData: FormData, key: string) {
  return formData.getAll(key).flatMap((value) =>
    typeof value === "string" && value.trim() ? [value.trim()] : [],
  );
}

function asRecord(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

export async function saveAssessmentSurvey(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const title = readText(formData, "title");
  const sourceText = readText(formData, "source_text");
  const prompts = readTexts(formData, "prompts");
  const questionCriteriaRaw = readText(formData, "question_criteria");
  const questionRubricsRaw = readText(formData, "question_rubrics");
  let questionCriteria: string[][] = [];
  try {
    const parsed = JSON.parse(questionCriteriaRaw) as unknown;
    if (Array.isArray(parsed)) {
      questionCriteria = parsed.map((item) => (
        Array.isArray(item)
          ? item.flatMap((criterionId) => typeof criterionId === "string" && criterionId.trim() ? [criterionId.trim()] : [])
          : []
      ));
    }
  } catch {
    questionCriteria = [];
  }
  let questionRubrics: Json[] = [];
  try {
    const parsed = JSON.parse(questionRubricsRaw) as Json;
    questionRubrics = Array.isArray(parsed) ? parsed : [];
  } catch {
    questionRubrics = [];
  }

  if (!projectId) {
    redirect(`/dashboard/evaluation?message=${encodeURIComponent("평가지를 다시 열어 저장해 주세요.")}`);
  }
  if (!title || !sourceText || prompts.length === 0) {
    redirect(`/dashboard/evaluation/${projectId}/worksheet?message=${encodeURIComponent("평가지 제목, 평가 자료, 수행 문항을 모두 입력해 주세요.")}`);
  }
  if (sourceText.length > 50000 || prompts.length > 10 || prompts.some((prompt) => prompt.length > 2000)) {
    redirect(`/dashboard/evaluation/${projectId}/worksheet?message=${encodeURIComponent("평가 자료 또는 문항이 너무 깁니다.")}`);
  }

  const { supabase, user } = await requireUser();
  const [{ data: project, error: projectError }, { data: prep, error: prepError }] = await Promise.all([
    supabase.from("projects").select("id, notion_source").eq("id", projectId).eq("owner_id", user.id).single(),
    supabase.from("assessment_preps").select("active_version_id").eq("project_id", projectId).eq("owner_id", user.id).single(),
  ]);

  if (projectError || !project || prepError || !prep?.active_version_id) {
    redirect(`/dashboard/evaluation?message=${encodeURIComponent("확정된 평가 설계를 찾지 못했습니다.")}`);
  }

  const existingSurvey = readAssessmentSurveyConfig(project.notion_source);

  const notionSource: Json = {
    ...asRecord(project.notion_source),
    assessment_survey: {
      version_id: prep.active_version_id,
      title,
      source_text: sourceText,
      prompt: prompts[0],
      prompts,
      question_criteria: prompts.map((_, index) => questionCriteria[index] ?? []),
      question_rubrics: prompts.map((_, index) => questionRubrics[index] ?? {}),
      question_teacher_guidance: prompts.map((_, index) => existingSurvey?.questionTeacherGuidance[index] ?? ""),
    },
  };

  const { error } = await supabase
    .from("projects")
    .update({ notion_source: notionSource })
    .eq("id", project.id)
    .eq("owner_id", user.id);

  if (error) {
    redirect(`/dashboard/evaluation/${project.id}/worksheet?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/evaluation");
  revalidatePath(`/dashboard/evaluation/${project.id}/worksheet`);
  redirect(`/dashboard/evaluation/${project.id}/worksheet?notice=${encodeURIComponent("평가지를 저장했습니다. 학생용 배포 링크를 사용할 수 있습니다.")}#saved-worksheet`);
}
