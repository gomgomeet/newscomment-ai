"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import {
  buildNewsArticleRubricCriteria,
  getDefaultStandardCodes,
  getStandardsByCodes,
  SCHOOL_LEVEL_LABELS,
  type SchoolLevel,
} from "@/lib/curriculum/news-article-rubric";
import type { Json } from "@/lib/db/types";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(formData: FormData, key: string, fallback: number) {
  const value = Number(readText(formData, key));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readNonNegativeInteger(formData: FormData, key: string, fallback: number) {
  const value = Number(readText(formData, key));
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function readSchoolLevel(formData: FormData): SchoolLevel {
  const value = readText(formData, "school_level");
  if (
    value === "elementary34" ||
    value === "elementary56" ||
    value === "middle" ||
    value === "highCommon" ||
    value === "highElective"
  ) {
    return value;
  }

  return "elementary56";
}

export async function createRubric(formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = readText(formData, "title");
  const description = readText(formData, "description");

  if (!title) {
    redirect("/dashboard/rubrics?message=루브릭 제목을 입력해 주세요.");
  }

  const { data, error } = await supabase
    .from("rubrics")
    .insert({
      owner_id: user.id,
      title,
      description: description || null,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/dashboard/rubrics?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/rubrics");
  redirect(`/dashboard/rubrics/${data.id}`);
}

export async function createNewsArticleRubric(formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = readText(formData, "title") || "신문기사 의견쓰기 루브릭";
  const articleTopic = readText(formData, "article_topic");
  const schoolLevel = readSchoolLevel(formData);
  const selectedCodes = formData
    .getAll("standard_codes")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const standardCodes = selectedCodes.length > 0 ? selectedCodes : getDefaultStandardCodes(schoolLevel);
  const standards = getStandardsByCodes(standardCodes);
  const criteria = buildNewsArticleRubricCriteria(schoolLevel);
  const levelLabel = SCHOOL_LEVEL_LABELS[schoolLevel];
  const descriptionParts = [
    `${levelLabel} 신문기사 읽기와 의견 쓰기 활동을 위한 자동 생성 루브릭입니다.`,
    articleTopic ? `수업 맥락: ${articleTopic}` : null,
    standards.length > 0 ? `반영 성취기준: ${standards.map((standard) => standard.code).join(", ")}` : null,
    "생성 후 교사가 기준명, 설명, 배점, 정렬을 수정할 수 있습니다.",
  ].filter(Boolean);

  const generationContext: Json = {
    kind: "news_article_opinion_rubric",
    school_level: schoolLevel,
    school_level_label: levelLabel,
    article_topic: articleTopic || null,
    selected_standards: standards.map((standard) => ({
      code: standard.code,
      level: standard.level,
      subject: standard.subject,
      summary: standard.summary,
      activity_fit: standard.activityFit,
    })),
  };

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .insert({
      owner_id: user.id,
      title,
      description: descriptionParts.join("\n"),
      auto_generated: true,
      generation_context: generationContext,
    })
    .select("id")
    .single();

  if (rubricError || !rubric) {
    redirect(`/dashboard/rubrics?message=${encodeURIComponent(rubricError?.message || "루브릭 자동 생성에 실패했습니다.")}`);
  }

  const { error: criteriaError } = await supabase.from("rubric_criteria").insert(
    criteria.map((criterion, index) => ({
      rubric_id: rubric.id,
      label: criterion.label,
      description: criterion.description,
      max_score: criterion.maxScore,
      sort_order: index,
    })),
  );

  if (criteriaError) {
    redirect(`/dashboard/rubrics/${rubric.id}?message=${encodeURIComponent(criteriaError.message)}`);
  }

  revalidatePath("/dashboard/rubrics");
  redirect(`/dashboard/rubrics/${rubric.id}?message=${encodeURIComponent("자동 생성된 기준을 필요에 맞게 수정해 주세요.")}`);
}

export async function updateRubric(formData: FormData) {
  const { supabase, user } = await requireUser();
  const rubricId = readText(formData, "rubric_id");
  const title = readText(formData, "title");
  const description = readText(formData, "description");

  if (!rubricId || !title) {
    redirect(`/dashboard/rubrics/${rubricId}?message=루브릭 제목을 입력해 주세요.`);
  }

  const { error } = await supabase
    .from("rubrics")
    .update({
      title,
      description: description || null,
    })
    .eq("id", rubricId)
    .eq("owner_id", user.id);

  if (error) {
    redirect(`/dashboard/rubrics/${rubricId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/rubrics");
  revalidatePath(`/dashboard/rubrics/${rubricId}`);
  redirect(`/dashboard/rubrics/${rubricId}`);
}

export async function addCriterion(formData: FormData) {
  const { supabase, user } = await requireUser();
  const rubricId = readText(formData, "rubric_id");
  const label = readText(formData, "label");
  const description = readText(formData, "description");
  const maxScore = readPositiveInteger(formData, "max_score", 5);

  if (!rubricId || !label || !description) {
    redirect(`/dashboard/rubrics/${rubricId}?message=기준명과 설명을 입력해 주세요.`);
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("id")
    .eq("id", rubricId)
    .eq("owner_id", user.id)
    .single();

  if (rubricError || !rubric) {
    redirect("/dashboard/rubrics?message=접근할 수 없는 루브릭입니다.");
  }

  const { count } = await supabase
    .from("rubric_criteria")
    .select("id", { count: "exact", head: true })
    .eq("rubric_id", rubricId);

  const { error } = await supabase.from("rubric_criteria").insert({
    rubric_id: rubricId,
    label,
    description,
    max_score: maxScore,
    sort_order: count ?? 0,
  });

  if (error) {
    redirect(`/dashboard/rubrics/${rubricId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/rubrics/${rubricId}`);
  redirect(`/dashboard/rubrics/${rubricId}`);
}

export async function updateCriterion(formData: FormData) {
  const { supabase, user } = await requireUser();
  const rubricId = readText(formData, "rubric_id");
  const criterionId = readText(formData, "criterion_id");
  const label = readText(formData, "label");
  const description = readText(formData, "description");
  const maxScore = readPositiveInteger(formData, "max_score", 5);
  const sortOrder = readNonNegativeInteger(formData, "sort_order", 0);

  if (!rubricId || !criterionId || !label || !description) {
    redirect(`/dashboard/rubrics/${rubricId}?message=기준명과 설명을 입력해 주세요.`);
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("id")
    .eq("id", rubricId)
    .eq("owner_id", user.id)
    .single();

  if (rubricError || !rubric) {
    redirect("/dashboard/rubrics?message=접근할 수 없는 루브릭입니다.");
  }

  const { error } = await supabase
    .from("rubric_criteria")
    .update({
      label,
      description,
      max_score: maxScore,
      sort_order: sortOrder,
    })
    .eq("id", criterionId)
    .eq("rubric_id", rubricId);

  if (error) {
    redirect(`/dashboard/rubrics/${rubricId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/rubrics/${rubricId}`);
  redirect(`/dashboard/rubrics/${rubricId}`);
}
