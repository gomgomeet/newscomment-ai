"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import {
  buildEvidenceBasedActivityRecord,
  parseStudentRecordEvidence,
  serializeStudentRecordEvidence,
  type ActivitySpecialRecord,
} from "@/lib/growth/student-records";
import { extractNotionDatabaseId } from "@/lib/notion/import-comments";
import {
  EvaluationNotionConnectionError,
  getEvaluationNotionAccessToken,
  getEvaluationNotionConnectionStatus,
} from "@/lib/notion/teacher-connection";
import {
  generateStudentRecordWithOpenAI,
  type StudentRecordActivityInput,
} from "@/lib/openai/generate-student-record";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function criterionKey(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

function sameIds(left: string[], right: string[]) {
  const sortedRight = right.toSorted();
  return left.length === right.length && left.toSorted().every((id, index) => id === sortedRight[index]);
}

function fallbackSubjectRecord(subject: string, records: ActivitySpecialRecord[]) {
  if (records.length === 1) return records[0].recordText;
  const evidence = records
    .map((record) => {
      const prefix = `${record.activityTitle}에서 `;
      return record.recordText.startsWith(prefix) ? record.recordText.slice(prefix.length) : record.recordText;
    })
    .join(" 또한, ");
  return `${subject} 교과의 여러 수업과 평가에서 ${evidence}`.slice(0, 500);
}

function studentAnswer(comment: { content: string; metadata: unknown } | undefined) {
  if (!comment) return "";
  const metadata = comment.metadata;
  if (
    metadata
    && typeof metadata === "object"
    && !Array.isArray(metadata)
    && "source" in metadata
    && metadata.source === "assessment-survey"
    && "answer" in metadata
    && typeof metadata.answer === "string"
  ) {
    return metadata.answer.trim();
  }
  return comment.content.trim();
}

export async function openStudentSummary(formData: FormData) {
  const studentKey = readText(formData, "student_key");
  const requestedSubject = readText(formData, "subject");
  const periodLabel = readText(formData, "period_label") || `${new Date().getFullYear()}학년도`;
  const regenerate = readText(formData, "regenerate") === "true";
  if (!studentKey) redirect("/dashboard/growth?message=학생 식별자를 찾을 수 없습니다.");

  const { supabase, user } = await requireUser();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, title, rubric_id")
    .eq("owner_id", user.id);
  if (projectsError) redirect(`/dashboard/growth?message=${encodeURIComponent(projectsError.message)}`);
  const projectIds = (projects ?? []).map((project) => project.id);
  if (!projectIds.length) redirect("/dashboard/growth?message=평가활동이 없습니다.");

  const { data: preps, error: prepsError } = await supabase
    .from("assessment_preps")
    .select("project_id, grade_level, subject, achievement_standards")
    .eq("owner_id", user.id)
    .in("project_id", projectIds);
  if (prepsError) redirect(`/dashboard/growth?message=${encodeURIComponent(prepsError.message)}`);
  const prepByProjectId = new Map((preps ?? []).map((prep) => [prep.project_id, prep]));
  const subjectForProject = (projectId: string) => prepByProjectId.get(projectId)?.subject.trim() || "교과 미설정";
  const subject = requestedSubject || Array.from(new Set(projectIds.map(subjectForProject))).toSorted((a, b) => a.localeCompare(b, "ko"))[0];
  if (!subject) redirect("/dashboard/growth?message=세특을 작성할 과목을 찾지 못했습니다.");
  const subjectProjectIds = projectIds.filter((projectId) => subjectForProject(projectId) === subject);
  if (!subjectProjectIds.length) redirect("/dashboard/growth?message=선택한 과목의 평가활동을 찾지 못했습니다.");

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("id, project_id, student_name, content, metadata")
    .in("project_id", subjectProjectIds)
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
  const rubricIds = Array.from(new Set((projects ?? [])
    .filter((project) => subjectProjectIds.includes(project.id))
    .map((project) => project.rubric_id)
    .filter(Boolean))) as string[];
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
  const commentById = new Map((comments ?? []).map((comment) => [comment.id, comment]));
  const activityEvaluations = new Map<string, typeof evaluations>();
  for (const evaluation of evaluations) {
    const rows = activityEvaluations.get(evaluation.project_id) ?? [];
    rows.push(evaluation);
    activityEvaluations.set(evaluation.project_id, rows);
  }

  const activityInputs: StudentRecordActivityInput[] = Array.from(activityEvaluations.entries()).map(([projectId, rows]) => {
    const prep = prepByProjectId.get(projectId);
    return {
      projectId,
      activityTitle: projectById.get(projectId)?.title ?? "평가활동",
      subject,
      targetGrade: prep?.grade_level || null,
      achievementStandards: prep?.achievement_standards ?? null,
      evaluationIds: rows.map((evaluation) => evaluation.id),
      answers: rows.flatMap((evaluation) => {
        const content = studentAnswer(commentById.get(evaluation.comment_id));
        return content ? [content] : [];
      }),
      teacherFeedback: rows.flatMap((evaluation) => evaluation.feedback?.trim() ? [evaluation.feedback.trim()] : []),
      criterionEvidence: rows.flatMap((evaluation) =>
        (scoresByEvaluation.get(evaluation.id) ?? []).flatMap((score) => {
          const criterion = criterionById.get(score.criterion_id);
          return criterion ? [{ criterion: criterion.label, rationale: score.rationale }] : [];
        }),
      ),
    };
  });

  const { data: existingSummaries, error: existingError } = await supabase
    .from("student_term_summaries")
    .select("*")
    .eq("owner_id", user.id)
    .eq("student_key", studentKey)
    .eq("period_label", periodLabel)
    .order("updated_at", { ascending: false });
  if (existingError) redirect(`/dashboard/growth?message=${encodeURIComponent(existingError.message)}`);
  const existingSummary = existingSummaries?.find((summary) => parseStudentRecordEvidence(summary.evidence)?.subject === subject) ?? null;
  if (
    existingSummary &&
    !regenerate &&
    sameIds(existingSummary.included_evaluation_ids, evaluationIds) &&
    parseStudentRecordEvidence(existingSummary.evidence)?.subject === subject
  ) {
    redirect(`/dashboard/growth/summaries/${existingSummary.id}`);
  }

  let activityRecords: ActivitySpecialRecord[];
  let representativeProjectId: string | null;
  let representativeReason: string;
  let summaryKind: "one-time" | "cumulative";
  let draftText: string;
  let generationNotice = `${subject} 과목의 활동 근거와 통합 세특 AI 초안을 만들었습니다.`;

  try {
    const generated = await generateStudentRecordWithOpenAI({ studentKey, periodLabel, subject, activities: activityInputs });
    activityRecords = activityInputs.map((activity) => {
      const generatedRecord = generated.activityRecords.find((record) => record.projectId === activity.projectId);
      return {
        projectId: activity.projectId,
        activityTitle: activity.activityTitle,
        subject,
        evaluationIds: activity.evaluationIds,
        recordText: generatedRecord?.recordText || buildEvidenceBasedActivityRecord({
          activityTitle: activity.activityTitle,
          answerTexts: activity.answers,
          criterionLabels: activity.criterionEvidence.map((item) => item.criterion),
        }),
        evidenceSummary: generatedRecord?.evidenceSummary || `교사 확정 평가 ${activity.evaluationIds.length}건`,
        selectedAsRepresentative: generated.representativeProjectId === activity.projectId,
        generatedBy: generatedRecord ? "ai-draft" : "evidence-draft",
      };
    });
    representativeProjectId = generated.representativeProjectId;
    representativeReason = generated.representativeReason;
    summaryKind = generated.summaryKind;
    draftText = generated.cumulativeRecord;
  } catch {
    activityRecords = activityInputs.map((activity) => ({
      projectId: activity.projectId,
      activityTitle: activity.activityTitle,
      subject,
      evaluationIds: activity.evaluationIds,
      recordText: buildEvidenceBasedActivityRecord({
        activityTitle: activity.activityTitle,
        answerTexts: activity.answers,
        criterionLabels: activity.criterionEvidence.map((item) => item.criterion),
      }),
      evidenceSummary: `교사 확정 평가 ${activity.evaluationIds.length}건 · 직접 답안 근거`,
      selectedAsRepresentative: false,
      generatedBy: "evidence-draft",
    }));
    const representative = activityRecords.toSorted((a, b) => b.recordText.length - a.recordText.length)[0];
    representativeProjectId = representative?.projectId ?? null;
    representativeReason = "직접 답안 근거가 가장 구체적인 활동을 기본 대표 기록으로 선택함.";
    summaryKind = activityRecords.length >= 2 ? "cumulative" : "one-time";
    activityRecords = activityRecords.map((record) => ({
      ...record,
      selectedAsRepresentative: record.projectId === representativeProjectId,
    }));
    draftText = fallbackSubjectRecord(subject, activityRecords);
    generationNotice = `AI 연결을 사용할 수 없어 ${subject} 과목의 교사 확정 근거로 기본 세특 초안을 만들었습니다.`;
  }

  const evidence = serializeStudentRecordEvidence({
    subject,
    gradeLevel: activityInputs.find((activity) => activity.targetGrade)?.targetGrade ?? "",
    activityRecords,
    representativeProjectId,
    representativeReason,
    summaryKind,
    promptVersion: "",
    projectIds: Array.from(activityEvaluations.keys()),
    commentIds: comments?.map((comment) => comment.id) ?? [],
    evaluationIds,
  });
  const summaryValues = {
    period_label: periodLabel,
    included_evaluation_ids: evaluationIds,
    evidence,
    draft_text: draftText,
    teacher_final_text: draftText,
    status: "draft" as const,
    confirmed_at: null,
  };
  const summaryQuery = existingSummary && existingSummary.status === "draft"
    ? supabase.from("student_term_summaries").update(summaryValues).eq("id", existingSummary.id).eq("owner_id", user.id).select("id").single()
    : supabase.from("student_term_summaries").insert({
      owner_id: user.id,
      student_key: studentKey,
      ...summaryValues,
    }).select("id").single();
  const { data: summary, error: summaryError } = await summaryQuery;
  if (summaryError || !summary) redirect(`/dashboard/growth?message=${encodeURIComponent(summaryError?.message || "종합 기록을 만들지 못했습니다.")}`);
  revalidatePath("/dashboard/growth");
  redirect(`/dashboard/growth/summaries/${summary.id}?notice=${encodeURIComponent(generationNotice)}`);
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
  redirect(`/dashboard/growth/summaries/${summaryId}?notice=${encodeURIComponent(confirm ? "과목별 세특을 교사 최종 문장으로 확정했습니다." : "과목별 세특 초안을 저장했습니다.")}`);
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
  const recordEvidence = parseStudentRecordEvidence(summary.evidence);
  const subject = recordEvidence?.subject || "교과";
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
          title: { title: notionRichText(`${summary.student_key} · ${subject} · ${summary.period_label} 세특`) },
        },
        children: [
          { object: "block", type: "heading_2", heading_2: { rich_text: notionRichText("교사 확정 문장") } },
          ...notionParagraphs(summary.teacher_final_text),
          { object: "block", type: "heading_2", heading_2: { rich_text: notionRichText(`${subject} 통합 초안`) } },
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
