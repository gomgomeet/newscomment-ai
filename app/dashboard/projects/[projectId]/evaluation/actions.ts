"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import type { Json } from "@/lib/db/types";
import {
  buildNotionCommentMetadata,
  classifyNotionRows,
} from "@/lib/notion/dedupe";
import { NotionImportError, importCommentsFromNotionDatabase } from "@/lib/notion/import-comments";
import { readNotionSourceDefaults } from "@/lib/notion/project-source";
import {
  EvaluationNotionConnectionError,
  getEvaluationNotionAccessToken,
} from "@/lib/notion/teacher-connection";
import { evaluateCommentWithOpenAI } from "@/lib/openai/evaluate-comment";

const MAX_COMMENT_LENGTH = 5000;
const MAX_BULK_TEXT_LENGTH = 250000;
const MAX_SOURCE_TEXT_LENGTH = 500000;
const MAX_IMPORTED_COMMENTS = 200;

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readScore(formData: FormData, key: string) {
  const rawValue = readText(formData, key);
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function requireOwnedProject(projectId: string) {
  const { supabase, user } = await requireUser();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (error || !project) {
    redirect("/dashboard/projects?message=접근할 수 없는 수업활동입니다.");
  }

  return { supabase, user, project };
}

export async function addComment(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const studentName = readText(formData, "student_name");
  const content = readText(formData, "content");

  if (!projectId || !content) {
    redirect(`/dashboard/projects/${projectId}?message=댓글 내용을 입력해 주세요.`);
  }

  if (content.length > MAX_COMMENT_LENGTH) {
    redirect(`/dashboard/projects/${projectId}?message=댓글은 ${MAX_COMMENT_LENGTH}자 이하로 입력해 주세요.`);
  }

  const { supabase } = await requireOwnedProject(projectId);
  const { error } = await supabase.from("comments").insert({
    project_id: projectId,
    student_name: studentName || null,
    content,
    metadata: { source: "manual" },
  });

  if (error) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}`);
}

function parseBulkCommentLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const tabIndex = trimmed.indexOf("\t");
  if (tabIndex > -1) {
    return {
      student_name: trimmed.slice(0, tabIndex).trim() || null,
      content: trimmed.slice(tabIndex + 1).trim(),
    };
  }

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > -1) {
    return {
      student_name: trimmed.slice(0, commaIndex).trim() || null,
      content: trimmed.slice(commaIndex + 1).trim(),
    };
  }

  return {
    student_name: null,
    content: trimmed,
  };
}

function parseCommentObject(value: unknown) {
  if (typeof value === "string") {
    return parseBulkCommentLine(value);
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const studentName = record.student_name ?? record.studentName ?? record.student ?? record.name;
  const content = record.content ?? record.comment ?? record.text ?? record.body;

  if (typeof content !== "string" || !content.trim()) {
    return null;
  }

  return {
    student_name: typeof studentName === "string" && studentName.trim() ? studentName.trim() : null,
    content: content.trim(),
  };
}

function parseDelimitedComments(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .filter((line, index) => {
      if (index !== 0) {
        return true;
      }

      const normalized = line.toLowerCase().replace(/\s/g, "");
      return ![
        "student_name,content",
        "studentname,content",
        "student,comment",
        "name,comment",
        "학생명,댓글내용",
        "학생명,댓글",
      ].includes(normalized);
    })
    .map(parseBulkCommentLine)
    .filter((row): row is { student_name: string | null; content: string } => Boolean(row?.content));
}

function normalizeImportedRows(rows: { student_name: string | null; content: string }[]) {
  return rows
    .map((row) => ({
      student_name: row.student_name,
      content: row.content.slice(0, MAX_COMMENT_LENGTH),
    }))
    .filter((row) => row.content.trim().length > 0)
    .slice(0, MAX_IMPORTED_COMMENTS);
}

function parseJsonComments(rawText: string) {
  const parsed = JSON.parse(rawText) as unknown;
  const candidates =
    Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" &&
          parsed !== null &&
          "comments" in parsed &&
          Array.isArray((parsed as { comments: unknown }).comments)
        ? (parsed as { comments: unknown[] }).comments
        : [];

  return candidates
    .map(parseCommentObject)
    .filter((row): row is { student_name: string | null; content: string } => Boolean(row?.content));
}

function parseSourceComments(rawText: string, contentType: string | null) {
  const trimmedText = rawText.trim();

  if (!trimmedText) {
    return [];
  }

  const looksLikeJson =
    contentType?.includes("json") || trimmedText.startsWith("[") || trimmedText.startsWith("{");

  if (looksLikeJson) {
    try {
      const jsonRows = parseJsonComments(trimmedText);
      if (jsonRows.length > 0) {
        return jsonRows;
      }
    } catch {
      return parseDelimitedComments(trimmedText);
    }
  }

  return parseDelimitedComments(trimmedText);
}

export async function importComments(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const bulkContent = readText(formData, "bulk_content");

  if (!projectId || !bulkContent) {
    redirect(`/dashboard/projects/${projectId}?message=가져올 댓글을 입력해 주세요.`);
  }

  if (bulkContent.length > MAX_BULK_TEXT_LENGTH) {
    redirect(`/dashboard/projects/${projectId}?message=붙여넣기 내용이 너무 큽니다. 나눠서 가져와 주세요.`);
  }

  const rows = normalizeImportedRows(
    bulkContent
      .split(/\r?\n/)
      .map(parseBulkCommentLine)
      .filter((row): row is { student_name: string | null; content: string } => Boolean(row?.content)),
  );

  if (rows.length === 0) {
    redirect(`/dashboard/projects/${projectId}?message=저장할 댓글을 찾을 수 없습니다.`);
  }

  const { supabase } = await requireOwnedProject(projectId);
  const { error } = await supabase.from("comments").insert(
    rows.map((row) => ({
      project_id: projectId,
      student_name: row.student_name,
      content: row.content,
      metadata: { source: "bulk-paste" },
    })),
  );

  if (error) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}`);
}

