import Link from "next/link";
import { notFound } from "next/navigation";
import { BulkCommentForm } from "@/components/comments/bulk-comment-form";
import { CommentForm } from "@/components/comments/comment-form";
import { NotionCommentImportForm } from "@/components/comments/notion-comment-import-form";
import { NotionPageEvaluationForm } from "@/components/comments/notion-page-evaluation-form";
import { SourceCommentImportForm } from "@/components/comments/source-comment-import-form";
import { CommentEvaluationList } from "@/components/evaluations/comment-evaluation-list";
import { ProjectEditForm } from "@/components/projects/project-edit-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { readNotionSourceDefaults } from "@/lib/notion/project-source";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ filter?: string; message?: string; notice?: string }>;
}) {
  const { projectId } = await params;
  const { filter, message, notice } = await searchParams;
  const evaluationFilter = filter === "unevaluated" ? "unevaluated" : "all";
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
        .select("id, title")
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

  const evaluationIds = (evaluations ?? []).map((evaluation) => evaluation.id);
  const { data: scores, error: scoresError } = evaluationIds.length
    ? await supabase.from("evaluation_scores").select("*").in("evaluation_id", evaluationIds)
    : { data: [], error: null };

  if (scoresError) {
    throw new Error(scoresError.message);
  }

  const teacherEvaluations = (evaluations ?? []).filter((evaluation) => evaluation.source === "teacher-manual");
  const aiEvaluations = (evaluations ?? []).filter((evaluation) => evaluation.source === "ai-draft");
  const evaluatedCommentIds = new Set(teacherEvaluations.map((evaluation) => evaluation.comment_id));
  const commentCount = (comments ?? []).length;
  const evaluatedCount = evaluatedCommentIds.size;
  const remainingCount = Math.max(commentCount - evaluatedCount, 0);
  const progress = commentCount === 0 ? 0 : Math.round((evaluatedCount / commentCount) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-muted-foreground">Project detail</p>
            <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
          </div>
          <Button asChild variant="outline">
            <Link href={`/dashboard/projects/${project.id}/report`}>학급 리포트</Link>
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
        <Card>
          <CardHeader>
            <CardTitle>수업활동 정보</CardTitle>
            <CardDescription>{project.description || "설명이 없습니다."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <p><span className="font-medium">상태:</span> {project.status}</p>
            <p><span className="font-medium">루브릭:</span> {rubric?.title || "미선택"}</p>
            <p><span className="font-medium">댓글 수:</span> {(comments ?? []).length}</p>
            <p><span className="font-medium">교사 평가:</span> {evaluatedCount}개 / 남음 {remainingCount}개 ({progress}%)</p>
            <p><span className="font-medium">소스 URL:</span> {project.source_url || "미등록"}</p>
            <p><span className="font-medium">생성일:</span> {new Date(project.created_at).toLocaleString("ko-KR")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>평가자료 연결 방법</CardTitle>
            <CardDescription>자료가 있는 곳에 따라 세 경로를 사용합니다. 이번 연수는 Notion 페이지 실습에 집중합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm font-semibold">1. Notion 페이지 링크</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">전체 블록을 읽고 성취기준별 AI 초안을 즉시 생성합니다.</p>
              <span className="mt-3 inline-block rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">지금 사용 가능 · 실습 중점</span>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-semibold">2. Google Sheets</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">학생별 행·탭과 수정 이력을 묶어 참여 과정과 결과를 분석합니다.</p>
              <span className="mt-3 inline-block rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">다음 단계 · 링크/CSV 입력</span>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-semibold">3. 이미지·PDF·Word</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">캡처의 글자와 파일 전체를 읽어 출처 위치가 있는 평가 근거로 정리합니다.</p>
              <span className="mt-3 inline-block rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">다음 단계 · 파일 업로드</span>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col justify-between gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold">채점 작업대</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              남은 댓글만 보거나 전체 댓글을 보면서 교사 평가를 이어갈 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant={evaluationFilter === "unevaluated" ? "default" : "outline"} size="sm">
              <Link href={`/dashboard/projects/${project.id}?filter=unevaluated`}>안 한 것만 보기</Link>
            </Button>
            <Button asChild variant={evaluationFilter === "all" ? "default" : "outline"} size="sm">
              <Link href={`/dashboard/projects/${project.id}`}>전체 보기</Link>
            </Button>
          </div>
        </div>
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
          evaluations={teacherEvaluations}
          aiEvaluations={aiEvaluations}
          scores={scores ?? []}
          filter={evaluationFilter}
        />
      </section>
      <aside className="space-y-4">
        <ProjectEditForm project={project} rubrics={rubrics ?? []} />
        <NotionPageEvaluationForm
          projectId={project.id}
          configured={Boolean(process.env.NOTION_API_KEY)}
          rubricReady={Boolean(project.rubric_id && (criteria ?? []).length > 0)}
        />
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
