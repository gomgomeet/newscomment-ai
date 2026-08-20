import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";

export default async function EvaluationPage() {
  const { supabase, user } = await requireUser();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (projectsError) {
    throw new Error(projectsError.message);
  }

  const rubricIds = Array.from(
    new Set((projects ?? []).map((project) => project.rubric_id).filter(Boolean)),
  ) as string[];
  const { data: rubrics, error: rubricsError } = rubricIds.length
    ? await supabase.from("rubrics").select("id, title").in("id", rubricIds)
    : { data: [], error: null };

  if (rubricsError) {
    throw new Error(rubricsError.message);
  }

  const rubricTitleById = new Map((rubrics ?? []).map((rubric) => [rubric.id, rubric.title]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Evaluation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            프로젝트를 선택해 댓글 입력과 기준별 평가 저장을 진행합니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/projects">프로젝트 관리</Link>
        </Button>
      </div>
      {(projects ?? []).length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>평가할 프로젝트가 없습니다</CardTitle>
            <CardDescription>먼저 프로젝트를 생성하고 루브릭을 연결하세요.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(projects ?? []).map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <CardTitle className="text-base">{project.title}</CardTitle>
                <CardDescription>{project.description || "설명 없음"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <p>루브릭: {project.rubric_id ? rubricTitleById.get(project.rubric_id) ?? "연결됨" : "미선택"}</p>
                  <p>상태: {project.status}</p>
                </div>
                <Button asChild variant={project.rubric_id ? "default" : "outline"}>
                  <Link href={`/dashboard/projects/${project.id}`}>
                    {project.rubric_id ? "평가 시작" : "프로젝트 열기"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
