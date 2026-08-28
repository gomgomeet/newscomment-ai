import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentPrepEditor } from "@/components/assessment-prep/prep-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildAssessmentPrepReadiness, isNotionResultMetadata } from "@/lib/assessment-prep/readiness";
import { requireUser } from "@/lib/auth/require-user";

export default async function AssessmentPrepDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { prepId } = await params;
  const { message, notice } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data: prep, error: prepError } = await supabase
    .from("assessment_preps")
    .select("*")
    .eq("id", prepId)
    .eq("owner_id", user.id)
    .single();

  if (prepError || !prep) notFound();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", prep.project_id)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) notFound();

  const [rubricResult, criteriaResult, versionsResult, commentsResult, evaluationsResult] = await Promise.all([
    project.rubric_id
      ? supabase.from("rubrics").select("*").eq("id", project.rubric_id).eq("owner_id", user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    project.rubric_id
      ? supabase.from("rubric_criteria").select("*").eq("rubric_id", project.rubric_id).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("assessment_prep_versions").select("*").eq("prep_id", prep.id).order("version_number", { ascending: false }),
    supabase.from("comments").select("metadata").eq("project_id", project.id),
    supabase.from("evaluations").select("id").eq("project_id", project.id).eq("evaluator_id", user.id).eq("source", "teacher-manual"),
  ]);

  const queryError = rubricResult.error ?? criteriaResult.error ?? versionsResult.error ?? commentsResult.error ?? evaluationsResult.error;
  if (queryError) throw new Error(queryError.message);

  const readiness = buildAssessmentPrepReadiness({
    project,
    rubricGenerationContext: rubricResult.data?.generation_context,
    criterionCount: criteriaResult.data?.length ?? 0,
    notionConnectionConfigured: Boolean(process.env.NOTION_API_KEY),
    notionResultCount: (commentsResult.data ?? []).filter((comment) => isNotionResultMetadata(comment.metadata)).length,
    teacherEvaluationCount: evaluationsResult.data?.length ?? 0,
    assessmentPrep: prep,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex justify-end"><Button asChild variant="ghost"><Link href="/dashboard/prep">평가 준비 목록으로</Link></Button></div>
      {message ? <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{message}</CardContent></Card> : null}
      {notice ? <Card className="border-teal-200 bg-teal-50"><CardContent className="p-4 text-sm text-teal-900">{notice}</CardContent></Card> : null}
      <AssessmentPrepEditor
        prep={prep}
        project={project}
        rubric={rubricResult.data}
        criteria={criteriaResult.data ?? []}
        versions={versionsResult.data ?? []}
        readiness={readiness}
        notionConfigured={Boolean(process.env.NOTION_API_KEY)}
      />
    </div>
  );
}
