import Link from "next/link";
import { BarChart3, CheckCircle2, ListFilter, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";
import { AssessmentPrepBanner } from "@/components/assessment-prep/prep-banner";
import { BulkCommentForm } from "@/components/comments/bulk-comment-form";
import { CommentForm } from "@/components/comments/comment-form";
import { NotionCommentImportForm } from "@/components/comments/notion-comment-import-form";
import { SourceCommentImportForm } from "@/components/comments/source-comment-import-form";
import { CommentEvaluationList } from "@/components/evaluations/comment-evaluation-list";
import { ProjectEditForm } from "@/components/projects/project-edit-form";
import { generateProjectAiDrafts } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildAssessmentPrepReadiness,
  isNotionResultMetadata,
} from "@/lib/assessment-prep/readiness";
import { requireUser } from "@/lib/auth/require-user";
import { buildProjectReport } from "@/lib/evaluation-dashboard";
import { readNotionSourceDefaults } from "@/lib/notion/project-source";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ message?: string; notice?: string; filter?: string }>;
}) {
  const { projectId } = await params;
  const { message, notice, filter } = await searchParams;
  const initialEvaluationView = filter === "remaining" ? "remaining" : "priority";
  const { supabase, user } = await requireUser();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (error || !project) {
    notFound();
  }

  const { data: rubric } = project.rubric_id
    ? await supabase
        .from("rubrics")
        .select("id, title, generation_context")
        .eq("id", project.rubric_id)
        .eq("owner_id", user.id)
        .single()
    : { data: null };

  const { data: rubrics, error: rubricsError } = await supabase
    .from("rubrics")
    .select("id, title")
    .eq("owner_id", user.id)
    .order("title", { ascending: true });

  if (rubricsError) {
    throw new Error(rubricsError.message);
  }

  const { data: criteria, error: criteriaError } = project.rubric_id
    ? await supabase
        .from("rubric_criteria")
        .select("*")
        .eq("rubric_id", project.rubric_id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (criteriaError) {
    throw new Error(criteriaError.message);
  }

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (commentsError) {
    throw new Error(commentsError.message);
  }

  const { data: evaluations, error: evaluationsError } = await supabase
    .from("evaluations")
    .select("*")
    .eq("project_id", project.id)
    .eq("evaluator_id", user.id);

  if (evaluationsError) {
    throw new Error(evaluationsError.message);
  }

  const { data: savedPrep, error: savedPrepError } = await supabase
    .from("assessment_preps")
    .select("*")
    .eq("project_id", project.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (savedPrepError) {
    throw new Error(savedPrepError.message);
  }

  const evaluationIds = (evaluations ?? []).map((evaluation) => evaluation.id);
  const teacherEvaluations = (evaluations ?? []).filter((evaluation) => evaluation.source === "teacher-manual");
  const aiEvaluations = (evaluations ?? []).filter((evaluation) => evaluation.source === "ai-draft");
  const { data: scores, error: scoresError } = evaluationIds.length
    ? await supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds)
    : { data: [], error: null };

  if (scoresError) {
    throw new Error(scoresError.message);
  }

  const report = buildProjectReport({
    comments: comments ?? [],
    evaluations: teacherEvaluations,
    criteria: criteria ?? [],
    scores: scores ?? [],
  });
  const progressPercentage = Math.round(report.completionRate * 100);
  const maxBucketCount = Math.max(...report.distribution.map((bucket) => bucket.count), 1);

  const prepReadiness = buildAssessmentPrepReadiness({
    project,
    rubricGenerationContext: rubric?.generation_context,
    criterionCount: (criteria ?? []).length,
    notionConnectionConfigured: Boolean(process.env.NOTION_API_KEY),
    notionResultCount: (comments ?? []).filter((comment) => isNotionResultMetadata(comment.metadata)).length,
    teacherEvaluationCount: teacherEvaluations.length,
    assessmentPrep: savedPrep,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-muted-foreground">Project detail</p>
            <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
          </div>
          <Button asChild variant="outline">
            <Link href={`/dashboard/projects/${project.id}/results`}>최종결과 보기</Link>
          </Button>
        </div>
        {message ? (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">{message}</CardContent>
          </Card>
        ) : null}
        {notice ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">{notice}</CardContent>
          </Card>
        ) : null}
        <AssessmentPrepBanner readiness={prepReadiness} />
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div><p className="font-semibold">AI 평가 초안 일괄 만들기</p><p className="mt-1 text-sm text-muted-foreground">현재 활성 평가안으로 아직 초안이 없는 결과물을 최대 20개까지 개별 처리합니다. 한 건 실패해도 나머지는 계속됩니다.</p></div>
            <form action={generateProjectAiDrafts}><input type="hidden" name="project_id" value={project.id} /><Button type="submit" variant="outline" disabled={!process.env.OPENAI_API_KEY || !savedPrep?.active_version_id}>미초안 전체 생성</Button></form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>수업활동 정보</CardTitle>
            <CardDescription>{project.description || "설명이 없습니다."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <p><span className="font-medium">상태:</span> {project.status}</p>
            <p><span className="font-medium">루브릭:</span> {rubric?.title || "미선택"}</p>
            <p><span className="font-medium">댓글 수:</span> {(comments ?? []).length}</p>
            <p><span className="font-medium">교사 확정:</span> {teacherEvaluations.length}</p>
            <p><span className="font-medium">소스 URL:</span> {project.source_url || "미등록"}</p>
            <p><span className="font-medium">생성일:</span> {new Date(project.created_at).toLocaleString("ko-KR")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>수업활동 리포트</CardTitle>
                <CardDescription>교사 확정 평가 기준의 진행률, 점수 분포, 먼저 볼 학생을 모았습니다.</CardDescription>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-sm font-medium text-muted-foreground">
                {progressPercentage}% 완료
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <UsersRound className="size-4 text-primary" aria-hidden="true" />
                <p className="mt-3 text-2xl font-semibold">{report.commentCount}</p>
                <p className="text-xs text-muted-foreground">가져온 결과물</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                <p className="mt-3 text-2xl font-semibold">{report.evaluatedCount}</p>
                <p className="text-xs text-muted-foreground">교사 확정</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <ListFilter className="size-4 text-primary" aria-hidden="true" />
                <p className="mt-3 text-2xl font-semibold">{report.remainingCount}</p>
                <p className="text-xs text-muted-foreground">남은 결과물</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${progressPercentage}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">여러 날에 나눠 확정해도 이곳에서 이어갈 수 있습니다.</p>
            </div>
            {report.evaluatedCount > 0 ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" aria-hidden="true" />
                    <h3 className="text-sm font-semibold">점수 분포</h3>
                  </div>
                  <div className="space-y-3">
                    {report.distribution.map((bucket) => (
                      <div key={bucket.label} className="grid grid-cols-[64px_minmax(0,1fr)_32px] items-center gap-3 text-sm">
                        <span className="text-xs text-muted-foreground">{bucket.label}</span>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full ${bucket.tone}`}
                            style={{ width: `${Math.max((bucket.count / maxBucketCount) * 100, bucket.count > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                        <span className="text-right text-xs font-medium">{bucket.count}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">먼저 볼 학생</h3>
                  <div className="space-y-2">
                    {report.priorityStudents.map((row) => (
                      <div key={row.evaluation.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{row.comment?.student_name || "이름 없는 결과물"}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {row.evaluation.total_score ?? 0} / {report.maxTotalScore}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">
                교사 평가를 확정하면 점수 분포와 먼저 볼 학생 목록이 표시됩니다.
              </div>
            )}
          </CardContent>
        </Card>
        {!project.rubric_id ? (
          <Card>
            <CardHeader>
              <CardTitle>루브릭 연결 필요</CardTitle>
              <CardDescription>
                기준별 평가를 저장하려면 수업활동을 만들 때 루브릭을 고르거나, 나중에 수정에서 연결해야 합니다.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        <CommentEvaluationList
          projectId={project.id}
          comments={comments ?? []}
          criteria={criteria ?? []}
          teacherEvaluations={teacherEvaluations}
          aiEvaluations={aiEvaluations}
          scores={scores ?? []}
          initialView={initialEvaluationView}
        />
      </section>
      <aside className="space-y-4">
        <ProjectEditForm project={project} rubrics={rubrics ?? []} />
        <NotionCommentImportForm
          projectId={project.id}
          defaults={readNotionSourceDefaults(project.notion_source)}
          configured={Boolean(process.env.NOTION_API_KEY)}
        />
        <SourceCommentImportForm projectId={project.id} sourceUrl={project.source_url} />
        <CommentForm projectId={project.id} />
        <BulkCommentForm projectId={project.id} />
      </aside>
    </div>
  );
}
