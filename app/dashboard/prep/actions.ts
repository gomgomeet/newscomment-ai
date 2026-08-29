"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import {
  buildAssessmentDesignRecommendation,
  buildContextRubricCriteria,
  buildRubricCriterionDescription,
} from "@/lib/curriculum/assessment-design-library";
import type { Json } from "@/lib/db/types";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readTexts(formData: FormData, key: string) {
  return formData.getAll(key).flatMap((value) =>
    typeof value === "string" && value.trim() ? [value.trim()] : [],
  );
}

function readNonNegativeInteger(formData: FormData, key: string, fallback: number) {
  const value = Number(readText(formData, key));
  return Number.isInteger(value) && value >= 0 ? value : fallback;
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

function readAchievementStandards(formData: FormData) {
  return parseStandards([
    ...readTexts(formData, "achievement_standards"),
    readText(formData, "custom_achievement_standards"),
  ].filter(Boolean).join("\n"));
}

function readStandardRecords(value: Json) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const record = asRecord(item);
    const code = typeof record?.code === "string" ? record.code.trim() : "";
    const textValue = record?.text ?? record?.summary;
    const text = typeof textValue === "string" ? textValue.trim() : "";
    return code || text ? [{ code, text }] : [];
  });
}

async function requireOwnedPrep(prepId: string) {
  const { supabase, user } = await requireUser();
  const { data: prep, error } = await supabase
    .from("assessment_preps")
    .select("id, project_id, owner_id, notion_config")
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

  if (existing) redirect(`/dashboard/prep/${existing.id}?mode=edit`);

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
  redirect(`/dashboard/prep/${created.id}?mode=edit`);
}

export async function createNewAssessmentPrep() {
  const { supabase, user } = await requireUser();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      title: "새 평가 설계",
      status: "draft",
    })
    .select("id")
    .single();

  if (projectError || !project) {
    redirect(`/dashboard/prep?message=${encodeURIComponent(projectError?.message ?? "새 평가 설계를 만들지 못했습니다.")}`);
  }

  const { data: prep, error: prepError } = await supabase
    .from("assessment_preps")
    .insert({
      owner_id: user.id,
      project_id: project.id,
    })
    .select("id")
    .single();

  if (prepError || !prep) {
    await supabase.from("projects").delete().eq("id", project.id).eq("owner_id", user.id);
    redirect(`/dashboard/prep?message=${encodeURIComponent(prepError?.message ?? "새 평가 설계를 준비하지 못했습니다.")}`);
  }

  revalidatePath("/dashboard/prep");
  redirect(`/dashboard/prep/${prep.id}?mode=edit`);
}

