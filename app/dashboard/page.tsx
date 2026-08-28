import Link from "next/link";
import { ArrowRight, BookOpenCheck, CircleCheckBig, ClipboardList } from "lucide-react";
import { AssessmentPrepBanner } from "@/components/assessment-prep/prep-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildAssessmentPrepReadiness,
  isNotionResultMetadata,
} from "@/lib/assessment-prep/readiness";
import { requireUser } from "@/lib/auth/require-user";
import { getEvaluationNotionConnectionStatus } from "@/lib/notion/teacher-connection";

function formatLastEvaluation(value: string | null) {
  if (!value) return "아직 채점을 시작하지 않았습니다";

  return `마지막 채점 ${new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(new Date(value))}`;
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const [projectsResult, commentsResult, evaluationsResult, rubricsResult, criteriaResult, prepsResult, notionConnection] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, description, status, rubric_id, notion_source, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase.from("comments").select("id, project_id, metadata"),
    supabase
      .from("evaluations")
      .select("id, project_id, comment_id, updated_at")
      .eq("evaluator_id", user.id)
      .eq("source", "teacher-manual"),
    supabase
      .from("rubrics")
      .select("id, generation_context", { count: "exact" })
      .eq("owner_id", user.id),
    supabase.from("rubric_criteria").select("id, rubric_id"),
    supabase.from("assessment_preps").select("*").eq("owner_id", user.id),
    getEvaluationNotionConnectionStatus({ supabase, userId: user.id }),
  ]);

  const queryError =
    projectsResult.error
    ?? commentsResult.error
    ?? evaluationsResult.error
    ?? rubricsResult.error
    ?? criteriaResult.error
    ?? prepsResult.error;
  if (queryError) throw new Error(queryError.message);

  const projects = projectsResult.data ?? [];
  const comments = commentsResult.data ?? [];
  const evaluations = evaluationsResult.data ?? [];
  const rubrics = rubricsResult.data ?? [];
  const criteria = criteriaResult.data ?? [];
  const evaluatedCommentIds = new Set(evaluations.map((evaluation) => evaluation.comment_id));
  const totalComments = comments.length;
  const totalEvaluated = evaluatedCommentIds.size;
  const totalRemaining = Math.max(totalComments - totalEvaluated, 0);
  const commentsByProject = new Map<string, typeof comments>();
  const teacherEvaluationCountByProject = new Map<string, number>();
  const lastEvaluationByProject = new Map<string, string>();
  const notionResultCountByProject = new Map<string, number>();
  const criterionCountByRubric = new Map<string, number>();

  for (const comment of comments) {
    const projectComments = commentsByProject.get(comment.project_id) ?? [];
    projectComments.push(comment);
    commentsByProject.set(comment.project_id, projectComments);
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
    const latest = lastEvaluationByProject.get(evaluation.project_id);
    if (!latest || evaluation.updated_at > latest) {
      lastEvaluationByProject.set(evaluation.project_id, evaluation.updated_at);
    }
  }

  for (const criterion of criteria) {
    criterionCountByRubric.set(
      criterion.rubric_id,
      (criterionCountByRubric.get(criterion.rubric_id) ?? 0) + 1,
    );
  }

  const projectProgress = projects.map((project) => {
    const projectComments = commentsByProject.get(project.id) ?? [];
    const evaluatedCount = projectComments.filter((comment) => evaluatedCommentIds.has(comment.id)).length;

    return {
      ...project,
      commentCount: projectComments.length,
      evaluatedCount,
      remainingCount: Math.max(projectComments.length - evaluatedCount, 0),
      percentage:
        projectComments.length > 0 ? Math.round((evaluatedCount / projectComments.length) * 100) : 0,
      lastEvaluation: lastEvaluationByProject.get(project.id) ?? null,
    };
  });

  const projectsToContinue = projectProgress
    .filter((project) => project.status !== "archived" && project.remainingCount > 0)
    .slice(0, 4);
  const prepProject = projects.find((project) => project.status !== "archived") ?? projects[0] ?? null;
  const prepRubric = prepProject?.rubric_id
    ? rubrics.find((rubric) => rubric.id === prepProject.rubric_id)
    : null;
  const savedPrep = prepProject
    ? (prepsResult.data ?? []).find((prep) => prep.project_id === prepProject.id) ?? null
    : null;
  const prepReadiness = prepProject
    ? buildAssessmentPrepReadiness({
        project: prepProject,
        rubricGenerationContext: prepRubric?.generation_context,
        criterionCount: prepProject.rubric_id
          ? criterionCountByRubric.get(prepProject.rubric_id) ?? 0
          : 0,
        notionConnectionConfigured: notionConnection.configured,
        notionResultCount: notionResultCountByProject.get(prepProject.id) ?? 0,
        teacherEvaluationCount: teacherEvaluationCountByProject.get(prepProject.id) ?? 0,
        assessmentPrep: savedPrep,
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#0f766e_0%,#115e59_55%,#134e4a_100%)] px-6 py-7 text-white shadow-sm sm:px-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-teal-100">오늘의 평가 보드</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">남은 댓글부터 이어서 살펴보세요.</h2>
            <p className="mt-3 text-sm leading-6 text-teal-50/80">
              전체 댓글 {totalComments}개 중 {totalEvaluated}개를 채점했고, {totalRemaining}개가 남았습니다.
            </p>
          </div>
          <Button asChild className="bg-white text-teal-800 hover:bg-teal-50">
            <Link href="/dashboard/projects">
              수업활동 관리 <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <AssessmentPrepBanner readiness={prepReadiness} />

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="rounded-xl bg-teal-50 p-3 text-teal-700"><BookOpenCheck className="h-5 w-5" /></span>
            <div><p className="text-sm text-muted-foreground">진행 중 수업</p><p className="text-2xl font-semibold">{projects.filter((project) => project.status === "active").length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><CircleCheckBig className="h-5 w-5" /></span>
            <div><p className="text-sm text-muted-foreground">채점 완료</p><p className="text-2xl font-semibold">{totalEvaluated}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="rounded-xl bg-amber-50 p-3 text-amber-700"><ClipboardList className="h-5 w-5" /></span>
            <div><p className="text-sm text-muted-foreground">남은 댓글</p><p className="text-2xl font-semibold">{totalRemaining}</p></div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">이어서 채점하기</h3>
            <p className="mt-1 text-sm text-muted-foreground">아직 평가가 끝나지 않은 수업을 먼저 보여줍니다.</p>
          </div>
          <Link href="/dashboard/projects" className="text-sm font-medium text-primary hover:underline">전체 보기</Link>
        </div>

        {projectsToContinue.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{projects.length === 0 ? "첫 수업활동을 만들어 보세요" : "남은 채점이 없습니다"}</CardTitle>
              <CardDescription>
                {projects.length === 0
                  ? "루브릭을 연결하고 학생 댓글을 가져오면 진행률이 이곳에 표시됩니다."
                  : "현재 등록된 댓글의 평가를 모두 마쳤습니다."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline"><Link href="/dashboard/projects">수업활동으로 이동</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {projectsToContinue.map((project) => (
              <Card key={project.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{project.title}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-1">{project.description || "수업 설명 없음"}</CardDescription>
                    </div>
                    <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">{project.percentage}%</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-2 flex justify-between text-sm">
                      <span>댓글 {project.commentCount} · 채점 {project.evaluatedCount}</span>
                      <span className="font-medium text-amber-700">남음 {project.remainingCount}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`채점 진행률 ${project.percentage}%`}>
                      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${project.percentage}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{formatLastEvaluation(project.lastEvaluation)}</p>
                    <Button asChild size="sm"><Link href={`/dashboard/projects/${project.id}`}>이어서 채점하기</Link></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">평가 루브릭 {rubricsResult.count ?? 0}개 · 보관된 수업 {projects.filter((project) => project.status === "archived").length}개</p>
    </div>
  );
}
