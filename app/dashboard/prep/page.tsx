import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed, Database, FileSearch, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { openAssessmentPrep } from "@/app/dashboard/prep/actions";
import { EvaluationNotionConnectionCard } from "@/components/notion/evaluation-notion-connection-card";
import {
  buildAssessmentPrepReadiness,
  isNotionResultMetadata,
} from "@/lib/assessment-prep/readiness";
import { requireUser } from "@/lib/auth/require-user";
import { getEvaluationNotionConnectionStatus } from "@/lib/notion/teacher-connection";

export default async function AssessmentPrepPage() {
  const { supabase, user } = await requireUser();
  const [projectsResult, rubricsResult, criteriaResult, commentsResult, evaluationsResult, prepsResult, notionConnection] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, description, status, rubric_id, notion_source, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("rubrics")
      .select("id, title, generation_context")
      .eq("owner_id", user.id),
    supabase.from("rubric_criteria").select("id, rubric_id"),
    supabase.from("comments").select("id, project_id, metadata"),
    supabase
      .from("evaluations")
      .select("id, project_id")
      .eq("evaluator_id", user.id)
      .eq("source", "teacher-manual"),
    supabase
      .from("assessment_preps")
      .select("*")
      .eq("owner_id", user.id),
    getEvaluationNotionConnectionStatus({ supabase, userId: user.id }),
  ]);

  const queryError = projectsResult.error
    ?? rubricsResult.error
    ?? criteriaResult.error
    ?? commentsResult.error
    ?? evaluationsResult.error
    ?? prepsResult.error;
  if (queryError) throw new Error(queryError.message);

  const projects = projectsResult.data ?? [];
  const rubrics = rubricsResult.data ?? [];
  const criteria = criteriaResult.data ?? [];
  const comments = commentsResult.data ?? [];
  const evaluations = evaluationsResult.data ?? [];
  const prepByProjectId = new Map((prepsResult.data ?? []).map((prep) => [prep.project_id, prep]));
  const rubricById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));
  const criterionCountByRubric = new Map<string, number>();
  const notionResultCountByProject = new Map<string, number>();
  const teacherEvaluationCountByProject = new Map<string, number>();
  const notionConfigured = notionConnection.configured;

  for (const criterion of criteria) {
    criterionCountByRubric.set(
      criterion.rubric_id,
      (criterionCountByRubric.get(criterion.rubric_id) ?? 0) + 1,
    );
  }

  for (const comment of comments) {
    if (isNotionResultMetadata(comment.metadata)) {
      notionResultCountByProject.set(
        comment.project_id,
        (notionResultCountByProject.get(comment.project_id) ?? 0) + 1,
      );
    }
  }

  for (const evaluation of evaluations) {
    teacherEvaluationCountByProject.set(
      evaluation.project_id,
      (teacherEvaluationCountByProject.get(evaluation.project_id) ?? 0) + 1,
    );
  }

  const rows = projects.map((project) => {
    const rubric = project.rubric_id ? rubricById.get(project.rubric_id) : null;
    const prep = prepByProjectId.get(project.id) ?? null;
    const readiness = buildAssessmentPrepReadiness({
      project,
      rubricGenerationContext: rubric?.generation_context,
      criterionCount: project.rubric_id ? criterionCountByRubric.get(project.rubric_id) ?? 0 : 0,
      notionConnectionConfigured: notionConfigured,
      notionResultCount: notionResultCountByProject.get(project.id) ?? 0,
      teacherEvaluationCount: teacherEvaluationCountByProject.get(project.id) ?? 0,
      assessmentPrep: prep,
    });

    return { project, rubric, prep, readiness };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="overflow-hidden rounded-2xl border border-indigo-900/10 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_58%,#ecfeff_100%)] p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-indigo-700">평가 준비 프렙</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">준비 기준이 평가와 성장 기록까지 이어집니다.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              성취기준·평가 목표·루브릭을 먼저 확인하고, Notion의 학생 결과물을 읽어 교사 평가와 성장 기록 보드에 연결합니다.
              Notion 원본에는 평가 결과를 자동으로 덮어쓰지 않습니다.
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/projects">수업활동 관리 <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      <EvaluationNotionConnectionCard connection={notionConnection} compact />

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex gap-4 p-5">
            <span className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><FileSearch className="h-5 w-5" /></span>
            <div><p className="font-semibold">1. 평가 기준 준비</p><p className="mt-1 text-sm text-muted-foreground">목표·성취기준·관찰 기준을 고정합니다.</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex gap-4 p-5">
            <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Database className="h-5 w-5" /></span>
            <div><p className="font-semibold">2. Notion 결과물 읽기</p><p className="mt-1 text-sm text-muted-foreground">속성 또는 학생 페이지 본문을 가져옵니다.</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex gap-4 p-5">
            <span className="rounded-xl bg-teal-50 p-3 text-teal-700"><ShieldCheck className="h-5 w-5" /></span>
            <div><p className="font-semibold">3. 교사 확정·누적</p><p className="mt-1 text-sm text-muted-foreground">교사 판단만 성장 기록에 반영합니다.</p></div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">수업활동별 연결 상태</h3>
          <p className="mt-1 text-sm text-muted-foreground">미완료 단계부터 이어서 설정할 수 있습니다.</p>
        </div>

        {rows.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>아직 준비할 수업활동이 없습니다</CardTitle>
              <CardDescription>수업활동을 만든 뒤 평가 목표와 루브릭, Notion 결과물 DB를 연결하세요.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild><Link href="/dashboard/projects">첫 수업활동 만들기</Link></Button></CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ project, rubric, prep, readiness }) => (
              <Card key={project.id} id={`project-${project.id}`} className="scroll-mt-24 overflow-hidden">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{project.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {rubric?.title ?? "연결된 루브릭 없음"} · {project.status}
                      </CardDescription>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                      {readiness.completedCount}/6
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {readiness.stages.map((stage) => (
                      <Link key={stage.key} href={stage.href} className="flex gap-2 rounded-lg border p-3 hover:border-indigo-300">
                        {stage.complete
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                          : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                        <span><span className="text-sm font-medium">{stage.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{stage.description}</span></span>
                      </Link>
                    ))}
                  </div>
                  {readiness.selectedStandards.length > 0 ? (
                    <p className="text-xs text-muted-foreground">연결 성취기준 · {readiness.selectedStandards.join(", ")}</p>
                  ) : null}
                  <div className="flex justify-end">
                    {prep ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/prep/${prep.id}`}>
                          {readiness.completedCount === 6 ? "평가 준비안 열기" : `${readiness.nextStage?.label ?? "평가 준비"} 이어서 하기`}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <form action={openAssessmentPrep}>
                        <input type="hidden" name="project_id" value={project.id} />
                        <Button size="sm">이 수업의 평가 준비 시작 <ArrowRight className="h-4 w-4" /></Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