export async function deleteAssessmentPrep(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  if (!prepId) redirect("/dashboard/prep?message=삭제할 평가 설계를 찾을 수 없습니다.");

  const { supabase, prep } = await requireOwnedPrep(prepId);
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", prep.project_id);

  if (error) {
    redirect(`/dashboard/prep?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/prep");
  revalidatePath("/dashboard/evaluation");
  redirect(`/dashboard/prep?notice=${encodeURIComponent("평가 설계를 삭제했습니다.")}`);
}

export async function saveAssessmentPrep(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  if (!prepId) redirect("/dashboard/prep?message=평가 준비안을 찾을 수 없습니다.");

  const { supabase, prep } = await requireOwnedPrep(prepId);
  const activityName = readText(formData, "activity_name");
  const gradeLevel = readText(formData, "grade_level");
  const subject = readText(formData, "subject");
  const lessonContext = readText(formData, "lesson_context");
  const evaluationGoal = readText(formData, "evaluation_goal");
  const achievementStandards = readAchievementStandards(formData);
  const safetyRules = readText(formData, "safety_rules");
  const studentGuidance = readText(formData, "student_guidance");
  const sampleEvaluationNotes = readText(formData, "sample_evaluation_notes");
  const databaseUrl = readText(formData, "notion_database_url");
  const sourcePageUrl = readText(formData, "notion_source_page_url");
  const responseCollectionUrl = readText(formData, "notion_response_collection_url");
  const contentMode = readText(formData, "notion_content_mode") === "page_body" ? "page_body" : "property";
  const previousNotionConfig = asRecord(prep.notion_config);
  const notionConfig: Json = {
    ...previousNotionConfig,
    source_page_url: sourcePageUrl,
    response_collection_url: responseCollectionUrl,
    database_url: databaseUrl,
    content_mode: contentMode,
    content_property: readText(formData, "notion_content_property"),
    student_property: readText(formData, "notion_student_property"),
    topic_property: readText(formData, "notion_activity_property"),
  };

  if (!activityName) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("활동명을 입력해 주세요.")}`);
  }

  const { error } = await supabase
    .from("assessment_preps")
    .update({
      grade_level: gradeLevel,
      subject,
      lesson_context: lessonContext,
      evaluation_goal: evaluationGoal,
      achievement_standards: achievementStandards,
      safety_rules: safetyRules,
      student_guidance: studentGuidance,
      notion_config: notionConfig,
      sample_evaluation_notes: sampleEvaluationNotes,
      status: "draft",
    })
    .eq("id", prep.id);

  if (error) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(error.message)}`);
  }

  const { error: projectError } = await supabase
    .from("projects")
    .update({ title: activityName, notion_source: notionConfig })
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

export async function saveAssessmentContext(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  if (!prepId) redirect("/dashboard/prep?message=평가 준비안을 찾을 수 없습니다.");

  const { supabase, prep } = await requireOwnedPrep(prepId);
  const activityName = readText(formData, "activity_name");
  const gradeLevel = readText(formData, "grade_level");
  const subject = readText(formData, "subject");
  const lessonContext = readText(formData, "lesson_context");

  if (!activityName || !gradeLevel || !subject || !lessonContext) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("활동명, 학년, 교과, 수업 맥락을 모두 입력해 주세요.")}`);
  }

  const { error } = await supabase
    .from("assessment_preps")
    .update({
      grade_level: gradeLevel,
      subject,
      lesson_context: lessonContext,
      status: "draft",
    })
    .eq("id", prep.id);

  if (error) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(error.message)}`);
  }

  const { error: projectError } = await supabase
    .from("projects")
    .update({ title: activityName })
    .eq("id", prep.project_id);

  if (projectError) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(projectError.message)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/prep");
  revalidatePath(`/dashboard/prep/${prep.id}`);
  revalidatePath(`/dashboard/projects/${prep.project_id}`);
  redirect(`/dashboard/prep/${prep.id}?mode=edit&notice=${encodeURIComponent("수업 맥락을 저장하고 관련 성취기준을 불러왔습니다.")}`);
}

export async function createAssessmentRubric(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  if (!prepId) redirect("/dashboard/prep?message=평가 준비안을 찾을 수 없습니다.");

  const { supabase, user, prep } = await requireOwnedPrep(prepId);
  const submittedFromEditor = formData.has("lesson_context") || formData.has("evaluation_goal");

  if (submittedFromEditor) {
    const activityName = readText(formData, "activity_name");
    const gradeLevel = readText(formData, "grade_level");
    const subject = readText(formData, "subject");
    const lessonContext = readText(formData, "lesson_context");
    const evaluationGoal = readText(formData, "evaluation_goal");
    const achievementStandards = readAchievementStandards(formData);

    if (!activityName || !gradeLevel || !subject || !lessonContext) {
      redirect(`/dashboard/prep/${prep.id}?mode=edit&message=${encodeURIComponent("활동명, 학년, 교과, 수업 맥락을 모두 입력해 주세요.")}#context`);
    }
    if (!evaluationGoal || !Array.isArray(achievementStandards) || achievementStandards.length === 0) {
      redirect(`/dashboard/prep/${prep.id}?mode=edit&message=${encodeURIComponent("성취기준을 선택하고 평가 목표를 만들어 주세요.")}#standards`);
    }

    const [{ error: prepUpdateError }, { error: projectTitleError }] = await Promise.all([
      supabase
        .from("assessment_preps")
        .update({
          grade_level: gradeLevel,
          subject,
          lesson_context: lessonContext,
          evaluation_goal: evaluationGoal,
          achievement_standards: achievementStandards,
          status: "draft",
        })
        .eq("id", prep.id),
      supabase.from("projects").update({ title: activityName }).eq("id", prep.project_id).eq("owner_id", user.id),
    ]);

    if (prepUpdateError || projectTitleError) {
      redirect(`/dashboard/prep/${prep.id}?mode=edit&message=${encodeURIComponent(prepUpdateError?.message ?? projectTitleError?.message ?? "평가 설계를 저장하지 못했습니다.")}`);
    }
  }

  const [{ data: fullPrep, error: prepError }, { data: project, error: projectError }] = await Promise.all([
    supabase.from("assessment_preps").select("*").eq("id", prep.id).single(),
    supabase.from("projects").select("id, title").eq("id", prep.project_id).eq("owner_id", user.id).single(),
  ]);

  if (prepError || !fullPrep || projectError || !project) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(prepError?.message ?? projectError?.message ?? "평가 설계 정보를 읽지 못했습니다.")}`);
  }

  const standards = readStandardRecords(fullPrep.achievement_standards);
  if (!fullPrep.grade_level.trim() || !fullPrep.subject.trim() || !fullPrep.lesson_context.trim()) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("1번 수업 맥락을 먼저 저장해 주세요.")}`);
  }
  if (!fullPrep.evaluation_goal.trim() || standards.length === 0) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("2번 성취기준과 평가 목표를 먼저 저장해 주세요.")}`);
  }

  const recommendation = buildAssessmentDesignRecommendation({
    subject: fullPrep.subject,
    gradeBand: fullPrep.grade_level,
    lessonContext: fullPrep.lesson_context,
    standards: standards.map((standard) => [standard.code, standard.text].filter(Boolean).join(" ")),
  });

  if (!recommendation || recommendation.selectedElements.length === 0) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(`${fullPrep.subject} 교과의 교육과정 평가 요소가 아직 준비되지 않았습니다.`)}`);
  }

  const contextCriteria = buildContextRubricCriteria(fullPrep.lesson_context);

  const generationContext: Json = {
    kind: "assessment_prep_curriculum_library",
    prep_id: fullPrep.id,
    grade_level: fullPrep.grade_level,
    subject: fullPrep.subject,
    lesson_context: fullPrep.lesson_context,
    evaluation_goal: fullPrep.evaluation_goal,
    selected_standards: standards,
    curriculum_sources: recommendation.sourceFiles,
    generation_guidance: {
      context_criteria_required: true,
      context_criteria_min: 1,
      context_criteria_max: 2,
      score_free_design: true,
      achievement_levels: ["매우 잘함", "잘함", "보통", "더 연습 필요"],
      evidence_first: true,
    },
    selected_elements: recommendation.selectedElements.map((element) => ({
      key: element.key,
      label: element.label,
      domain: element.domain,
      lens: element.lens,
      observable_evidence: element.observableEvidence,
    })),
    context_criteria: contextCriteria,
  };

  const description = [
    fullPrep.evaluation_goal,
    `반영 성취기준: ${standards.map((standard) => standard.code || standard.text).join(", ")}`,
    `교육과정 근거: ${recommendation.sourceFiles.join(", ")}`,
  ].join("\n");

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .insert({
      owner_id: user.id,
      title: `${project.title} 평가 루브릭`,
      description,
      auto_generated: true,
      generation_context: generationContext,
    })
    .select("id")
    .single();

  if (rubricError || !rubric) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(rubricError?.message ?? "루브릭을 만들지 못했습니다.")}`);
  }

  const generatedCriteria = [
    ...contextCriteria.map((criterion) => ({
      key: criterion.key,
      label: criterion.label,
      focus: criterion.description,
      observableEvidence: criterion.observableEvidence,
    })),
    ...recommendation.selectedElements.map((element) => ({
      key: element.key,
      label: element.label,
      focus: element.criterionStem,
      observableEvidence: element.observableEvidence,
    })),
  ];

  const { error: criteriaError } = await supabase.from("rubric_criteria").insert(
    generatedCriteria.map((criterion, index) => ({
      rubric_id: rubric.id,
      label: criterion.label,
      description: buildRubricCriterionDescription({
        key: criterion.key,
        focus: criterion.focus,
        observableEvidence: criterion.observableEvidence,
      }),
      max_score: 4,
      sort_order: index,
    })),
  );

  if (criteriaError) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(criteriaError.message)}`);
  }

  const { error: projectUpdateError } = await supabase
    .from("projects")
    .update({ rubric_id: rubric.id })
    .eq("id", project.id)
    .eq("owner_id", user.id);

  if (projectUpdateError) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(projectUpdateError.message)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/prep");
  revalidatePath(`/dashboard/prep/${prep.id}`);
  revalidatePath(`/dashboard/projects/${project.id}`);
  revalidatePath("/dashboard/rubrics");
  redirect(`/dashboard/prep/${prep.id}?mode=edit&notice=${encodeURIComponent("수업 맥락과 성취기준을 바탕으로 성취수준 루브릭을 만들었습니다.")}#rubric`);
}