export async function importCommentsFromSource(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const sourceUrlOverride = readText(formData, "source_url");

  if (!projectId) {
    redirect("/dashboard/projects?message=수업활동을 찾을 수 없습니다.");
  }

  const { supabase, project } = await requireOwnedProject(projectId);
  const sourceUrl = sourceUrlOverride || project.source_url;

  if (!sourceUrl) {
    redirect(`/dashboard/projects/${projectId}?message=자동 가져오기에 사용할 소스 URL을 입력해 주세요.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    redirect(`/dashboard/projects/${projectId}?message=소스 URL 형식이 올바르지 않습니다.`);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    redirect(`/dashboard/projects/${projectId}?message=http 또는 https URL만 사용할 수 있습니다.`);
  }

  let response: Response;
  try {
    response = await fetch(parsedUrl, {
      headers: {
        Accept: "application/json,text/csv,text/tab-separated-values,text/plain",
      },
    });
  } catch {
    redirect(`/dashboard/projects/${projectId}?message=소스 URL에서 댓글을 가져오지 못했습니다.`);
  }

  if (!response.ok) {
    redirect(`/dashboard/projects/${projectId}?message=소스 URL 요청 실패: ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("text/html")) {
    redirect(
      `/dashboard/projects/${projectId}?message=${encodeURIComponent(
        "일반 웹페이지 HTML은 자동 가져오기로 처리하지 않습니다. TXT/CSV/TSV/JSON URL을 사용해 주세요.",
      )}`,
    );
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_TEXT_LENGTH) {
    redirect(`/dashboard/projects/${projectId}?message=소스 파일이 너무 큽니다. 작은 파일로 나눠 주세요.`);
  }

  const rawText = await response.text();
  if (rawText.length > MAX_SOURCE_TEXT_LENGTH) {
    redirect(`/dashboard/projects/${projectId}?message=소스 파일이 너무 큽니다. 작은 파일로 나눠 주세요.`);
  }

  const rows = normalizeImportedRows(parseSourceComments(rawText, contentType));

  if (rows.length === 0) {
    redirect(
      `/dashboard/projects/${projectId}?message=${encodeURIComponent(
        "가져올 댓글을 찾지 못했습니다. TXT/CSV/TSV/JSON 형식의 공개 URL을 사용해 주세요.",
      )}`,
    );
  }

  const { error } = await supabase.from("comments").insert(
    rows.map((row) => ({
      project_id: projectId,
      student_name: row.student_name,
      content: row.content,
      metadata: {
        source: "source-url",
        source_url: sourceUrl,
      },
    })),
  );

  if (error) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}`);
}

export async function importCommentsFromNotion(formData: FormData) {
  const projectId = readText(formData, "project_id");

  if (!projectId) {
    redirect("/dashboard/projects?message=수업활동을 찾을 수 없습니다.");
  }

  const { supabase, user, project } = await requireOwnedProject(projectId);
  const saved = readNotionSourceDefaults(project.notion_source);

  const databaseInput = readText(formData, "notion_database") || saved.database_url;
  const contentModeInput = readText(formData, "content_mode") || saved.content_mode;
  const contentMode = contentModeInput === "page_body" ? "page_body" : "property";
  const contentProperty = readText(formData, "content_property") || saved.content_property;
  const studentProperty = readText(formData, "student_property");
  const topicProperty = readText(formData, "topic_property");

  if (!databaseInput) {
    redirect(`/dashboard/projects/${projectId}?message=Notion 데이터베이스 URL을 입력해 주세요.`);
  }

  if (contentMode === "property" && !contentProperty) {
    redirect(`/dashboard/projects/${projectId}?message=결과물 내용이 들어 있는 Notion 속성 이름을 입력해 주세요.`);
  }

  let result;
  try {
    const apiKey = await getEvaluationNotionAccessToken({ supabase, userId: user.id });
    result = await importCommentsFromNotionDatabase({
      apiKey,
      databaseInput,
      contentMode,
      contentProperty,
      studentProperty,
      topicProperty,
      maxRows: MAX_IMPORTED_COMMENTS,
      maxContentLength: MAX_COMMENT_LENGTH,
    });
  } catch (error) {
    const detail =
      error instanceof NotionImportError && error.availableProperties.length > 0
        ? ` 사용 가능한 속성: ${error.availableProperties.join(", ")}`
        : "";
    const message =
      error instanceof NotionImportError || error instanceof EvaluationNotionConnectionError
        ? `${error.message}${detail}`
        : "Notion 댓글 가져오기에 실패했습니다.";

    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(message)}`);
  }

  const { data: existingComments, error: existingError } = await supabase
    .from("comments")
    .select("id, metadata")
    .eq("project_id", projectId);

  if (existingError) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(existingError.message)}`);
  }

  const classifiedRows = classifyNotionRows(result.rows, existingComments ?? []);
  const rowsToInsert = [
    ...classifiedRows.fresh.map((row) => ({ row, revisionOf: undefined })),
    ...classifiedRows.updated.map(({ row, previousCommentId }) => ({ row, revisionOf: previousCommentId })),
  ];

  await supabase
    .from("projects")
    .update({
      notion_source: {
        database_url: databaseInput,
        database_id: result.databaseId,
        content_mode: contentMode,
        content_property: contentProperty,
        student_property: studentProperty,
        topic_property: topicProperty,
      },
    })
    .eq("id", projectId);

  if (rowsToInsert.length === 0) {
    const skipped = result.rows.length;
    const notice =
      skipped > 0
        ? `이미 가져온 Notion 결과물 ${skipped}개를 건너뛰었습니다. 새 결과물이 없습니다.`
        : "Notion 데이터베이스에서 읽을 결과물을 찾지 못했습니다. 결과물 위치와 속성 이름을 확인해 주세요.";

    revalidatePath(`/dashboard/projects/${projectId}`);
    redirect(`/dashboard/projects/${projectId}?notice=${encodeURIComponent(notice)}`);
  }

  const { error: insertError } = await supabase.from("comments").insert(
    rowsToInsert.map(({ row, revisionOf }) => ({
      project_id: projectId,
      student_name: row.student_name,
      content: row.content,
      metadata: buildNotionCommentMetadata(row, result.databaseId, { revisionOf }),
    })),
  );

  if (insertError) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(insertError.message)}`);
  }

  const skipped = classifiedRows.unchanged.length;
  const parts = [`Notion에서 새 결과물 ${classifiedRows.fresh.length}개를 읽어왔습니다.`];
  if (classifiedRows.updated.length > 0) {
    parts.push(`수정본 ${classifiedRows.updated.length}개는 기존 원문을 보존하고 새 근거 버전으로 추가했습니다.`);
  }
  if (skipped > 0) {
    parts.push(`중복 ${skipped}개는 건너뛰었습니다.`);
  }
  if (result.truncated) {
    parts.push(`한 번에 최대 ${MAX_IMPORTED_COMMENTS}개까지 가져옵니다.`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}?notice=${encodeURIComponent(parts.join(" "))}`);
}

export async function updateComment(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const commentId = readText(formData, "comment_id");
  const studentName = readText(formData, "student_name");
  const content = readText(formData, "content");

  if (!projectId || !commentId || !content) {
    redirect(`/dashboard/projects/${projectId}?message=댓글 내용을 입력해 주세요.`);
  }

  if (content.length > MAX_COMMENT_LENGTH) {
    redirect(`/dashboard/projects/${projectId}?message=댓글은 ${MAX_COMMENT_LENGTH}자 이하로 입력해 주세요.`);
  }

  const { supabase } = await requireOwnedProject(projectId);
  const { error } = await supabase
    .from("comments")
    .update({
      student_name: studentName || null,
      content,
    })
    .eq("id", commentId)
    .eq("project_id", projectId);

  if (error) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}`);
}

