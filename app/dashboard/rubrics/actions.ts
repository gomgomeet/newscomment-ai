"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";

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
