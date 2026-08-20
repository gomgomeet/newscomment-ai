"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createProject(formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const sourceUrl = readText(formData, "source_url");
  const rubricId = readText(formData, "rubric_id");

  if (!title) {
    redirect("/dashboard/projects?message=프로젝트 제목을 입력해 주세요.");
  }

  if (rubricId) {
    const { data: rubric, error: rubricError } = await supabase
      .from("rubrics")
      .select("id")
      .eq("id", rubricId)
      .eq("owner_id", user.id)
      .single();

    if (rubricError || !rubric) {
      redirect("/dashboard/projects?message=접근할 수 없는 루브릭입니다.");
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      rubric_id: rubricId || null,
      title,
      description: description || null,
      source_url: sourceUrl || null,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/dashboard/projects?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/projects");
  redirect(`/dashboard/projects/${data.id}`);
}

export async function updateProject(formData: FormData) {
  const { supabase, user } = await requireUser();
  const projectId = readText(formData, "project_id");
  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const sourceUrl = readText(formData, "source_url");
  const rubricId = readText(formData, "rubric_id");
  const status = readText(formData, "status");

  if (!projectId || !title) {
    redirect(`/dashboard/projects/${projectId}?message=프로젝트 제목을 입력해 주세요.`);
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) {
    redirect("/dashboard/projects?message=접근할 수 없는 프로젝트입니다.");
  }

  if (rubricId) {
    const { data: rubric, error: rubricError } = await supabase
      .from("rubrics")
      .select("id")
      .eq("id", rubricId)
      .eq("owner_id", user.id)
      .single();

    if (rubricError || !rubric) {
      redirect(`/dashboard/projects/${projectId}?message=접근할 수 없는 루브릭입니다.`);
    }
  }

  const normalizedStatus =
    status === "active" || status === "archived" || status === "draft" ? status : "draft";

  const { error } = await supabase
    .from("projects")
    .update({
      title,
      description: description || null,
      source_url: sourceUrl || null,
      rubric_id: rubricId || null,
      status: normalizedStatus,
    })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  if (error) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/projects");
  redirect(`/dashboard/projects/${projectId}`);
}