export async function updateAssessmentRubricCriterion(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  const criterionId = readText(formData, "criterion_id");
  const label = readText(formData, "label");
  const description = readText(formData, "description");
  const sortOrder = readNonNegativeInteger(formData, "sort_order", 0);

  if (!prepId || !criterionId || !label || !description) {
    redirect(`/dashboard/prep/${prepId}?message=${encodeURIComponent("기준명과 설명을 입력해 주세요.")}`);
  }

  const { supabase, user, prep } = await requireOwnedPrep(prepId);
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, rubric_id")
    .eq("id", prep.project_id)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project?.rubric_id) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("수정할 루브릭을 찾지 못했습니다.")}`);
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("id")
    .eq("id", project.rubric_id)
    .eq("owner_id", user.id)
    .single();

  if (rubricError || !rubric) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("수정할 수 없는 루브릭입니다.")}`);
  }

  const { error } = await supabase
    .from("rubric_criteria")
    .update({ label, description, sort_order: sortOrder })
    .eq("id", criterionId)
    .eq("rubric_id", rubric.id);

  if (error) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/prep/${prep.id}`);
  revalidatePath(`/dashboard/projects/${project.id}`);
  revalidatePath(`/dashboard/rubrics/${rubric.id}`);
  redirect(`/dashboard/prep/${prep.id}?mode=edit&notice=${encodeURIComponent("평가 기준을 수정했습니다.")}#rubric`);
}

