import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createNewAssessmentPrep, openAssessmentPrep } from "@/app/dashboard/prep/actions";
import { DeleteAssessmentPrepButton } from "@/components/assessment-prep/prep-list-actions";
import { requireUser } from "@/lib/auth/require-user";

export default async function AssessmentPrepPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { message, notice } = await searchParams;
  const { supabase, user } = await requireUser();
  const [projectsResult, rubricsResult, prepsResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, description, status, rubric_id, notion_source, created_at, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("rubrics")
      .select("id, title")
      .eq("owner_id", user.id),
    supabase
      .from("assessment_preps")
      .select("*")
      .eq("owner_id", user.id),
  ]);

  const queryError = projectsResult.error
    ?? rubricsResult.error
    ?? prepsResult.error;
  if (queryError) throw new Error(queryError.message);

  const projects = projectsResult.data ?? [];
  const rubrics = rubricsResult.data ?? [];
  const prepByProjectId = new Map((prepsResult.data ?? []).map((prep) => [prep.project_id, prep]));
  const rubricById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));

  const rows = projects.map((project) => {
    const rubric = project.rubric_id ? rubricById.get(project.rubric_id) : null;
    const prep = prepByProjectId.get(project.id) ?? null;
    return { project, rubric, prep };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">평가 설계</h2>
          <form action={createNewAssessmentPrep}>
            <Button type="submit"><Plus className="h-4 w-4" /> 새 평가 설계</Button>
          </form>
        </div>

        {message ? <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{message}</CardContent></Card> : null}
        {notice ? <Card className="border-teal-200 bg-teal-50"><CardContent className="p-4 text-sm text-teal-900">{notice}</CardContent></Card> : null}

        {rows.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>아직 준비할 수업활동이 없습니다</CardTitle>
              <CardDescription>수업활동을 만든 뒤 평가 목표와 루브릭, Notion 결과물 DB를 연결하세요.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild><Link href="/dashboard/projects">첫 수업활동 만들기</Link></Button></CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map(({ project, rubric, prep }) => (
              <Card key={project.id} id={`project-${project.id}`} className="relative overflow-hidden transition-colors hover:border-teal-300 hover:bg-teal-50/30">
                {prep ? (
                  <>
                    <div className="absolute right-3 top-3 z-10">
                      <DeleteAssessmentPrepButton prepId={prep.id} title={project.title} />
                    </div>
                    <Link href={`/dashboard/prep/${prep.id}`} className="block h-full p-5 pr-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex h-full flex-col justify-between gap-5">
                      <div>
                        <CardTitle className="text-lg">{project.title}</CardTitle>
                        <CardDescription className="mt-2 line-clamp-2 leading-6">
                          {project.description || prep.lesson_context || "저장된 평가 설계 내용을 확인합니다."}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                          <span>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(project.created_at))}</span>
                          <span>{[prep.grade_level, prep.subject].filter(Boolean).join(" · ") || "설계 작성 중"}</span>
                          {rubric ? <span className="rounded-md bg-teal-50 px-2 py-1 font-medium text-teal-800">루브릭 완료</span> : null}
                        </div>
                        <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                          설계 내용 보기 <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                    </Link>
                  </>
                ) : (
                  <form action={openAssessmentPrep} className="h-full">
                    <input type="hidden" name="project_id" value={project.id} />
                    <button type="submit" className="flex h-full w-full flex-col justify-between gap-5 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <div>
                        <CardTitle className="text-lg">{project.title}</CardTitle>
                        <CardDescription className="mt-2 line-clamp-2 leading-6">{project.description || "새 평가 설계를 시작합니다."}</CardDescription>
                      </div>
                      <div className="flex w-full items-center justify-between border-t pt-4 text-sm">
                        <span className="text-muted-foreground">설계 전</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-teal-800">평가 설계 시작 <ArrowRight className="h-4 w-4" /></span>
                      </div>
                    </button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
