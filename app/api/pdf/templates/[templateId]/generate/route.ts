import { NextResponse } from "next/server";
import type { Json } from "@/lib/db/types";
import { fillSchoolPdf, type SchoolPdfField } from "@/lib/pdf/school-form";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function asRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

function formatSnapshotList(value: Json | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      const row = asRecord(item);
      return [row.code, row.label, row.description].filter((part): part is string => typeof part === "string" && Boolean(part)).join(" · ");
    }).filter(Boolean).join("\n");
  }
  return typeof value === "string" ? value : "";
}

function compact(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { templateId } = await params;
  const url = new URL(request.url);
  const summaryId = url.searchParams.get("summaryId")?.trim();
  const shouldStore = url.searchParams.get("store") === "1";
  if (!summaryId) return NextResponse.json({ error: "성장 기록 ID가 필요합니다." }, { status: 400 });

  const [templateResult, fieldsResult, summaryResult] = await Promise.all([
    supabase.from("school_pdf_templates").select("*").eq("id", templateId).eq("owner_id", user.id).single(),
    supabase.from("school_pdf_template_fields").select("*").eq("template_id", templateId).order("sort_order"),
    supabase.from("student_term_summaries").select("*").eq("id", summaryId).eq("owner_id", user.id).eq("status", "confirmed").single(),
  ]);
  const initialError = templateResult.error ?? fieldsResult.error ?? summaryResult.error;
  if (initialError || !templateResult.data || !summaryResult.data) {
    return NextResponse.json({ error: "소유한 양식과 교사 확정 성장 기록만 내보낼 수 있습니다." }, { status: 404 });
  }
  if (!fieldsResult.data?.length) {
    return NextResponse.json({ error: "먼저 PDF 작성 항목을 하나 이상 연결해 주세요." }, { status: 400 });
  }

  const template = templateResult.data;
  const summary = summaryResult.data;
  const { data: audit, error: auditError } = await supabase.from("export_audits").insert({
    owner_id: user.id,
    template_id: template.id,
    summary_id: summary.id,
    export_type: "pdf",
    status: "started",
    metadata: { store_requested: shouldStore, template_version: template.original_version },
  }).select("id").single();
  if (auditError || !audit) return NextResponse.json({ error: "내보내기 기록을 시작하지 못했습니다." }, { status: 500 });

  try {
    const evaluationIds = summary.included_evaluation_ids;
    const { data: evaluations, error: evaluationsError } = evaluationIds.length
      ? await supabase.from("evaluations").select("*").in("id", evaluationIds).eq("evaluator_id", user.id).eq("source", "teacher-manual").eq("status", "confirmed").order("confirmed_at")
      : { data: [], error: null };
    if (evaluationsError) throw evaluationsError;

    const projectIds = Array.from(new Set((evaluations ?? []).map((evaluation) => evaluation.project_id)));
    const commentIds = Array.from(new Set((evaluations ?? []).map((evaluation) => evaluation.comment_id)));
    const prepVersionIds = Array.from(new Set((evaluations ?? []).map((evaluation) => evaluation.assessment_prep_version_id).filter(Boolean))) as string[];
    const [projectsResult, commentsResult, scoresResult, prepVersionsResult] = await Promise.all([
      projectIds.length ? supabase.from("projects").select("id, title, rubric_id").in("id", projectIds).eq("owner_id", user.id) : Promise.resolve({ data: [], error: null }),
      commentIds.length ? supabase.from("comments").select("id, project_id").in("id", commentIds) : Promise.resolve({ data: [], error: null }),
      evaluationIds.length ? supabase.from("evaluation_scores").select("evaluation_id, criterion_id, score, rationale").in("evaluation_id", evaluationIds) : Promise.resolve({ data: [], error: null }),
      prepVersionIds.length ? supabase.from("assessment_prep_versions").select("id, snapshot").in("id", prepVersionIds).eq("created_by", user.id) : Promise.resolve({ data: [], error: null }),
    ]);
    const relatedError = projectsResult.error ?? commentsResult.error ?? scoresResult.error ?? prepVersionsResult.error;
    if (relatedError) throw relatedError;

    const rubricIds = Array.from(new Set((projectsResult.data ?? []).map((project) => project.rubric_id).filter(Boolean))) as string[];
    const { data: criteria, error: criteriaError } = rubricIds.length
      ? await supabase.from("rubric_criteria").select("id, label, max_score").in("rubric_id", rubricIds).order("sort_order")
      : { data: [], error: null };
    if (criteriaError) throw criteriaError;

    const criterionById = new Map((criteria ?? []).map((criterion) => [criterion.id, criterion]));
    const projectTitles = compact((projectsResult.data ?? []).map((project) => project.title));
    const criterionResults = (scoresResult.data ?? []).map((score) => {
      const criterion = criterionById.get(score.criterion_id);
      return `${criterion?.label ?? "평가 기준"}: ${score.score}/${criterion?.max_score ?? "-"}${score.rationale ? ` · ${score.rationale}` : ""}`;
    }).join("\n");
    const snapshots = (prepVersionsResult.data ?? []).map((version) => asRecord(version.snapshot));
    const standards = compact(snapshots.map((snapshot) => formatSnapshotList(snapshot.achievement_standards)));
    const goals = compact(snapshots.map((snapshot) => typeof snapshot.evaluation_goal === "string" ? snapshot.evaluation_goal : ""));
    const feedbacks = compact((evaluations ?? []).map((evaluation) => evaluation.feedback));
    const forwards = compact((evaluations ?? []).map((evaluation) => evaluation.evaluation_forward));
    const latestEvaluation = evaluations?.at(-1);
    const values: Record<string, string> = {
      student_key: summary.student_key,
      project_title: Array.from(new Set(projectTitles)).join(", "),
      assessment_period: summary.period_label,
      achievement_standards: Array.from(new Set(standards)).join("\n"),
      learning_goal: Array.from(new Set(goals)).join("\n"),
      criterion_results: criterionResults,
      strengths: feedbacks.join("\n"),
      growth_needs: latestEvaluation?.review_reasons.join(", ") ?? "",
      feedback_forward: forwards.at(-1) ?? "",
      growth_summary: summary.draft_text,
      special_record_draft: summary.draft_text,
      teacher_final_text: summary.teacher_final_text,
    };

    const { data: source, error: sourceError } = await supabase.storage.from("school-form-templates").download(template.storage_path);
    if (sourceError || !source) throw sourceError ?? new Error("원본 PDF를 읽지 못했습니다.");
    const { bytes, warnings } = await fillSchoolPdf({
      sourceBytes: new Uint8Array(await source.arrayBuffer()),
      fields: fieldsResult.data as SchoolPdfField[],
      values,
    });

    let storedPath: string | null = null;
    if (shouldStore) {
      storedPath = `${user.id}/${template.id}/generated/${audit.id}.pdf`;
      const { error: storeError } = await supabase.storage.from("school-form-templates").upload(storedPath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (storeError) throw storeError;
    }

    await supabase.from("export_audits").update({
      status: "completed",
      storage_path: storedPath,
      completed_at: new Date().toISOString(),
      metadata: {
        store_requested: shouldStore,
        template_version: template.original_version,
        warning_count: warnings.length,
        warnings,
        included_evaluation_ids: evaluationIds,
      } satisfies Json,
    }).eq("id", audit.id).eq("owner_id", user.id);

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="evaluation-record-${audit.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-PDF-Warning-Count": String(warnings.length),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "PDF 작성 중 오류가 발생했습니다.";
    await supabase.from("export_audits").update({
      status: "failed",
      error_message: errorMessage.slice(0, 500),
      completed_at: new Date().toISOString(),
    }).eq("id", audit.id).eq("owner_id", user.id);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