export async function addAssessmentRubricCriterion(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  const label = readText(formData, "label");
  const description = readText(formData, "description");

  if (!prepId || !label || !description) {
    redirect(`/dashboard/prep/${prepId}?message=${encodeURIComponent("기준명과 설명을 입력해 주세요.")}`);
  }

  const { supabase, user, prep } = await requireOwnedPrep(prepId);
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, rubric_id")
    .eq("id", prep.project_id)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project?.rubric_id) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("기준을 추가할 루브릭을 먼저 만들어 주세요.")}`);
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("id")
    .eq("id", project.rubric_id)
    .eq("owner_id", user.id)
    .single();

  if (rubricError || !rubric) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("수정할 수 없는 루브릭입니다.")}`);
  }

  const { count, error: countError } = await supabase
    .from("rubric_criteria")
    .select("id", { count: "exact", head: true })
    .eq("rubric_id", rubric.id);

  if (countError) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(countError.message)}`);
  }

  const { error } = await supabase.from("rubric_criteria").insert({
    rubric_id: rubric.id,
    label,
    description,
    max_score: 4,
    sort_order: count ?? 0,
  });

  if (error) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/prep/${prep.id}`);
  revalidatePath(`/dashboard/projects/${project.id}`);
  revalidatePath(`/dashboard/rubrics/${rubric.id}`);
  redirect(`/dashboard/prep/${prep.id}?mode=edit&notice=${encodeURIComponent("루브릭 기준을 추가했습니다.")}#rubric`);
}

export async function deleteAssessmentRubricCriterion(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  const criterionId = readText(formData, "criterion_id");

  if (!prepId || !criterionId) {
    redirect(`/dashboard/prep/${prepId}?mode=edit&message=${encodeURIComponent("삭제할 평가 기준을 찾지 못했습니다.")}#rubric`);
  }

  const { supabase, user, prep } = await requireOwnedPrep(prepId);
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, rubric_id")
    .eq("id", prep.project_id)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project?.rubric_id) {
    redirect(`/dashboard/prep/${prep.id}?mode=edit&message=${encodeURIComponent("삭제할 평가 기준을 찾지 못했습니다.")}#rubric`);
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("id")
    .eq("id", project.rubric_id)
    .eq("owner_id", user.id)
    .single();

  if (rubricError || !rubric) {
    redirect(`/dashboard/prep/${prep.id}?mode=edit&message=${encodeURIComponent("수정할 수 없는 루브릭입니다.")}#rubric`);
  }

  const { error } = await supabase
    .from("rubric_criteria")
    .delete()
    .eq("id", criterionId)
    .eq("rubric_id", rubric.id);

  if (error) {
    redirect(`/dashboard/prep/${prep.id}?mode=edit&message=${encodeURIComponent(error.message)}#rubric`);
  }

  revalidatePath(`/dashboard/prep/${prep.id}`);
  revalidatePath(`/dashboard/projects/${project.id}`);
  revalidatePath(`/dashboard/rubrics/${rubric.id}`);
  redirect(`/dashboard/prep/${prep.id}?mode=edit&notice=${encodeURIComponent("평가 기준을 삭제했습니다.")}#rubric`);
}

