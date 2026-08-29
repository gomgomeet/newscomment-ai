import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileQuestion,
  FileText,
  MessageSquareText,
  Printer,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotionEvaluationImportPanel } from "@/components/comments/notion-evaluation-import-panel";
import { SurveyDistributionActions } from "@/components/evaluation/survey-distribution-actions";
import { generateProjectAiDrafts } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { requireUser } from "@/lib/auth/require-user";
import { createAssessmentSurveyToken, readAssessmentSurveyConfig } from "@/lib/evaluation/assessment-survey";
import { readNotionSourceDefaults } from "@/lib/notion/project-source";
import { getEvaluationNotionConnectionStatus } from "@/lib/notion/teacher-connection";

type StepState = "done" | "ready" | "waiting";

function stepClass(state: StepState) {
  if (state === "done") return "border-teal-200 bg-teal-50 text-teal-950";
  if (state === "ready") return "border-indigo-200 bg-indigo-50 text-indigo-950";
  return "border-border bg-muted/20 text-muted-foreground";
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 text-teal-700" />;
  if (state === "ready") return <ArrowRight className="h-4 w-4 text-indigo-700" />;
  return <TriangleAlert className="h-4 w-4 text-amber-600" />;
}

export default async function EvaluationPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { message, notice } = await searchParams;
  const { supabase, user } = await requireUser();

  const [projectsResult, prepsResult, commentsResult, evaluationsResult, notionConnection] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, description, rubric_id, notion_source, status, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("assessment_preps")
      .select("id, project_id, status, active_version_id, current_version")
      .eq("owner_id", user.id),
    supabase.from("comments").select("id, project_id, metadata"),
    supabase
      .from("evaluations")
      .select("id, project_id, comment_id, source, status")
      .eq("evaluator_id", user.id),
    getEvaluationNotionConnectionStatus({ supabase, userId: user.id }),
  ]);

  const queryError = projectsResult.error ?? prepsResult.error ?? commentsResult.error ?? evaluationsResult.error;
  if (queryError) throw new Error(queryError.message);

  const prepsByProjectId = new Map((prepsResult.data ?? []).map((prep) => [prep.project_id, prep]));
  const commentCountByProject = new Map<string, number>();
  const answerCountByProject = new Map<string, number>();
  const commentIdsByProject = new Map<string, Set<string>>();
  const answerCommentIdsByProject = new Map<string, Set<string>>();
  const aiDraftCommentIdsByProject = new Map<string, Set<string>>();
  const teacherConfirmedCommentIdsByProject = new Map<string, Set<string>>();

  for (const comment of commentsResult.data ?? []) {
    commentCountByProject.set(comment.project_id, (commentCountByProject.get(comment.project_id) ?? 0) + 1);
    const commentIds = commentIdsByProject.get(comment.project_id) ?? new Set<string>();
    commentIds.add(comment.id);
    commentIdsByProject.set(comment.project_id, commentIds);
    if (
      comment.metadata
      && typeof comment.metadata === "object"
      && !Array.isArray(comment.metadata)
      && comment.metadata.source === "assessment-survey"
    ) {
      answerCountByProject.set(comment.project_id, (answerCountByProject.get(comment.project_id) ?? 0) + 1);
      const answerIds = answerCommentIdsByProject.get(comment.project_id) ?? new Set<string>();
      answerIds.add(comment.id);
      answerCommentIdsByProject.set(comment.project_id, answerIds);
    }
  }

  for (const evaluation of evaluationsResult.data ?? []) {
    const answerIds = answerCommentIdsByProject.get(evaluation.project_id);
    const relevantCommentIds = answerIds?.size ? answerIds : commentIdsByProject.get(evaluation.project_id);
    if (!relevantCommentIds?.has(evaluation.comment_id)) continue;
    if (evaluation.source === "ai-draft") {
      const set = aiDraftCommentIdsByProject.get(evaluation.project_id) ?? new Set<string>();
      set.add(evaluation.comment_id);
      aiDraftCommentIdsByProject.set(evaluation.project_id, set);
    }

    if (evaluation.source === "teacher-manual" && evaluation.status === "confirmed") {
      const set = teacherConfirmedCommentIdsByProject.get(evaluation.project_id) ?? new Set<string>();
      set.add(evaluation.comment_id);
      teacherConfirmedCommentIdsByProject.set(evaluation.project_id, set);
    }
  }

  const rows = (projectsResult.data ?? []).map((project) => {
    const prep = prepsByProjectId.get(project.id) ?? null;
    const notion = readNotionSourceDefaults(project.notion_source);
    const savedSurvey = readAssessmentSurveyConfig(project.notion_source);
    const surveyPath = prep?.active_version_id && savedSurvey?.versionId === prep.active_version_id
      ? `/assessment/${project.id}/${createAssessmentSurveyToken(project.id, prep.active_version_id)}`
      : null;
    const answerCount = answerCountByProject.get(project.id) ?? 0;
    const commentCount = answerCount > 0 ? answerCount : commentCountByProject.get(project.id) ?? 0;
    const aiDraftCount = aiDraftCommentIdsByProject.get(project.id)?.size ?? 0;
    const teacherConfirmedCount = teacherConfirmedCommentIdsByProject.get(project.id)?.size ?? 0;
    const designDone = Boolean(prep?.active_version_id);
    const distributionDone = Boolean(surveyPath || notion.response_collection_url || notion.database_url);
    const collectionDone = commentCount > 0;
    const aiDone = commentCount > 0 && aiDraftCount >= commentCount;
    const feedbackDone = commentCount > 0 && teacherConfirmedCount >= commentCount;

    return {
      project,
      prep,
      notion,
      surveyPath,
      commentCount,
      answerCount,
      aiDraftCount,
      teacherConfirmedCount,
      designDone,
      steps: [
        {
          label: "평가 바로 하기",
          description: distributionDone
            ? "학생용 질문지 또는 응답 링크가 연결되어 있습니다."
            : "학생용 질문지를 만들거나 기존 응답 링크를 연결하세요.",
          state: distributionDone ? "done" : designDone ? "ready" : "waiting",
        },
        {
          label: "자동 채점",
          description: aiDone
            ? `AI 초안 ${aiDraftCount}개가 준비되었습니다.`
            : collectionDone
              ? `결과물 ${commentCount}개 중 AI 초안 ${aiDraftCount}개가 있습니다.`
              : "학생 결과물을 먼저 가져오세요.",
          state: aiDone ? "done" : collectionDone && designDone ? "ready" : "waiting",
        },
        {
          label: "교사 피드백",
          description: feedbackDone
            ? `교사 확정 ${teacherConfirmedCount}개가 완료되었습니다.`
            : collectionDone
              ? `결과물 ${commentCount}개 중 교사 확정 ${teacherConfirmedCount}개입니다.`
              : "채점할 결과물이 아직 없습니다.",
          state: feedbackDone ? "done" : collectionDone ? "ready" : "waiting",
        },
        {
          label: "생기부 기록",
          description: teacherConfirmedCount > 0
            ? "확정 평가를 성장 기록 보드에서 정리할 수 있습니다."
            : "교사 확정 평가가 생기면 기록으로 이어집니다.",
          state: teacherConfirmedCount > 0 ? "ready" : "waiting",
        },
      ] satisfies { label: string; description: string; state: StepState }[],
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-md border bg-card px-5 py-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold text-indigo-700">평가 운영</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">평가 바로 하기</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              평가 설계가 끝난 수업을 학생용 질문지 배포, 결과물 수집, 자동 채점, 교사 피드백, 생기부 기록으로 이어갑니다.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/prep">평가 설계로 돌아가기</Link>
          </Button>
        </div>
      </section>

      {message ? <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{message}</CardContent></Card> : null}
      {notice ? <Card className="border-teal-200 bg-teal-50"><CardContent className="p-4 text-sm text-teal-900">{notice}</CardContent></Card> : null}

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>운영할 평가가 없습니다</CardTitle>
            <CardDescription>먼저 수업활동을 만들고 평가 설계를 시작하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/dashboard/projects">수업활동 만들기</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map(({ project, prep, surveyPath, commentCount, answerCount, aiDraftCount, teacherConfirmedCount, steps }) => (
            <Card key={project.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <CardTitle>{project.title}</CardTitle>
                    <CardDescription className="mt-1">{project.description || "수업 설명 없음"}</CardDescription>
                  </div>
                  {prep?.active_version_id ? (
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                      설계 확정 v{prep.current_version}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                      설계 미확정
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">결과물</p>
                    <p className="mt-1 text-xl font-semibold">{commentCount}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">AI 초안</p>
                    <p className="mt-1 text-xl font-semibold">{aiDraftCount}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">교사 확정</p>
                    <p className="mt-1 text-xl font-semibold">{teacherConfirmedCount}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">기록 준비</p>
                    <p className="mt-1 text-xl font-semibold">{teacherConfirmedCount > 0 ? "가능" : "-"}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {steps.map((step) => (
                    <div key={step.label} className={`rounded-md border p-4 ${stepClass(step.state)}`}>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <StepIcon state={step.state} />
                        {step.label}
                      </div>
                      <p className="mt-2 text-xs leading-5">{step.description}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {prep?.active_version_id ? (
                    <Button asChild size="sm">
                      <Link href={`/dashboard/evaluation/${project.id}/worksheet`}>
                        <FileQuestion className="h-4 w-4" /> 온라인 평가지 생성
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" disabled><FileQuestion className="h-4 w-4" /> 온라인 평가지 생성</Button>
                  )}
                  <SurveyDistributionActions surveyPath={surveyPath} />
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/projects/${project.id}?view=${answerCount > 0 ? "answers" : "remaining"}`}>
                      <FileText className="h-4 w-4" /> 결과 평가 ({commentCount})
                    </Link>
                  </Button>
                  <form action={generateProjectAiDrafts}>
                    <select name="project_id" defaultValue={project.id} className="hidden" aria-hidden="true" tabIndex={-1}>
                      <option value={project.id}>{project.id}</option>
                    </select>
                    {answerCount > 0 ? (
                      <select name="return_view" defaultValue="answers" className="hidden" aria-hidden="true" tabIndex={-1}>
                        <option value="answers">answers</option>
                      </select>
                    ) : null}
                    <Button type="submit" size="sm" disabled={commentCount === 0}>
                      <Sparkles className="h-4 w-4" /> 전체 AI 초안 만들기
                    </Button>
                  </form>
                  {surveyPath ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/evaluation/${project.id}/worksheet?print=1`}>
                        <Printer className="h-4 w-4" /> 평가지 출력
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled><Printer className="h-4 w-4" /> 평가지 출력</Button>
                  )}
                  <Button asChild size="sm">
                    <Link href={`/dashboard/projects/${project.id}?view=remaining`}>
                      자동 채점·피드백 <Sparkles className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/growth">
                      생기부 기록 <MessageSquareText className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <NotionEvaluationImportPanel
          projects={rows.map(({ project, notion, commentCount, aiDraftCount, teacherConfirmedCount, designDone }) => ({
            id: project.id,
            title: project.title,
            description: project.description,
            commentCount,
            aiDraftCount,
            teacherConfirmedCount,
            designReady: designDone,
            defaults: notion,
          }))}
          configured={notionConnection.configured}
          connectionLabel={notionConnection.workspaceLabel}
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        {["온라인 평가지 생성", "학생 배포", "자동 채점·피드백", "생기부 기록"].map((label, index) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                {index + 1}
              </span>
              <span className="text-sm font-semibold">{label}</span>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
