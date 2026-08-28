import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { projectStatusLabels } from "@/lib/constants/project-status";
import type { Database } from "@/lib/db/types";

type Project = Database["public"]["Tables"]["projects"]["Row"];

export function ProjectList({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>수업활동이 없습니다</CardTitle>
          <CardDescription>오른쪽에서 첫 수업활동을 만들어 주세요.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle className="text-base">{project.title}</CardTitle>
              <CardDescription>{project.description || "설명 없음"}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>상태: {projectStatusLabels[project.status]}</span>
                <span>생성: {new Date(project.created_at).toLocaleDateString("ko-KR")}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