export async function activateAssessmentPrep(formData: FormData) {
  const prepId = readText(formData, "prep_id");
  if (!prepId) redirect("/dashboard/prep?message=평가 준비안을 찾을 수 없습니다.");

  const { supabase, prep } = await requireOwnedPrep(prepId);
  const { data: fullPrep, error: prepError } = await supabase
    .from("assessment_preps")
    .select("*")
    .eq("id", prep.id)
    .single();

  if (prepError || !fullPrep) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(prepError?.message ?? "평가 설계를 찾을 수 없습니다.")}`);
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, rubric_id")
    .eq("id", fullPrep.project_id)
    .single();

  if (projectError || !project) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(projectError?.message ?? "수업활동을 찾을 수 없습니다.")}`);
  }

  if (!fullPrep.grade_level.trim() || !fullPrep.subject.trim() || !fullPrep.lesson_context.trim()) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("학년, 교과, 수업 맥락을 입력해 주세요.")}`);
  }

  if (!fullPrep.evaluation_goal.trim() || !Array.isArray(fullPrep.achievement_standards) || fullPrep.achievement_standards.length === 0) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("성취기준과 평가 목표를 입력해 주세요.")}`);
  }

  if (!project.rubric_id) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("수업활동에 루브릭을 연결해 주세요.")}`);
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("*")
    .eq("id", project.rubric_id)
    .single();

  const { data: criteria, error: criteriaError } = await supabase
    .from("rubric_criteria")
    .select("*")
    .eq("rubric_id", project.rubric_id)
    .order("sort_order", { ascending: true });

  if (rubricError || !rubric || criteriaError || !criteria?.length) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent("루브릭 평가 기준을 한 개 이상 준비해 주세요.")}`);
  }

  const nextVersion = fullPrep.current_version + 1;
  const snapshot: Json = {
    project_title: project.title,
    grade_level: fullPrep.grade_level,
    subject: fullPrep.subject,
    lesson_context: fullPrep.lesson_context,
    evaluation_goal: fullPrep.evaluation_goal,
    achievement_standards: fullPrep.achievement_standards,
    safety_rules: fullPrep.safety_rules,
    student_guidance: fullPrep.student_guidance,
    notion_config: fullPrep.notion_config,
    sample_evaluation_notes: fullPrep.sample_evaluation_notes,
    rubric: {
      id: rubric.id,
      title: rubric.title,
      description: rubric.description,
      generation_context: rubric.generation_context,
      criteria: criteria.map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        description: criterion.description,
        max_score: criterion.max_score,
        sort_order: criterion.sort_order,
      })),
    },
  };

  const { data: version, error: versionError } = await supabase
    .from("assessment_prep_versions")
    .insert({
      prep_id: fullPrep.id,
      project_id: fullPrep.project_id,
      rubric_id: project.rubric_id,
      version_number: nextVersion,
      snapshot,
      created_by: fullPrep.owner_id,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(versionError?.message ?? "평가 설계를 확정하지 못했습니다.")}`);
  }

  const { error: updateError } = await supabase
    .from("assessment_preps")
    .update({
      status: "active",
      current_version: nextVersion,
      active_version_id: version.id,
    })
    .eq("id", fullPrep.id);

  if (updateError) {
    redirect(`/dashboard/prep/${prep.id}?message=${encodeURIComponent(updateError.message)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/prep");
  revalidatePath(`/dashboard/prep/${prep.id}`);
  revalidatePath(`/dashboard/projects/${prep.project_id}`);
  revalidatePath("/dashboard/evaluation");
  redirect(`/dashboard/evaluation?notice=${encodeURIComponent("평가 설계를 확정했습니다. 이제 학생 배포와 채점 운영으로 이어갈 수 있습니다.")}`);
}
