import { createProject } from "@/app/dashboard/projects/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/db/types";

type Rubric = Database["public"]["Tables"]["rubrics"]["Row"];

export function ProjectForm({
  message,
  rubrics,
}: {
  message?: string;
  rubrics: Pick<Rubric, "id" | "title">[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>새 프로젝트</CardTitle>
        <CardDescription>평가할 뉴스 댓글 수업 단위를 생성합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createProject} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">프로젝트 제목</Label>
            <Input id="title" name="title" required placeholder="예: 5학년 뉴스 댓글 비판적 읽기" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Textarea id="description" name="description" placeholder="수업 목표, 평가 맥락, 학생 그룹 등을 기록하세요." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source_url">뉴스 또는 Notion URL</Label>
            <Input id="source_url" name="source_url" type="url" placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rubric_id">루브릭</Label>
            <Select id="rubric_id" name="rubric_id" defaultValue="">
              <option value="">나중에 선택</option>
              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.title}
                </option>
              ))}
            </Select>
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <Button type="submit">프로젝트 생성</Button>
        </form>
      </CardContent>
    </Card>
  );
}
