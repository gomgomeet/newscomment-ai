"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import type { Json } from "@/lib/db/types";
import { extractNotionDatabaseId } from "@/lib/notion/import-comments";
import {
  EvaluationNotionConnectionError,
  getEvaluationNotionAccessToken,
  getEvaluationNotionConnectionStatus,
} from "@/lib/notion/teacher-connection";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function criterionKey(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function openStudentSummary(formData: FormData) {
  const studentKey = readText(formData, "student_key");
  const periodLabel = readText(formData, "period_label") || `${new Date().getFullYear()}학년도`;
  if (!studentKey) redirect("/dashboard/growth?message=학생 식별자를 찾을 수 없습니다.");

  const { supabase, user } = await requireUser();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, title, rubric_id")
    .eq("owner_id", user.id);
  if (projectsError) redirect(`/dashboard/growth?message=${encodeURIComponent(projectsError.message)}`);
  const projectIds = (projects ?? []).map((project) => project.id);
  if (!projectIds.length) redirect("/dashboard/growth?message=평가활동이 없습니다.");

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("id, project_id, student_name, content")
    .in("project_id", projectIds)
    .eq("student_name", studentKey);
  if (commentsError) redirect(`/dashboard/growth?message=${encodeURIComponent(commentsError.message)}`);
  const commentIds = (comments ?? []).map((comment) => comment.id);
  if (!commentIds.length) redirect("/dashboard/growth?message=해당 학생의 결과물을 찾지 못했습니다.");

  const { data: evaluations, error: evaluationsError } = await supabase
    .from("evaluations")
    .select("*")
    .in("comment_id", commentIds)
    .eq("evaluator_id", user.id)
    .eq("source", "teacher-manual")
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: true });
  if (evaluationsError) redirect(`/dashboard/growth?message=${encodeURIComponent(evaluationsError.message)}`);
  if (!evaluations?.length) redirect("/dashboard/growth?message=교사가 확정한 평가가 없습니다.");

  const evaluationIds = evaluations.map((evaluation) => evaluation.id);
  const { data: scores } = await supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds);
  const rubricIds = Array.from(new Set((projects ?? []).map((project) => project.rubric_id).filter(Boolean))) as string[];
  const { data: criteria } = rubricIds.length
    ? await supabase.from("rubric_criteria").select("*").in("rubric_id", rubricIds)
    : { data: [] };
  const criterionById = new Map((criteria ?? []).map((criterion) => [criterion.id, criterion]));
  const scoresByEvaluation = new Map<string, NonNullable<typeof scores>>();
  for (const score of scores ?? []) {
    const rows = scoresByEvaluation.get(score.evaluation_id) ?? [];
    rows.push(score);
    scoresByEvaluation.set(score.evaluation_id, rows);
  }

  const growthRows = [];
  for (let index = 1; index < evaluations.length; index += 1) {
    const previous = evaluations[index - 1];
    const current = evaluations[index];
    const previousByKey = new Map((scoresByEvaluation.get(previous.id) ?? []).flatMap((score) => {
      const criterion = criterionById.get(score.criterion_id);
      return criterion ? [[criterionKey(criterion.label), { score, criterion }] as const] : [];
    }));
    for (const currentScore of scoresByEvaluation.get(current.id) ?? []) {
      const criterion = criterionById.get(currentScore.criterion_id);
      if (!criterion) continue;
      const key = criterionKey(criterion.label);
      const previousScore = previousByKey.get(key);
      const previousPercentage = previousScore ? (previousScore.score.score / previousScore.criterion.max_score) * 100 : null;
      const currentPercentage = (currentScore.score / criterion.max_score) * 100;
      const difference = previousPercentage == null ? null : currentPercentage - previousPercentage;
      growthRows.push({
        owner_id: user.id,
        student_key: studentKey,
        previous_evaluation_id: previous.id,
        current_evaluation_id: current.id,
        criterion_key: key,
        previous_score_percentage: previousPercentage,
        current_score_percentage: currentPercentage,
        previous_evidence: previousScore?.score.rationale ?? null,
        current_evidence: currentScore.rationale,
        change_type: previousPercentage == null ? "not-observed" as const : difference! >= 10 ? "improved" as const : difference! <= -10 ? "needs-support" as const : "maintained" as const,
        prior_evaluation_forward: previous.evaluation_forward,
      });
    }
  }
  if (growthRows.length) {
    await supabase.from("student_growth_records").upsert(growthRows, { onConflict: "current_evaluation_id,criterion_key" });
  }

  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));
  const activityTitles = Array.from(new Set(evaluations.map((evaluation) => projectById.get(evaluation.project_id)?.title).filter(Boolean))) as string[];
  const latest = evaluations.at(-1)!;
  const draftText = evaluations.length >= 2
    ? `${studentKey}은(는) ${activityTitles.join(", ")} 활동에서 교사가 확인한 근거를 바탕으로 학습 과정을 이어감. ${latest.feedback || "최근 결과물에서 강점과 보완점을 확인함."} 다음 활동에서는 ${latest.evaluation_forward || "확정된 평가 포워드를 적용할 필요가 있음."}`
    : `${studentKey}은(는) ${activityTitles[0] || "평가활동"}에서 ${latest.feedback || "교사가 확인한 학습 근거를 보임."} 한 번의 근거이므로 반복적 성장으로 단정하지 않고 추가 관찰이 필요함.`;
  const evidence: Json = {
    project_ids: Array.from(new Set(evaluations.map((evaluation) => evaluation.project_id))),
    comment_ids: comments?.map((comment) => comment.id) ?? [],
    evaluation_ids: evaluationIds,
    evidence_count: evaluations.length,
  };
  const { data: summary, error: summaryError } = await supabase
    .from("student_term_summaries")
    .insert({
      owner_id: user.id,
      student_key: studentKey,
      period_label: periodLabel,
      included_evaluation_ids: evaluationIds,
      evidence,
      draft_text: draftText,
      teacher_final_text: draftText,
    })
    .select("id")
    .single();
  if (summaryError || !summary) redirect(`/dashboard/growth?message=${encodeURIComponent(summaryError?.message || "종합 기록을 만들지 못했습니다.")}`);
  redirect(`/dashboard/growth/summaries/${summary.id}`);
}

