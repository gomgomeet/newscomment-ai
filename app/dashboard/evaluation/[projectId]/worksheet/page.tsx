import { notFound, redirect } from "next/navigation";
import { WorksheetBuilder } from "@/components/evaluation/worksheet-builder";
import { requireUser } from "@/lib/auth/require-user";
import type { Json } from "@/lib/db/types";
import { createAssessmentSurveyToken, readAssessmentSurveyConfig } from "@/lib/evaluation/assessment-survey";

type WorksheetCriterion = {
  id: string;
  label: string;
  description: string;
  maxScore: number;
};

type WorksheetSnapshot = {
  projectTitle: string;
  gradeLevel: string;
  subject: string;
  lessonContext: string;
  evaluationGoal: string;
  standards: Array<{ code: string; text: string }>;
  criteria: WorksheetCriterion[];
  version: number;
  suggestedPrompt: string;
};

function asRecord(value: Json | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function readText(record: Record<string, Json | undefined> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readStandards(value: Json | undefined) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const code = readText(record, "code").replace(/^\[|\]$/g, "");
    const text = readText(record, "text") || readText(record, "summary");
    return code || text ? [{ code, text }] : [];
  });
}

function readCriteria(value: Json | undefined) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const label = readText(record, "label");
    const description = readText(record, "description");
    const id = readText(record, "id") || `criterion-${index}`;
    const maxScoreValue = record?.max_score;
    const maxScore = typeof maxScoreValue === "number" ? maxScoreValue : 5;
    return label ? [{ id, label, description, maxScore }] : [];
  });
}

function parseSnapshot(snapshot: Json, version: number): WorksheetSnapshot | null {
  const record = asRecord(snapshot);
  const rubric = asRecord(record?.rubric);
  const projectTitle = readText(record, "project_title");
  const lessonContext = readText(record, "lesson_context");
  const evaluationGoal = readText(record, "evaluation_goal");
  const criteria = readCriteria(rubric?.criteria);

  if (!projectTitle || !lessonContext || !evaluationGoal || criteria.length === 0) return null;

  return {
    projectTitle,
    gradeLevel: readText(record, "grade_level"),
    subject: readText(record, "subject"),
    lessonContext,
    evaluationGoal,
    standards: readStandards(record?.achievement_standards),
    criteria,
    version,
    suggestedPrompt: buildSuggestedPrompt(lessonContext, evaluationGoal),
  };
}

function buildSuggestedPrompt(lessonContext: string, evaluationGoal: string) {
  const source = `${lessonContext} ${evaluationGoal}`;
  if (/중심.{0,8}(생각|내용)/.test(source) && /(요약|간추)/.test(source)) {
    return "위 글을 읽고 중심 생각을 한 문장으로 쓴 뒤, 중요한 내용을 중심으로 글을 간추려 쓰세요.";
  }
  if (/(의견|생각)/.test(source) && /(근거|이유|표현|쓰기)/.test(source)) {
    return "위 자료를 읽고 자신의 의견을 정한 뒤, 자료에서 찾은 근거나 이유와 함께 구체적으로 쓰세요.";
  }
  if (/(비교|공통점|차이점)/.test(source)) {
    return "위 자료를 살펴보고 공통점과 차이점을 근거와 함께 비교하여 쓰세요.";
  }
  if (/(해결|방안|참여)/.test(source)) {
    return "위 자료에서 문제 상황을 찾고, 실천할 수 있는 해결 방안이나 참여 방법을 제안하세요.";
  }
  return "위 자료를 바탕으로 수업에서 배운 내용을 적용하여 자신의 답을 구체적으로 작성하세요.";
}

export default async function EvaluationWorksheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ message?: string; notice?: string; print?: string }>;
}) {
  const { projectId } = await params;
  const { message, notice, print } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, notion_source")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) notFound();

  const { data: prep, error: prepError } = await supabase
    .from("assessment_preps")
    .select("id, active_version_id")
    .eq("project_id", project.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (prepError) throw new Error(prepError.message);
  if (!prep?.active_version_id) {
    redirect(`/dashboard/evaluation?message=${encodeURIComponent("평가 설계를 먼저 확정해 주세요.")}`);
  }

  const { data: version, error: versionError } = await supabase
    .from("assessment_prep_versions")
    .select("version_number, snapshot")
    .eq("id", prep.active_version_id)
    .eq("prep_id", prep.id)
    .single();

  if (versionError || !version) throw new Error(versionError?.message ?? "확정된 평가 설계를 읽지 못했습니다.");

  const worksheet = parseSnapshot(version.snapshot, version.version_number);
  if (!worksheet) {
    redirect(`/dashboard/evaluation?message=${encodeURIComponent("평가지를 만들 수 있도록 평가 목표와 루브릭을 확인해 주세요.")}`);
  }

  const savedSurvey = readAssessmentSurveyConfig(project.notion_source);
  const savedForCurrentVersion = savedSurvey?.versionId === prep.active_version_id ? savedSurvey : null;
  const token = createAssessmentSurveyToken(project.id, prep.active_version_id);

  return (
    <WorksheetBuilder
      worksheet={{
        ...worksheet,
        projectId: project.id,
        surveyPath: `/assessment/${project.id}/${token}`,
        surveyReady: Boolean(savedForCurrentVersion?.sourceText && savedForCurrentVersion?.prompts.length),
        savedTitle: savedForCurrentVersion?.title ?? "",
        savedSourceText: savedForCurrentVersion?.sourceText ?? "",
        savedPrompts: savedForCurrentVersion?.prompts ?? [],
        savedCriteriaByQuestion: savedForCurrentVersion?.questionCriteria ?? [],
        savedRubricsByQuestion: savedForCurrentVersion?.questionRubrics ?? [],
        printOnLoad: print === "1",
      }}
      message={message}
      notice={notice}
    />
  );
}