export async function saveEvaluation(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const commentId = readText(formData, "comment_id");
  const feedback = readText(formData, "feedback");
  const evaluationForward = readText(formData, "evaluation_forward");
  const changeReason = readText(formData, "change_reason");

  if (!projectId || !commentId) {
    redirect(`/dashboard/projects/${projectId}?message=평가할 댓글을 찾을 수 없습니다.`);
  }

  const { supabase, user, project } = await requireOwnedProject(projectId);

  if (!project.rubric_id) {
    redirect(`/dashboard/projects/${projectId}?message=수업활동에 루브릭을 먼저 연결해 주세요.`);
  }

  const { data: activePrep, error: activePrepError } = await supabase
    .from("assessment_preps")
    .select("id, active_version_id")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (activePrepError || !activePrep?.active_version_id) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent("교사 평가를 확정하려면 평가 준비 프렙을 먼저 6/6로 활성화해 주세요.")}`);
  }

  const { data: comment, error: commentError } = await supabase
    .from("comments")
    .select("id")
    .eq("id", commentId)
    .eq("project_id", projectId)
    .single();

  if (commentError || !comment) {
    redirect(`/dashboard/projects/${projectId}?message=접근할 수 없는 댓글입니다.`);
  }

  const { data: criteria, error: criteriaError } = await supabase
    .from("rubric_criteria")
    .select("*")
    .eq("rubric_id", project.rubric_id)
    .order("sort_order", { ascending: true });

  if (criteriaError || !criteria || criteria.length === 0) {
    redirect(`/dashboard/projects/${projectId}?message=루브릭 기준을 먼저 추가해 주세요.`);
  }

  const scoreRows = criteria.map((criterion) => {
    const score = readScore(formData, `score_${criterion.id}`);
    const rationale = readText(formData, `rationale_${criterion.id}`);

    if (score === null || score > criterion.max_score) {
      redirect(
        `/dashboard/projects/${projectId}?message=${encodeURIComponent(
          `${criterion.label} 점수는 0점 이상 ${criterion.max_score}점 이하로 입력해 주세요.`,
        )}`,
      );
    }

    return {
      criterion_id: criterion.id,
      score,
      rationale: rationale || null,
    };
  });

  const totalScore = scoreRows.reduce((sum, row) => sum + row.score, 0);
  const { data: existingEvaluation } = await supabase
    .from("evaluations")
    .select("id, revision")
    .eq("comment_id", commentId)
    .eq("evaluator_id", user.id)
    .eq("source", "teacher-manual")
    .maybeSingle();
  const revisionNumber = (existingEvaluation?.revision ?? 0) + 1;
  const { data: aiDraft } = await supabase
    .from("evaluations")
    .select("review_reasons")
    .eq("comment_id", commentId)
    .eq("evaluator_id", user.id)
    .eq("source", "ai-draft")
    .maybeSingle();
  const { data: evaluation, error: evaluationError } = await supabase
    .from("evaluations")
    .upsert(
      {
        project_id: projectId,
        comment_id: commentId,
        evaluator_id: user.id,
        assessment_prep_version_id: activePrep.active_version_id,
        source: "teacher-manual",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        revision: revisionNumber,
        change_reason: changeReason || null,
        evaluation_forward: evaluationForward || null,
        review_reasons: aiDraft?.review_reasons ?? [],
        model_name: "teacher-manual",
        total_score: totalScore,
        feedback: feedback || null,
        raw_output: { source: "teacher-manual" },
      },
      { onConflict: "comment_id,evaluator_id,source" },
    )
    .select("id")
    .single();

  if (evaluationError || !evaluation) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(evaluationError?.message ?? "평가 저장에 실패했습니다.")}`);
  }

  const { error: scoresError } = await supabase.from("evaluation_scores").upsert(
    scoreRows.map((row) => ({
      evaluation_id: evaluation.id,
      criterion_id: row.criterion_id,
      score: row.score,
      rationale: row.rationale,
    })),
    { onConflict: "evaluation_id,criterion_id" },
  );

  if (scoresError) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(scoresError.message)}`);
  }

  const { error: revisionError } = await supabase.from("evaluation_revisions").insert({
    evaluation_id: evaluation.id,
    project_id: projectId,
    comment_id: commentId,
    revision_number: revisionNumber,
    total_score: totalScore,
    feedback: feedback || null,
    evaluation_forward: evaluationForward || null,
    review_reasons: aiDraft?.review_reasons ?? [],
    score_snapshot: scoreRows,
    change_reason: changeReason || null,
    created_by: user.id,
  });

  if (revisionError) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(revisionError.message)}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/compare");
  revalidatePath("/dashboard/growth");
  redirect(`/dashboard/projects/${projectId}`);
}

export async function generateAiEvaluation(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const commentId = readText(formData, "comment_id");
  const forceRegenerate = readText(formData, "force_ai") === "true";

  if (!projectId || !commentId) {
    redirect(`/dashboard/projects/${projectId}?message=AI 평가를 생성할 댓글을 찾을 수 없습니다.`);
  }

  const { supabase, user, project } = await requireOwnedProject(projectId);

  if (!project.rubric_id) {
    redirect(`/dashboard/projects/${projectId}?message=AI 평가를 생성하려면 수업활동에 루브릭을 연결해 주세요.`);
  }

  const { data: activePrep, error: activePrepError } = await supabase
    .from("assessment_preps")
    .select("id, active_version_id, evaluation_goal, achievement_standards")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (activePrepError || !activePrep?.active_version_id) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent("AI 초안을 만들기 전에 평가 준비 프렙을 6/6로 활성화해 주세요.")}`);
  }

  const { data: existingAiDraft } = await supabase
    .from("evaluations")
    .select("id, assessment_prep_version_id")
    .eq("comment_id", commentId)
    .eq("evaluator_id", user.id)
    .eq("source", "ai-draft")
    .maybeSingle();

  if (
    existingAiDraft?.assessment_prep_version_id === activePrep.active_version_id
    && !forceRegenerate
  ) {
    redirect(`/dashboard/projects/${projectId}?notice=${encodeURIComponent("같은 결과물과 평가 준비 버전의 AI 초안이 이미 있습니다. 다시 생성하려면 ‘AI 초안 다시 생성’을 사용하세요.")}`);
  }

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("id, title")
    .eq("id", project.rubric_id)
    .eq("owner_id", user.id)
    .single();

  if (rubricError || !rubric) {
    redirect(`/dashboard/projects/${projectId}?message=접근할 수 없는 루브릭입니다.`);
  }

  const { data: comment, error: commentError } = await supabase
    .from("comments")
    .select("*")
    .eq("id", commentId)
    .eq("project_id", projectId)
    .single();

  if (commentError || !comment) {
    redirect(`/dashboard/projects/${projectId}?message=접근할 수 없는 댓글입니다.`);
  }

  const { data: criteria, error: criteriaError } = await supabase
    .from("rubric_criteria")
    .select("*")
    .eq("rubric_id", rubric.id)
    .order("sort_order", { ascending: true });

  if (criteriaError || !criteria || criteria.length === 0) {
    redirect(`/dashboard/projects/${projectId}?message=AI 평가를 생성하려면 루브릭 기준을 먼저 추가해 주세요.`);
  }

  let aiResult;
  try {
    aiResult = await evaluateCommentWithOpenAI({
      projectTitle: project.title,
      rubricTitle: rubric.title,
      comment: comment.content,
      criteria,
      evaluationGoal: activePrep.evaluation_goal,
      achievementStandards: activePrep.achievement_standards,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 평가 생성에 실패했습니다.";
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(message)}`);
  }

  const aiScoreByCriterion = new Map(aiResult.scores.map((score) => [score.criterion_id, score]));
  const scoreRows = criteria.map((criterion) => {
    const aiScore = aiScoreByCriterion.get(criterion.id);
    const normalizedScore = Math.min(Math.max(aiScore?.score ?? 0, 0), criterion.max_score);

    return {
      criterion_id: criterion.id,
      score: normalizedScore,
      rationale: aiScore
        ? `[원문 근거] ${aiScore.evidence_quote || "근거 없음"}\n[판정 이유] ${aiScore.rationale}`
        : "AI 평가 근거가 비어 있습니다.",
    };
  });
  const totalScore = scoreRows.reduce((sum, row) => sum + row.score, 0);
  const rawOutput = JSON.parse(JSON.stringify(aiResult.raw)) as Json;
  const reviewReasons = [...aiResult.review_reasons];
  if (!comment.student_name && !reviewReasons.includes("학생 식별자 누락")) {
    reviewReasons.push("학생 식별자 누락");
  }

  const { data: evaluation, error: evaluationError } = await supabase
    .from("evaluations")
    .upsert(
      {
        project_id: projectId,
        comment_id: commentId,
        evaluator_id: user.id,
        assessment_prep_version_id: activePrep.active_version_id,
        source: "ai-draft",
        status: "draft",
        confidence: aiResult.confidence,
        review_reasons: reviewReasons,
        evaluation_forward: aiResult.evaluation_forward,
        confirmed_at: null,
        model_name: aiResult.model,
        total_score: totalScore,
        feedback: aiResult.feedback,
        raw_output: {
          source: "ai-draft",
          result: rawOutput,
          prompt_version: "evidence-first-v1",
          active_prep_version_id: activePrep.active_version_id,
        },
      },
      { onConflict: "comment_id,evaluator_id,source" },
    )
    .select("id")
    .single();

  if (evaluationError || !evaluation) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(evaluationError?.message ?? "AI 평가 저장에 실패했습니다.")}`);
  }

  const { error: scoresError } = await supabase.from("evaluation_scores").upsert(
    scoreRows.map((row) => ({
      evaluation_id: evaluation.id,
      criterion_id: row.criterion_id,
      score: row.score,
      rationale: row.rationale,
    })),
    { onConflict: "evaluation_id,criterion_id" },
  );

  if (scoresError) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(scoresError.message)}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/compare");
  redirect(`/dashboard/projects/${projectId}`);
}

