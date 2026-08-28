import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type ProjectProgress = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  commentCount: number;
  evaluatedCount: number;
  remainingCount: number;
  progress: number;
  lastEvaluatedAt: string | null;
};

export function ProjectProgressCard({ project }: { project: ProjectProgress }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <CardTitle className="text-base">{project.title}</CardTitle>
            <CardDescription>{project.description || "설명 없음"}</CardDescription>
          </div>
          <span className="rounded-md bg-muted px-2 py-1 text-sm font-medium text-muted-foreground">
            {project.progress}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>댓글 {project.commentCount}</span>
            <span>채점 {project.evaluatedCount}</span>
            <span>남음 {project.remainingCount}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${project.progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {project.lastEvaluatedAt
              ? `마지막 채점 ${new Date(project.lastEvaluatedAt).toLocaleString("ko-KR")}`
              : "아직 저장된 교사 평가가 없습니다."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/dashboard/projects/${project.id}?filter=unevaluated`}>남은 댓글 채점</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/projects/${project.id}`}>전체 보기</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
