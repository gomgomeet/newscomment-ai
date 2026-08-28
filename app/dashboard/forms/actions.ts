"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { analyzeSchoolPdf, PDF_SOURCE_KEYS } from "@/lib/pdf/school-form";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(formData: FormData, key: string, fallback: number) {
  const value = Number(readText(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

async function requireOwnedTemplate(templateId: string) {
  const { supabase, user } = await requireUser();
  const { data: template, error } = await supabase.from("school_pdf_templates").select("*").eq("id", templateId).eq("owner_id", user.id).single();
  if (error || !template) redirect("/dashboard/forms?message=접근할 수 없는 학교 양식입니다.");
  return { supabase, user, template };
}

export async function uploadSchoolPdfTemplate(formData: FormData) {
  const { supabase, user } = await requireUser();
  const file = formData.get("pdf_file");
  const schoolName = readText(formData, "school_name");
  const documentType = readText(formData, "document_type");
  const schoolYear = readText(formData, "school_year");
  if (!(file instanceof File) || !schoolName || !documentType || !schoolYear) {
    redirect("/dashboard/forms?message=학교명, 문서 종류, 학년도, PDF 파일을 모두 입력해 주세요.");
  }
  if (file.type !== "application/pdf" || file.size <= 0 || file.size > MAX_PDF_BYTES) {
    redirect("/dashboard/forms?message=10MB 이하의 PDF 파일만 업로드할 수 있습니다.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder("ascii").decode(bytes.slice(0, 5)) !== "%PDF-") {
    redirect("/dashboard/forms?message=파일 내용이 올바른 PDF가 아닙니다.");
  }

  let analysis;
  try {
    analysis = await analyzeSchoolPdf(bytes);
  } catch {
    redirect("/dashboard/forms?message=암호화되었거나 손상된 PDF는 분석할 수 없습니다.");
  }
  if (analysis.pageCount > 20) redirect("/dashboard/forms?message=시연 버전은 20페이지 이하 PDF를 지원합니다.");

  const templateId = randomUUID();
  const storagePath = `${user.id}/${templateId}/original.pdf`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error: uploadError } = await supabase.storage.from("school-form-templates").upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) redirect(`/dashboard/forms?message=${encodeURIComponent(uploadError.message)}`);

  const { error: templateError } = await supabase.from("school_pdf_templates").insert({
    id: templateId,
    owner_id: user.id,
    school_name: schoolName,
    document_type: documentType,
    school_year: schoolYear,
    file_name: "school-form.pdf",
    storage_path: storagePath,
    sha256,
    page_count: analysis.pageCount,
    has_acroform: analysis.hasAcroform,
    analysis_status: "ready",
  });
  if (templateError) {
    await supabase.storage.from("school-form-templates").remove([storagePath]);
    redirect(`/dashboard/forms?message=${encodeURIComponent(templateError.message)}`);
  }
  if (analysis.fields.length) {
    const { error: fieldsError } = await supabase.from("school_pdf_template_fields").insert(
      analysis.fields.map((field: typeof analysis.fields[number]) => ({ ...field, template_id: templateId })),
    );
    if (fieldsError) redirect(`/dashboard/forms/${templateId}?message=${encodeURIComponent(fieldsError.message)}`);
  }
  revalidatePath("/dashboard/forms");
  redirect(`/dashboard/forms/${templateId}?notice=${encodeURIComponent(analysis.hasAcroform ? `PDF 입력 칸 ${analysis.fields.length}개를 찾았습니다.` : "일반 PDF입니다. 작성할 영역을 5개 이상 추가해 주세요.")}`);
}

export async function addManualPdfField(formData: FormData) {
  const templateId = readText(formData, "template_id");
  const { supabase, template } = await requireOwnedTemplate(templateId);
  const fieldLabel = readText(formData, "field_label");
  if (!fieldLabel) redirect(`/dashboard/forms/${template.id}?message=항목 이름을 입력해 주세요.`);
  const { count } = await supabase.from("school_pdf_template_fields").select("id", { count: "exact", head: true }).eq("template_id", template.id);
  const { error } = await supabase.from("school_pdf_template_fields").insert({
    template_id: template.id,
    page_number: Math.max(1, Math.round(readNumber(formData, "page_number", 1))),
    field_label: fieldLabel,
    x: readNumber(formData, "x", 40),
    y: readNumber(formData, "y", 40),
    width: readNumber(formData, "width", 500),
    height: readNumber(formData, "height", 80),
    source_key: "teacher_final_text",
    sort_order: count ?? 0,
  });
  if (error) redirect(`/dashboard/forms/${template.id}?message=${encodeURIComponent(error.message)}`);
  revalidatePath(`/dashboard/forms/${template.id}`);
  redirect(`/dashboard/forms/${template.id}`);
}

export async function updatePdfField(formData: FormData) {
  const templateId = readText(formData, "template_id");
  const fieldId = readText(formData, "field_id");
  const { supabase, template } = await requireOwnedTemplate(templateId);
  const requestedKey = readText(formData, "source_key");
  const sourceKey = PDF_SOURCE_KEYS.includes(requestedKey as (typeof PDF_SOURCE_KEYS)[number]) ? requestedKey : "teacher_final_text";
  const charLimit = readNumber(formData, "char_limit", 0);
  const lineLimit = readNumber(formData, "line_limit", 0);
  const { error } = await supabase.from("school_pdf_template_fields").update({
    field_label: readText(formData, "field_label") || "작성 항목",
    source_key: sourceKey,
    char_limit: charLimit > 0 ? Math.round(charLimit) : null,
    line_limit: lineLimit > 0 ? Math.round(lineLimit) : null,
    font_size: Math.min(Math.max(readNumber(formData, "font_size", 10), 6), 24),
    is_required: readText(formData, "is_required") === "true",
    page_number: Math.max(1, Math.round(readNumber(formData, "page_number", 1))),
    x: readNumber(formData, "x", 40),
    y: readNumber(formData, "y", 40),
    width: readNumber(formData, "width", 500),
    height: readNumber(formData, "height", 80),
  }).eq("id", fieldId).eq("template_id", template.id);
  if (error) redirect(`/dashboard/forms/${template.id}?message=${encodeURIComponent(error.message)}`);
  revalidatePath(`/dashboard/forms/${template.id}`);
  redirect(`/dashboard/forms/${template.id}?notice=${encodeURIComponent("PDF 항목 연결을 저장했습니다.")}`);
}