export async function saveStudentSummary(formData: FormData) {
  const summaryId = readText(formData, "summary_id");
  const teacherFinalText = readText(formData, "teacher_final_text");
  const confirm = readText(formData, "confirm") === "true";
  if (!summaryId || !teacherFinalText) redirect(`/dashboard/growth/summaries/${summaryId}?message=교사 최종 문장을 입력해 주세요.`);
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("student_term_summaries").update({
    teacher_final_text: teacherFinalText,
    status: confirm ? "confirmed" : "draft",
    confirmed_at: confirm ? new Date().toISOString() : null,
  }).eq("id", summaryId).eq("owner_id", user.id);
  if (error) redirect(`/dashboard/growth/summaries/${summaryId}?message=${encodeURIComponent(error.message)}`);
  revalidatePath(`/dashboard/growth/summaries/${summaryId}`);
  redirect(`/dashboard/growth/summaries/${summaryId}?notice=${encodeURIComponent(confirm ? "교사 최종 문장을 확정했습니다. 이제 PDF 작성에 사용할 수 있습니다." : "종합 기록 초안을 저장했습니다.")}`);
}

function notionRichText(content: string) {
  return [{ type: "text", text: { content: content.slice(0, 1900) } }];
}

function notionParagraphs(content: string) {
  const chunks = content.match(/[\s\S]{1,1900}/g) ?? [""];
  return chunks.map((chunk) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: notionRichText(chunk) },
  }));
}