export async function generateProjectAiDrafts(formData: FormData) {
  const projectId = readText(formData, "project_id");
  if (!projectId) redirect("/dashboard/projects?message=수업활동을 찾을 수 없습니다.");

  const { supabase, user, project } = await requireOwnedProject(projectId);
  if (!project.rubric_id) {
    redirect(`/dashboard/projects/${projectId}?message=일괄 AI 평가를 실행하려면 루브릭을 연결해 주세요.`);
  }

  const [{ data: activePrep }, { data: rubric }, { data: criteria }, { data: comments }, { data: existingDrafts }] = await Promise.all([
    supabase
      .from("assessment_preps")
      .select("active_version_id, evaluation_goal, achievement_standards")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("rubrics").select("id, title").eq("id", project.rubric_id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("rubric_criteria").select("*").eq("rubric_id", project.rubric_id).order("sort_order"),
    supabase.from("comments").select("*").eq("project_id", projectId).order("created_at"),
    supabase
      .from("evaluations")
      .select("comment_id, assessment_prep_version_id")
      .eq("project_id", projectId)
      .eq("evaluator_id", user.id)
      .eq("source", "ai-draft"),
  ]);

  if (!activePrep?.active_version_id) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent("AI 초안을 만들기 전에 평가 준비 프렙을 6/6로 활성화해 주세요.")}`);
  }
  if (!rubric || !criteria?.length) {
    redirect(`/dashboard/projects/${projectId}?message=루브릭 평가 기준을 준비해 주세요.`);
  }

  const completedForVersion = new Set(
    (existingDrafts ?? [])
      .filter((draft) => draft.assessment_prep_version_id === activePrep.active_version_id)
      .map((draft) => draft.comment_id),
  );
  const targets = (comments ?? []).filter((comment) => !completedForVersion.has(comment.id)).slice(0, 20);

  if (targets.length === 0) {
    redirect(`/dashboard/projects/${projectId}?notice=${encodeURIComponent("현재 평가 준비 버전으로 만들 AI 초안이 남아 있지 않습니다.")}`);
  }

  let completed = 0;
  let failed = 0;
  for (const comment of targets) {
    try {
      const aiResult = await evaluateCommentWithOpenAI({
        projectTitle: project.title,
        rubricTitle: rubric.title,
        comment: comment.content,
        criteria,
        evaluationGoal: activePrep.evaluation_goal,
        achievementStandards: activePrep.achievement_standards,
      });
      const aiScoreByCriterion = new Map(aiResult.scores.map((score) => [score.criterion_id, score]));
      const scoreRows = criteria.map((criterion) => {
        const aiScore = aiScoreByCriterion.get(criterion.id);
        return {
          criterion_id: criterion.id,
          score: Math.min(Math.max(aiScore?.score ?? 0, 0), criterion.max_score),
          rationale: aiScore
            ? `[원문 근거] ${aiScore.evidence_quote || "근거 없음"}\n[판정 이유] ${aiScore.rationale}`
            : "AI 평가 근거가 비어 있습니다.",
        };
      });
      const reviewReasons = [...aiResult.review_reasons];
      if (!comment.student_name && !reviewReasons.includes("학생 식별자 누락")) reviewReasons.push("학생 식별자 누락");
      const totalScore = scoreRows.reduce((sum, score) => sum + score.score, 0);
      const { data: evaluation, error: evaluationError } = await supabase
        .from("evaluations")
        .upsert({
          project_id: projectId,
          comment_id: comment.id,
          evaluator_id: user.id,
          assessment_prep_version_id: activePrep.active_version_id,
          source: "ai-draft",
          status: "draft",
          model_name: aiResult.model,
          total_score: totalScore,
          feedback: aiResult.feedback,
          confidence: aiResult.confidence,
          review_reasons: reviewReasons,
          evaluation_forward: aiResult.evaluation_forward,
          raw_output: {
            source: "ai-draft",
            result: JSON.parse(JSON.stringify(aiResult.raw)) as Json,
            prompt_version: "evidence-first-v1",
            active_prep_version_id: activePrep.active_version_id,
          },
        }, { onConflict: "comment_id,evaluator_id,source" })
        .select("id")
        .single();
      if (evaluationError || !evaluation) throw new Error(evaluationError?.message || "AI 초안 저장 실패");
      const { error: scoresError } = await supabase.from("evaluation_scores").upsert(
        scoreRows.map((score) => ({ evaluation_id: evaluation.id, ...score })),
        { onConflict: "evaluation_id,criterion_id" },
      );
      if (scoresError) throw new Error(scoresError.message);
      completed += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/compare");
  const notice = `AI 초안 ${completed}개를 만들었습니다.${failed ? ` 개별 실패 ${failed}개는 다시 실행할 수 있습니다.` : ""}`;
  redirect(`/dashboard/projects/${projectId}?notice=${encodeURIComponent(notice)}`);
}
