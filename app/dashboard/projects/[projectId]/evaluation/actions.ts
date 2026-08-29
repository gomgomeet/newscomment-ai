"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require-user";
import type { Database, Json } from "@/lib/db/types";
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
import { readAssessmentSurveyConfig } from "@/lib/evaluation/assessment-survey";
import {
  AI_EVALUATION_PROMPT_VERSION,
  evaluateCommentWithOpenAI,
  type RubricScoreLevels,
} from "@/lib/openai/evaluate-comment";

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

function asJsonRecord(value: Json | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

function safeAiEvaluationErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  if (/incorrect api key|invalid_api_key|api key|unauthorized|status.?401/i.test(detail)) {
    return "AI 자동 채점을 사용할 수 없습니다. 설정에서 OpenAI API 키를 다시 확인해 주세요.";
  }
  if (/quota|billing|insufficient_quota/i.test(detail)) {
    return "AI 사용 한도를 확인해 주세요. 설정한 OpenAI 계정의 결제 또는 사용 한도가 부족합니다.";
  }
  return "AI 평가 초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function projectActionUrl(projectId: string, answerMode: boolean, kind: "message" | "notice", text: string, commentId?: string) {
  const query = new URLSearchParams();
  if (answerMode) query.set("view", "answers");
  query.set(kind, text);
  return `/dashboard/projects/${projectId}?${query.toString()}${commentId ? `#comment-${commentId}` : ""}`;
}

function importReturnUrl(projectId: string, returnTo: string, kind: "message" | "notice", text: string) {
  const query = new URLSearchParams({ [kind]: text });
  return returnTo === "evaluation"
    ? `/dashboard/evaluation?${query.toString()}`
    : `/dashboard/projects/${projectId}?${query.toString()}`;
}

function assessmentContextForComment(projectSource: Json, metadata: Json) {
  const survey = readAssessmentSurveyConfig(projectSource);
  if (
    !survey
    || !metadata
    || typeof metadata !== "object"
    || Array.isArray(metadata)
    || metadata.source !== "assessment-survey"
  ) {
    return {};
  }

  const questionIndex = typeof metadata.question_number === "number"
    ? metadata.question_number - 1
    : 0;

  return {
    assessmentTitle: survey.title,
    assessmentSourceText: survey.sourceText,
    assessmentPrompt: typeof metadata.survey_prompt === "string" && metadata.survey_prompt.trim()
      ? metadata.survey_prompt.trim()
      : survey.prompt,
    targetGrade: typeof metadata.grade_number === "number"
      ? `${metadata.grade_number}학년`
      : undefined,
    teacherGuidance: survey.questionTeacherGuidance[questionIndex] || undefined,
  };
}

function evaluationRubricForComment(
  projectSource: Json,
  metadata: Json,
  criteria: Database["public"]["Tables"]["rubric_criteria"]["Row"][],
) {
  const survey = readAssessmentSurveyConfig(projectSource);
  if (
    !survey
    || !metadata
    || typeof metadata !== "object"
    || Array.isArray(metadata)
    || metadata.source !== "assessment-survey"
    || typeof metadata.question_number !== "number"
  ) {
    return {
      criteria,
      scoreLevels: {} as Record<string, RubricScoreLevels>,
      maxScoreByCriterion: new Map(criteria.map((criterion) => [criterion.id, criterion.max_score])),
      minimumScoreByCriterion: new Map(criteria.map((criterion) => [criterion.id, 0])),
    };
  }

  const questionIndex = metadata.question_number - 1;
  const selectedIds = new Set(survey.questionCriteria[questionIndex] ?? []);
  const selectedCriteria = criteria.filter((criterion) => selectedIds.has(criterion.id));
  if (selectedCriteria.length === 0) {
    return {
      criteria,
      scoreLevels: {} as Record<string, RubricScoreLevels>,
      maxScoreByCriterion: new Map(criteria.map((criterion) => [criterion.id, criterion.max_score])),
      minimumScoreByCriterion: new Map(criteria.map((criterion) => [criterion.id, 0])),
    };
  }

  const savedRubrics = survey.questionRubrics[questionIndex] ?? {};
  const scoreLevels = Object.fromEntries(selectedCriteria.flatMap((criterion) => {
    const levels = savedRubrics[criterion.id];
    return levels ? [[criterion.id, levels]] : [];
  })) as Record<string, RubricScoreLevels>;

  return {
    criteria: selectedCriteria,
    scoreLevels,
    maxScoreByCriterion: new Map(selectedCriteria.map((criterion) => [criterion.id, 4])),
    minimumScoreByCriterion: new Map(selectedCriteria.map((criterion) => [criterion.id, 1])),
  };
}