export async function exportStudentSummaryToNotion(formData: FormData) {
  const summaryId = readText(formData, "summary_id");
  if (!summaryId) redirect("/dashboard/growth?message=성장 기록을 찾을 수 없습니다.");

  const { supabase, user } = await requireUser();
  let apiKey = "";
  let defaultParentPageId: string | null = null;
  try {
    const [token, connection] = await Promise.all([
      getEvaluationNotionAccessToken({ supabase, userId: user.id }),
      getEvaluationNotionConnectionStatus({ supabase, userId: user.id }),
    ]);
    apiKey = token;
    defaultParentPageId = connection.defaultExportParentPageId;
  } catch (error) {
    const message = error instanceof EvaluationNotionConnectionError
      ? error.message
      : "Notion 연결정보를 확인하지 못했습니다.";
    redirect(`/dashboard/growth/summaries/${summaryId}?message=${encodeURIComponent(message)}`);
  }

  const parentInput = readText(formData, "notion_parent_page") || defaultParentPageId || "";
  const parentPageId = extractNotionDatabaseId(parentInput);
  if (!parentPageId) {
    redirect(`/dashboard/growth/summaries/${summaryId}?message=${encodeURIComponent("저장할 Notion 상위 페이지 URL 또는 ID를 확인해 주세요.")}`);
  }
  const { data: summary, error: summaryError } = await supabase
    .from("student_term_summaries")
    .select("*")
    .eq("id", summaryId)
    .eq("owner_id", user.id)
    .eq("status", "confirmed")
    .single();
  if (summaryError || !summary) {
    redirect(`/dashboard/growth/summaries/${summaryId}?message=${encodeURIComponent("교사가 확정한 성장 기록만 Notion에 저장할 수 있습니다.")}`);
  }
  const { data: audit, error: auditError } = await supabase.from("export_audits").insert({
    owner_id: user.id,
    summary_id: summary.id,
    export_type: "notion",
    status: "started",
    metadata: { parent_page_id: parentPageId },
  }).select("id").single();
  if (auditError || !audit) {
    redirect(`/dashboard/growth/summaries/${summaryId}?message=${encodeURIComponent("Notion 저장 기록을 시작하지 못했습니다.")}`);
  }

  let exportError = "";
  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": process.env.NOTION_API_VERSION || "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: {
          title: { title: notionRichText(`${summary.student_key} · ${summary.period_label} 성장 기록`) },
        },
        children: [
          { object: "block", type: "heading_2", heading_2: { rich_text: notionRichText("교사 확정 문장") } },
          ...notionParagraphs(summary.teacher_final_text),
          { object: "block", type: "heading_2", heading_2: { rich_text: notionRichText("근거 기반 초안") } },
          ...notionParagraphs(summary.draft_text),
          { object: "block", type: "paragraph", paragraph: { rich_text: notionRichText(`평가 근거 ${summary.included_evaluation_ids.length}건 · 대시보드에서 ${new Date().toLocaleString("ko-KR")} 내보냄`) } },
        ],
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { id?: string; url?: string; message?: string } | null;
    if (!response.ok) throw new Error(payload?.message || `Notion API 요청 실패: ${response.status}`);
    await supabase.from("export_audits").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      metadata: { parent_page_id: parentPageId, notion_page_id: payload?.id ?? null, notion_page_url: payload?.url ?? null },
    }).eq("id", audit.id).eq("owner_id", user.id);
  } catch (error) {
    exportError = error instanceof Error ? error.message : "Notion 페이지 저장에 실패했습니다.";
    await supabase.from("export_audits").update({
      status: "failed",
      error_message: exportError.slice(0, 500),
      completed_at: new Date().toISOString(),
    }).eq("id", audit.id).eq("owner_id", user.id);
  }

  if (exportError) {
    redirect(`/dashboard/growth/summaries/${summaryId}?message=${encodeURIComponent(exportError)}`);
  }
  revalidatePath(`/dashboard/growth/summaries/${summaryId}`);
  redirect(`/dashboard/growth/summaries/${summaryId}?notice=${encodeURIComponent("교사 확정 성장 기록을 Notion 새 페이지로 저장했습니다.")}`);
}
