"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import type { Json } from "@/lib/db/types";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: Json | null | undefined) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function standardsFromRubricContext(value: Json | null | undefined): Json {
  const selected = asRecord(value)?.selected_standards;
  if (!Array.isArray(selected)) return [];

  return selected.flatMap((item) => {
    const record = asRecord(item);
    const code = typeof record?.code === "string" ? record.code.trim() : "";
    const text = typeof record?.summary === "string" ? record.summary.trim() : "";
    return code || text ? [{ code, text }] : [];
  });
}

function parseStandards(value: string): Json {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("|");
      if (separator < 0) return { code: "", text: line };
      return {
        code: line.slice(0, separator).trim(),
        text: line.slice(separator + 1).trim(),
      };
    })
    .filter((standard) => standard.code || standard.text);
}

async function requireOwnedPrep(prepId: string) {
  const { supabase, user } = await requireUser();
  const { data: prep, error } = await supabase
    .from("assessment_preps")
    .select("id, project_id, owner_id")
    .eq("id", prepId)
    .eq("owner_id", user.id)
    .single();

  if (error || !prep) {
    redirect("/dashboard/prep?message=접근할 수 없는 평가 준비안입니다.");
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", prep.project_id)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) {
    redirect("/dashboard/prep?message=연결된 수업활동에 접근할 수 없습니다.");
  }

  return { supabase, user, prep };
}

export async function openAssessmentPrep(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const { supabase, user } = await requireUser();

  if (!projectId) redirect("/dashboard/prep?message=수업활동을 선택해 주세요.");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, description, rubric_id, notion_source")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) {
    redirect("/dashboard/prep?message=접근할 수 없는 수업활동입니다.");
  }

  const { data: existing } = await supabase
    .from("assessment_preps")
    .select("id")
    .eq("project_id", project.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (existing) redirect(`/dashboard/prep/${existing.id}`);

  const { data: rubric } = project.rubric_id
    ? await supabase
        .from("rubrics")
        .select("generation_context")
        .eq("id", project.rubric_id)
        .eq("owner_id", user.id)
        .maybeSingle()
    : { data: null };

  const { data: created, error } = await supabase
    .from("assessment_preps")
    .insert({
      owner_id: user.id,
      project_id: project.id,
      lesson_context: project.description ?? "",
      evaluation_goal: project.description ?? "",
      achievement_standards: standardsFromRubricContext(rubric?.generation_context),
      notion_config: project.notion_source,
    })
    .select("id")
    .single();

  if (error || !created) {
    redirect(`/dashboard/prep?message=${encodeURIComponent(error?.message ?? "평가 준비안을 만들지 못했습니다.")}`);
  }

  revalidatePath("/dashboard/prep");
  redirect(`/dashboard/prep/${created.id}`);
}

export async function saveAssessmentPrep(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  if (!prepId) redirect("/dashboard/prep?message=평가 준비안을 찾을 수 없습니다.");

  const { supabase, prep } = await requireOwnedPrep(prepId);
  const gradeLevel = readText(formData, "grade_level");
  const subject = readText(formData, "subject");
  const lessonContext = readText(formData, "lesson_context");
  const evaluationGoal = readText(formData, "evaluation_goal");
  const achievementStandards = parseStandards(readText(formData, "achievement_standards"));
  const databaseUrl = readText(formData, "notion_database_url");
  const contentMode = readText(formData, "notion_content_mode") === "page_body" ? "page_body" : "property";
  const notionConfig: Json = {
    database_url: databaseUrl,
    content_mode: contentMode,
    content_property: readText(formData, "notion_content_property"),
    student_property: readText(formData, "notion_student_property"),
    topic_property: readText(formData, "notion_activity_property"),
  };

  const { error } = await supabase
    .from("assessment_preps")
    .update({
      grade_level: gradeLevel,
      subject,
      lesson_context: lessonContext,
      evaluation_goal: evaluationGoal,
      achievement_standards: achievementStandards,
      notion_config: notionConfig,
      status: "draft",
    })
    .eq("id", prep.id);

  if (error) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(error.message)}`);
  }

  const { error: projectError } = await supabase
    .from("projects")
    .update({ notion_source: notionConfig })
    .eq("id", prep.project_id);

  if (projectError) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(projectError.message)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/prep");
  revalidatePath(`/dashboard/prep/${prep.id}`);
  revalidatePath(`/dashboard/projects/${prep.project_id}`);
  redirect(`/dashboard/prep/${prep.id}?notice=${encodeURIComponent("평가 준비안을 저장했습니다. 활성 버전은 그대로 보존됩니다.")}`);
}

export async function activateAssessmentPrep(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  if (!prepId) redirect("/dashboard/prep?message=평가 준비안을 찾을 수 없습니다.");

  const { supabase, prep } = await requireOwnedPrep(prepId);
  const { data: versionId, error } = await supabase.rpc("activate_assessment_prep", {
    target_prep_id: prep.id,
  });

  if (error || !versionId) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(error?.message ?? "평가 준비안을 활성화하지 못했습니다.")}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/prep");
  revalidatePath(`/dashboard/prep/${prep.id}`);
  revalidatePath(`/dashboard/projects/${prep.project_id}`);
  redirect(`/dashboard/prep/${prep.id}?notice=${encodeURIComponent("새 활성 버전을 만들었습니다. 이후 평가는 이 기준에 고정됩니다.")}`);
}