function evaluationRubricSnapshot(
  evaluationRubric: ReturnType<typeof evaluationRubricForComment>,
) {
  return evaluationRubric.criteria.map((criterion) => ({
    criterion_id: criterion.id,
    label: criterion.label,
    max_score: evaluationRubric.maxScoreByCriterion.get(criterion.id) ?? criterion.max_score,
    score_levels: evaluationRubric.scoreLevels[criterion.id] ?? null,
  }));
}

function usesCurrentAiEvaluationPrompt(rawOutput: Json) {
  return Boolean(
    rawOutput
    && typeof rawOutput === "object"
    && !Array.isArray(rawOutput)
    && rawOutput.prompt_version === AI_EVALUATION_PROMPT_VERSION
  );
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

async function loadActiveEvaluationDesign(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId: string,
) {
  const { data: prep, error: prepError } = await supabase
    .from("assessment_preps")
    .select("id, active_version_id")
    .eq("project_id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (prepError || !prep?.active_version_id) {
    return null;
  }

  const { data: version, error: versionError } = await supabase
    .from("assessment_prep_versions")
    .select("id, rubric_id, snapshot")
    .eq("id", prep.active_version_id)
    .eq("prep_id", prep.id)
    .eq("project_id", projectId)
    .maybeSingle();

  if (versionError || !version?.rubric_id) {
    return null;
  }

  const snapshot = asJsonRecord(version.snapshot);
  const rubricSnapshot = asJsonRecord(snapshot.rubric);

  return {
    versionId: version.id,
    rubricId: version.rubric_id,
    rubricTitle: typeof rubricSnapshot.title === "string" && rubricSnapshot.title.trim()
      ? rubricSnapshot.title.trim()
      : "평가 루브릭",
    evaluationGoal: typeof snapshot.evaluation_goal === "string"
      ? snapshot.evaluation_goal.trim()
      : "",
    achievementStandards: snapshot.achievement_standards ?? [],
  };
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
  const returnTo = readText(formData, "return_to");

  if (!projectId) {
    redirect("/dashboard/evaluation?message=수업활동을 찾을 수 없습니다.");
  }

  const { supabase, user, project } = await requireOwnedProject(projectId);
  const saved = readNotionSourceDefaults(project.notion_source);

  const databaseInput = readText(formData, "notion_database") || saved.database_url;
  const sourcePageUrl = readText(formData, "source_page_url") || saved.source_page_url;
  const responseCollectionUrl = readText(formData, "response_collection_url") || saved.response_collection_url;
  const contentModeInput = readText(formData, "content_mode") || saved.content_mode;
  const contentMode = contentModeInput === "page_body" ? "page_body" : "property";
  const contentProperty = readText(formData, "content_property") || saved.content_property;
  const studentProperty = readText(formData, "student_property");
  const topicProperty = readText(formData, "topic_property");

  if (!databaseInput) {
    redirect(importReturnUrl(projectId, returnTo, "message", "Notion 데이터베이스 URL을 입력해 주세요."));
  }

  if (contentMode === "property" && !contentProperty) {
    redirect(importReturnUrl(projectId, returnTo, "message", "결과물 내용이 들어 있는 Notion 속성 이름을 입력해 주세요."));
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

    redirect(importReturnUrl(projectId, returnTo, "message", message));
  }

  const { data: existingComments, error: existingError } = await supabase
    .from("comments")
    .select("id, metadata")
    .eq("project_id", projectId);

  if (existingError) {
    redirect(importReturnUrl(projectId, returnTo, "message", existingError.message));
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
        source_page_url: sourcePageUrl,
        response_collection_url: responseCollectionUrl,
        database_url: databaseInput,
        database_id: result.databaseId,
        content_mode: contentMode,
        content_property: contentProperty,
        student_property: studentProperty,
        topic_property: topicProperty,
      },
    })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  if (rowsToInsert.length === 0) {
    const skipped = result.rows.length;
    const notice =
      skipped > 0
        ? `이미 가져온 Notion 결과물 ${skipped}개를 건너뛰었습니다. 새 결과물이 없습니다.`
        : "Notion 데이터베이스에서 읽을 결과물을 찾지 못했습니다. 결과물 위치와 속성 이름을 확인해 주세요.";

    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath("/dashboard/evaluation");
    redirect(importReturnUrl(projectId, returnTo, "notice", notice));
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
    redirect(importReturnUrl(projectId, returnTo, "message", insertError.message));
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
  revalidatePath("/dashboard/evaluation");
  redirect(importReturnUrl(projectId, returnTo, "notice", parts.join(" ")));
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
  const answerMode = readText(formData, "return_view") === "answers";

  if (!projectId || !commentId) {
    redirect(`/dashboard/projects/${projectId}?message=평가할 댓글을 찾을 수 없습니다.`);
  }

  const { supabase, user, project } = await requireOwnedProject(projectId);

  const activeDesign = await loadActiveEvaluationDesign(supabase, user.id, projectId);
  if (!activeDesign) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent("교사 평가를 확정하려면 평가 설계를 먼저 확정해 주세요.")}`);
  }

  const { data: comment, error: commentError } = await supabase
    .from("comments")
    .select("id, metadata")
    .eq("id", commentId)
    .eq("project_id", projectId)
    .single();

  if (commentError || !comment) {
    redirect(`/dashboard/projects/${projectId}?message=접근할 수 없는 댓글입니다.`);
  }

  const { data: criteria, error: criteriaError } = await supabase
    .from("rubric_criteria")
    .select("*")
    .eq("rubric_id", activeDesign.rubricId)
    .order("sort_order", { ascending: true });

  if (criteriaError || !criteria || criteria.length === 0) {
    redirect(`/dashboard/projects/${projectId}?message=루브릭 기준을 먼저 추가해 주세요.`);
  }

  const evaluationRubric = evaluationRubricForComment(project.notion_source, comment.metadata, criteria);
  const scoreRows = evaluationRubric.criteria.map((criterion) => {
    const score = readScore(formData, `score_${criterion.id}`);
    const rationale = readText(formData, `rationale_${criterion.id}`);
    const maximumScore = evaluationRubric.maxScoreByCriterion.get(criterion.id) ?? criterion.max_score;
    const minimumScore = evaluationRubric.minimumScoreByCriterion.get(criterion.id) ?? 0;

    if (score === null || score < minimumScore || score > maximumScore) {
      redirect(
        `/dashboard/projects/${projectId}?message=${encodeURIComponent(
          `${criterion.label} 점수는 ${minimumScore}점 이상 ${maximumScore}점 이하로 입력해 주세요.`,
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
        assessment_prep_version_id: activeDesign.versionId,
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
        raw_output: {
          source: "teacher-manual",
          rubric_snapshot: evaluationRubricSnapshot(evaluationRubric),
        },
      },
      { onConflict: "comment_id,evaluator_id,source" },
    )
    .select("id")
    .single();

  if (evaluationError || !evaluation) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(evaluationError?.message ?? "평가 저장에 실패했습니다.")}`);
  }

  const { error: deleteScoresError } = await supabase
    .from("evaluation_scores")
    .delete()
    .eq("evaluation_id", evaluation.id);

  if (deleteScoresError) {
    redirect(`/dashboard/projects/${projectId}?message=${encodeURIComponent(deleteScoresError.message)}`);
  }

  const { error: scoresError } = await supabase.from("evaluation_scores").insert(
    scoreRows.map((row) => ({
      evaluation_id: evaluation.id,
      criterion_id: row.criterion_id,
      score: row.score,
      rationale: row.rationale,
    })),
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
  redirect(projectActionUrl(projectId, answerMode, "notice", "교사 피드백을 저장했습니다.", commentId));
}

export async function generateAiEvaluation(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const commentId = readText(formData, "comment_id");
  const forceRegenerate = readText(formData, "force_ai") === "true";
  const answerMode = readText(formData, "return_view") === "answers";

  if (!projectId || !commentId) {
    redirect(projectActionUrl(projectId, answerMode, "message", "AI 평가를 생성할 답안을 찾을 수 없습니다."));
  }

  const { supabase, user, project } = await requireOwnedProject(projectId);

  const activeDesign = await loadActiveEvaluationDesign(supabase, user.id, projectId);
  if (!activeDesign) {
    redirect(projectActionUrl(projectId, answerMode, "message", "AI 초안을 만들기 전에 평가 설계를 확정해 주세요."));
  }

  const { data: existingAiDraft } = await supabase
    .from("evaluations")
    .select("id, assessment_prep_version_id, raw_output")
    .eq("comment_id", commentId)
    .eq("evaluator_id", user.id)
    .eq("source", "ai-draft")
    .maybeSingle();

  if (
    existingAiDraft?.assessment_prep_version_id === activeDesign.versionId
    && usesCurrentAiEvaluationPrompt(existingAiDraft.raw_output)
    && !forceRegenerate
  ) {
    redirect(projectActionUrl(projectId, answerMode, "notice", "같은 답안의 AI 초안이 이미 있습니다. 다시 생성하려면 ‘AI 초안 다시 생성’을 사용하세요.", commentId));
  }

  const { data: comment, error: commentError } = await supabase
    .from("comments")
    .select("*")
    .eq("id", commentId)
    .eq("project_id", projectId)
    .single();

  if (commentError || !comment) {
    redirect(projectActionUrl(projectId, answerMode, "message", "접근할 수 없는 답안입니다."));
  }

  const { data: criteria, error: criteriaError } = await supabase
    .from("rubric_criteria")
    .select("*")
    .eq("rubric_id", activeDesign.rubricId)
    .order("sort_order", { ascending: true });

  if (criteriaError || !criteria || criteria.length === 0) {
    redirect(projectActionUrl(projectId, answerMode, "message", "AI 평가를 생성하려면 루브릭 기준을 먼저 추가해 주세요.", commentId));
  }

  let aiResult;
  const evaluationRubric = evaluationRubricForComment(project.notion_source, comment.metadata, criteria);
  try {
    aiResult = await evaluateCommentWithOpenAI({
      projectTitle: project.title,
      rubricTitle: activeDesign.rubricTitle,
      comment: comment.content,
      criteria: evaluationRubric.criteria,
      criterionScoreLevels: evaluationRubric.scoreLevels,
      evaluationGoal: activeDesign.evaluationGoal,
      achievementStandards: activeDesign.achievementStandards,
      ...assessmentContextForComment(project.notion_source, comment.metadata),
    });
  } catch (error) {
    redirect(projectActionUrl(projectId, answerMode, "message", safeAiEvaluationErrorMessage(error), commentId));
  }

  const aiScoreByCriterion = new Map(aiResult.scores.map((score) => [score.criterion_id, score]));
  const scoreRows = evaluationRubric.criteria.map((criterion) => {
    const aiScore = aiScoreByCriterion.get(criterion.id);
    const maximumScore = evaluationRubric.maxScoreByCriterion.get(criterion.id) ?? criterion.max_score;
    const minimumScore = evaluationRubric.minimumScoreByCriterion.get(criterion.id) ?? 0;
    const normalizedScore = Math.min(Math.max(aiScore?.score ?? minimumScore, minimumScore), maximumScore);

    return {
      criterion_id: criterion.id,
      score: normalizedScore,
      rationale: aiScore
        ? `[답안 근거] ${aiScore.evidence_quote || "근거 없음"}\n[판정 이유] ${aiScore.rationale}`
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
        assessment_prep_version_id: activeDesign.versionId,
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
          prompt_version: AI_EVALUATION_PROMPT_VERSION,
          active_prep_version_id: activeDesign.versionId,
          rubric_snapshot: evaluationRubricSnapshot(evaluationRubric),
        },
      },
      { onConflict: "comment_id,evaluator_id,source" },
    )
    .select("id")
    .single();

  if (evaluationError || !evaluation) {
    redirect(projectActionUrl(projectId, answerMode, "message", "AI 평가 초안을 저장하지 못했습니다.", commentId));
  }

  const { error: deleteScoresError } = await supabase
    .from("evaluation_scores")
    .delete()
    .eq("evaluation_id", evaluation.id);

  if (deleteScoresError) {
    redirect(projectActionUrl(projectId, answerMode, "message", "이전 AI 평가 점수를 정리하지 못했습니다.", commentId));
  }

  const { error: scoresError } = await supabase.from("evaluation_scores").insert(
    scoreRows.map((row) => ({
      evaluation_id: evaluation.id,
      criterion_id: row.criterion_id,
      score: row.score,
      rationale: row.rationale,
    })),
  );

  if (scoresError) {
    redirect(projectActionUrl(projectId, answerMode, "message", "AI 평가 점수를 저장하지 못했습니다.", commentId));
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/compare");
  redirect(projectActionUrl(projectId, answerMode, "notice", "AI 평가 초안을 만들었습니다.", commentId));
}

export async function generateProjectAiDrafts(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const answerMode = readText(formData, "return_view") === "answers";
  const answersOnly = readText(formData, "answers_only") === "true";
  if (!projectId) redirect("/dashboard/projects?message=수업활동을 찾을 수 없습니다.");

  const { supabase, user, project } = await requireOwnedProject(projectId);

  const activeDesign = await loadActiveEvaluationDesign(supabase, user.id, projectId);
  if (!activeDesign) {
    redirect(projectActionUrl(projectId, answerMode, "message", "AI 초안을 만들기 전에 평가 설계를 확정해 주세요."));
  }

  const [{ data: criteria }, { data: comments }, { data: existingDrafts }] = await Promise.all([
    supabase.from("rubric_criteria").select("*").eq("rubric_id", activeDesign.rubricId).order("sort_order"),
    supabase.from("comments").select("*").eq("project_id", projectId).order("created_at"),
    supabase
      .from("evaluations")
      .select("comment_id, assessment_prep_version_id, raw_output")
      .eq("project_id", projectId)
      .eq("evaluator_id", user.id)
      .eq("source", "ai-draft"),
  ]);

  if (!criteria?.length) {
    redirect(`/dashboard/projects/${projectId}?message=루브릭 평가 기준을 준비해 주세요.`);
  }

  const completedForVersion = new Set(
    (existingDrafts ?? [])
      .filter((draft) => (
        draft.assessment_prep_version_id === activeDesign.versionId
        && usesCurrentAiEvaluationPrompt(draft.raw_output)
      ))
      .map((draft) => draft.comment_id),
  );
  const candidates = (comments ?? []).filter((comment) => {
    if (!answersOnly) return true;
    const metadata = comment.metadata;
    return Boolean(
      metadata
      && typeof metadata === "object"
      && !Array.isArray(metadata)
      && metadata.source === "assessment-survey"
    );
  });
  const pendingTargets = candidates.filter((comment) => !completedForVersion.has(comment.id));
  const targets = answersOnly ? pendingTargets : pendingTargets.slice(0, 20);

  if (targets.length === 0) {
    redirect(`/dashboard/projects/${projectId}?notice=${encodeURIComponent("현재 평가 준비 버전으로 만들 AI 초안이 남아 있지 않습니다.")}`);
  }

  let completed = 0;
  let failed = 0;
  let firstFailure: unknown = null;
  for (const comment of targets) {
    try {
      const evaluationRubric = evaluationRubricForComment(project.notion_source, comment.metadata, criteria);
      const aiResult = await evaluateCommentWithOpenAI({
        projectTitle: project.title,
        rubricTitle: activeDesign.rubricTitle,
        comment: comment.content,
        criteria: evaluationRubric.criteria,
        criterionScoreLevels: evaluationRubric.scoreLevels,
        evaluationGoal: activeDesign.evaluationGoal,
        achievementStandards: activeDesign.achievementStandards,
        ...assessmentContextForComment(project.notion_source, comment.metadata),
      });
      const aiScoreByCriterion = new Map(aiResult.scores.map((score) => [score.criterion_id, score]));
      const scoreRows = evaluationRubric.criteria.map((criterion) => {
        const aiScore = aiScoreByCriterion.get(criterion.id);
        const maximumScore = evaluationRubric.maxScoreByCriterion.get(criterion.id) ?? criterion.max_score;
        const minimumScore = evaluationRubric.minimumScoreByCriterion.get(criterion.id) ?? 0;
        return {
          criterion_id: criterion.id,
          score: Math.min(Math.max(aiScore?.score ?? minimumScore, minimumScore), maximumScore),
          rationale: aiScore
            ? `[답안 근거] ${aiScore.evidence_quote || "근거 없음"}\n[판정 이유] ${aiScore.rationale}`
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
          assessment_prep_version_id: activeDesign.versionId,
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
            prompt_version: AI_EVALUATION_PROMPT_VERSION,
            active_prep_version_id: activeDesign.versionId,
            rubric_snapshot: evaluationRubricSnapshot(evaluationRubric),
          },
        }, { onConflict: "comment_id,evaluator_id,source" })
        .select("id")
        .single();
      if (evaluationError || !evaluation) throw new Error(evaluationError?.message || "AI 초안 저장 실패");
      const { error: deleteScoresError } = await supabase
        .from("evaluation_scores")
        .delete()
        .eq("evaluation_id", evaluation.id);
      if (deleteScoresError) throw new Error(deleteScoresError.message);
      const { error: scoresError } = await supabase.from("evaluation_scores").insert(
        scoreRows.map((score) => ({ evaluation_id: evaluation.id, ...score })),
      );
      if (scoresError) throw new Error(scoresError.message);
      completed += 1;
    } catch (error) {
      firstFailure ??= error;
      failed += 1;
      if (/api key|unauthorized|status.?401|quota|billing|insufficient_quota/i.test(error instanceof Error ? error.message : "")) {
        break;
      }
    }
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/compare");
  if (completed === 0 && firstFailure) {
    redirect(projectActionUrl(projectId, answerMode, "message", safeAiEvaluationErrorMessage(firstFailure)));
  }
  const notice = `AI 초안 ${completed}개를 만들었습니다.${failed ? ` 처리하지 못한 답안 ${failed}개는 다시 실행할 수 있습니다.` : ""}`;
  redirect(projectActionUrl(projectId, answerMode, "notice", notice));
}

export async function applyQuestionTeacherFeedback(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const questionNumber = Number(readText(formData, "question_number"));
  const teacherGuidance = readText(formData, "teacher_guidance");

  if (!projectId || !Number.isInteger(questionNumber) || questionNumber < 1 || !teacherGuidance) {
    redirect(projectActionUrl(projectId, true, "message", "문항과 전체 적용할 교사 피드백을 입력해 주세요."));
  }
  if (teacherGuidance.length > 1000) {
    redirect(projectActionUrl(projectId, true, "message", "문항별 교사 피드백은 1000자 이하로 입력해 주세요."));
  }

  const { supabase, user, project } = await requireOwnedProject(projectId);
  const activeDesign = await loadActiveEvaluationDesign(supabase, user.id, projectId);
  if (!activeDesign) {
    redirect(projectActionUrl(projectId, true, "message", "전체 피드백을 적용하려면 평가 설계를 먼저 확정해 주세요."));
  }

  const survey = readAssessmentSurveyConfig(project.notion_source);
  if (!survey || questionNumber > survey.prompts.length) {
    redirect(projectActionUrl(projectId, true, "message", "저장된 평가지 문항을 찾을 수 없습니다."));
  }

  const guidanceByQuestion = survey.prompts.map((_, index) => (
    index === questionNumber - 1 ? teacherGuidance : survey.questionTeacherGuidance[index] ?? ""
  ));
  const projectSource = asJsonRecord(project.notion_source);
  const assessmentSurveySource = asJsonRecord(projectSource.assessment_survey);
  const updatedProjectSource: Json = {
    ...projectSource,
    assessment_survey: {
      ...assessmentSurveySource,
      question_teacher_guidance: guidanceByQuestion,
    },
  };

  const { error: updateProjectError } = await supabase
    .from("projects")
    .update({ notion_source: updatedProjectSource })
    .eq("id", projectId)
    .eq("owner_id", user.id);
  if (updateProjectError) {
    redirect(projectActionUrl(projectId, true, "message", "문항별 교사 피드백을 저장하지 못했습니다."));
  }

  const [{ data: criteria }, { data: comments }] = await Promise.all([
    supabase.from("rubric_criteria").select("*").eq("rubric_id", activeDesign.rubricId).order("sort_order"),
    supabase.from("comments").select("*").eq("project_id", projectId).order("created_at"),
  ]);

  if (!criteria?.length) {
    redirect(projectActionUrl(projectId, true, "message", "전체 피드백을 적용하려면 확정된 평가 설계와 루브릭이 필요합니다."));
  }

  const targets = (comments ?? []).filter((comment) => {
    const metadata = comment.metadata;
    return Boolean(
      metadata
      && typeof metadata === "object"
      && !Array.isArray(metadata)
      && metadata.source === "assessment-survey"
      && metadata.question_number === questionNumber
    );
  });
  if (targets.length === 0) {
    redirect(projectActionUrl(projectId, true, "message", `${questionNumber}번 문항에 제출된 답안이 없습니다.`));
  }

  const projectWithGuidance = { ...project, notion_source: updatedProjectSource };
  let completed = 0;
  let failed = 0;
  let firstFailure: unknown = null;

  for (const comment of targets) {
    try {
      const evaluationRubric = evaluationRubricForComment(updatedProjectSource, comment.metadata, criteria);
      const aiResult = await evaluateCommentWithOpenAI({
        projectTitle: project.title,
        rubricTitle: activeDesign.rubricTitle,
        comment: comment.content,
        criteria: evaluationRubric.criteria,
        criterionScoreLevels: evaluationRubric.scoreLevels,
        evaluationGoal: activeDesign.evaluationGoal,
        achievementStandards: activeDesign.achievementStandards,
        ...assessmentContextForComment(projectWithGuidance.notion_source, comment.metadata),
      });
      const aiScoreByCriterion = new Map(aiResult.scores.map((score) => [score.criterion_id, score]));
      const scoreRows = evaluationRubric.criteria.map((criterion) => {
        const aiScore = aiScoreByCriterion.get(criterion.id);
        const maximumScore = evaluationRubric.maxScoreByCriterion.get(criterion.id) ?? criterion.max_score;
        const minimumScore = evaluationRubric.minimumScoreByCriterion.get(criterion.id) ?? 0;
        return {
          criterion_id: criterion.id,
          score: Math.min(Math.max(aiScore?.score ?? minimumScore, minimumScore), maximumScore),
          rationale: aiScore
            ? `[답안 근거] ${aiScore.evidence_quote || "근거 없음"}\n[판정 이유] ${aiScore.rationale}`
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
          assessment_prep_version_id: activeDesign.versionId,
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
            prompt_version: AI_EVALUATION_PROMPT_VERSION,
            active_prep_version_id: activeDesign.versionId,
            rubric_snapshot: evaluationRubricSnapshot(evaluationRubric),
            teacher_guidance: teacherGuidance,
            question_number: questionNumber,
          },
        }, { onConflict: "comment_id,evaluator_id,source" })
        .select("id")
        .single();
      if (evaluationError || !evaluation) throw new Error(evaluationError?.message || "AI 초안 저장 실패");

      const { error: deleteScoresError } = await supabase
        .from("evaluation_scores")
        .delete()
        .eq("evaluation_id", evaluation.id);
      if (deleteScoresError) throw new Error(deleteScoresError.message);
      const { error: scoresError } = await supabase.from("evaluation_scores").insert(
        scoreRows.map((score) => ({ evaluation_id: evaluation.id, ...score })),
      );
      if (scoresError) throw new Error(scoresError.message);
      completed += 1;
    } catch (error) {
      firstFailure ??= error;
      failed += 1;
      if (/api key|unauthorized|status.?401|quota|billing|insufficient_quota/i.test(error instanceof Error ? error.message : "")) {
        break;
      }
    }
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/compare");
  if (completed === 0 && firstFailure) {
    redirect(projectActionUrl(projectId, true, "message", safeAiEvaluationErrorMessage(firstFailure)));
  }
  const notice = `${questionNumber}번 문항 교사 피드백을 저장하고 AI 평가 ${completed}개에 적용했습니다.${failed ? ` 적용하지 못한 답안 ${failed}개는 전체 적용을 다시 실행해 주세요.` : ""}`;
  redirect(projectActionUrl(projectId, true, "notice", notice));
}

export async function confirmQuestionEvaluations(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const questionNumber = Number(readText(formData, "question_number"));

  if (!projectId || !Number.isInteger(questionNumber) || questionNumber < 1) {
    redirect(projectActionUrl(projectId, true, "message", "교사 확인할 문항을 찾을 수 없습니다."));
  }

  const { supabase, user } = await requireOwnedProject(projectId);
  const activeDesign = await loadActiveEvaluationDesign(supabase, user.id, projectId);
  if (!activeDesign) {
    redirect(projectActionUrl(projectId, true, "message", "교사 확인을 저장하려면 확정된 평가 설계가 필요합니다."));
  }

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("id, metadata")
    .eq("project_id", projectId);
  if (commentsError) {
    redirect(projectActionUrl(projectId, true, "message", "문항별 답안을 불러오지 못했습니다."));
  }

  const targetCommentIds = (comments ?? []).flatMap((comment) => {
    const metadata = comment.metadata;
    return metadata
      && typeof metadata === "object"
      && !Array.isArray(metadata)
      && metadata.source === "assessment-survey"
      && metadata.question_number === questionNumber
      ? [comment.id]
      : [];
  });

  if (targetCommentIds.length === 0) {
    redirect(projectActionUrl(projectId, true, "message", `${questionNumber}번 문항에 제출된 답안이 없습니다.`));
  }

  const [{ data: aiDrafts, error: aiDraftsError }, { data: teacherEvaluations, error: teacherEvaluationsError }] = await Promise.all([
    supabase
      .from("evaluations")
      .select("*")
      .in("comment_id", targetCommentIds)
      .eq("evaluator_id", user.id)
      .eq("source", "ai-draft"),
    supabase
      .from("evaluations")
      .select("*")
      .in("comment_id", targetCommentIds)
      .eq("evaluator_id", user.id)
      .eq("source", "teacher-manual"),
  ]);

  if (aiDraftsError || teacherEvaluationsError) {
    redirect(projectActionUrl(projectId, true, "message", "교사 확인할 AI 평가를 불러오지 못했습니다."));
  }

  const currentAiDrafts = (aiDrafts ?? []).filter((evaluation) => usesCurrentAiEvaluationPrompt(evaluation.raw_output));
  const aiEvaluationIds = currentAiDrafts.map((evaluation) => evaluation.id);
  const { data: aiScores, error: aiScoresError } = aiEvaluationIds.length
    ? await supabase.from("evaluation_scores").select("*").in("evaluation_id", aiEvaluationIds)
    : { data: [], error: null };

  if (aiScoresError) {
    redirect(projectActionUrl(projectId, true, "message", "AI 평가 점수를 불러오지 못했습니다."));
  }

  type EvaluationScore = Database["public"]["Tables"]["evaluation_scores"]["Row"];
  const aiDraftByCommentId = new Map(currentAiDrafts.map((evaluation) => [evaluation.comment_id, evaluation]));
  const teacherEvaluationByCommentId = new Map((teacherEvaluations ?? []).map((evaluation) => [evaluation.comment_id, evaluation]));
  const aiScoresByEvaluationId = new Map<string, EvaluationScore[]>();
  for (const score of aiScores ?? []) {
    const rows = aiScoresByEvaluationId.get(score.evaluation_id) ?? [];
    rows.push(score);
    aiScoresByEvaluationId.set(score.evaluation_id, rows);
  }

  let confirmed = 0;
  let alreadyConfirmed = 0;
  let skipped = 0;

  for (const commentId of targetCommentIds) {
    const existingTeacherEvaluation = teacherEvaluationByCommentId.get(commentId);
    if (existingTeacherEvaluation?.status === "confirmed") {
      alreadyConfirmed += 1;
      continue;
    }

    const aiDraft = aiDraftByCommentId.get(commentId);
    const scoreRows = aiDraft ? aiScoresByEvaluationId.get(aiDraft.id) ?? [] : [];
    if (!aiDraft || scoreRows.length === 0) {
      skipped += 1;
      continue;
    }

    const revisionNumber = (existingTeacherEvaluation?.revision ?? 0) + 1;
    const aiRawOutput = asJsonRecord(aiDraft.raw_output);
    const totalScore = scoreRows.reduce((sum, score) => sum + score.score, 0);
    const { data: teacherEvaluation, error: teacherEvaluationError } = await supabase
      .from("evaluations")
      .upsert({
        project_id: projectId,
        comment_id: commentId,
        evaluator_id: user.id,
        assessment_prep_version_id: activeDesign.versionId,
        source: "teacher-manual",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        revision: revisionNumber,
        change_reason: "문항 전체 교사 확인",
        evaluation_forward: null,
        review_reasons: aiDraft.review_reasons,
        model_name: "teacher-manual",
        total_score: totalScore,
        feedback: aiDraft.feedback,
        raw_output: {
          source: "teacher-manual",
          confirmed_from_ai_evaluation_id: aiDraft.id,
          rubric_snapshot: aiRawOutput.rubric_snapshot ?? [],
          question_number: questionNumber,
        },
      }, { onConflict: "comment_id,evaluator_id,source" })
      .select("id")
      .single();

    if (teacherEvaluationError || !teacherEvaluation) {
      skipped += 1;
      continue;
    }

    const { error: deleteScoresError } = await supabase
      .from("evaluation_scores")
      .delete()
      .eq("evaluation_id", teacherEvaluation.id);
    const { error: copyScoresError } = deleteScoresError
      ? { error: deleteScoresError }
      : await supabase.from("evaluation_scores").insert(scoreRows.map((score) => ({
          evaluation_id: teacherEvaluation.id,
          criterion_id: score.criterion_id,
          score: score.score,
          rationale: score.rationale,
        })));

    if (copyScoresError) {
      skipped += 1;
      continue;
    }

    const { error: revisionError } = await supabase.from("evaluation_revisions").insert({
      evaluation_id: teacherEvaluation.id,
      project_id: projectId,
      comment_id: commentId,
      revision_number: revisionNumber,
      total_score: totalScore,
      feedback: aiDraft.feedback,
      evaluation_forward: null,
      review_reasons: aiDraft.review_reasons,
      score_snapshot: scoreRows.map((score) => ({
        criterion_id: score.criterion_id,
        score: score.score,
        rationale: score.rationale,
      })),
      change_reason: "문항 전체 교사 확인",
      created_by: user.id,
    });

    if (revisionError) {
      skipped += 1;
      continue;
    }

    confirmed += 1;
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/evaluation");
  revalidatePath("/dashboard/compare");
  revalidatePath("/dashboard/growth");

  if (confirmed === 0 && alreadyConfirmed === targetCommentIds.length) {
    redirect(projectActionUrl(projectId, true, "notice", `${questionNumber}번 문항은 이미 모두 교사 확인했습니다.`));
  }
  if (confirmed === 0) {
    redirect(projectActionUrl(projectId, true, "message", `${questionNumber}번 문항에서 확인할 AI 초안을 찾지 못했습니다.`));
  }

  const notice = `${questionNumber}번 문항 답안 ${confirmed}개를 교사 확인했습니다.${alreadyConfirmed ? ` 이미 확인한 답안 ${alreadyConfirmed}개는 유지했습니다.` : ""}${skipped ? ` 확인하지 못한 답안 ${skipped}개가 있습니다.` : ""}`;
  redirect(projectActionUrl(projectId, true, "notice", notice));
}
