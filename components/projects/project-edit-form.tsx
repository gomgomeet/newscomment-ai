import { updateProject } from "@/app/dashboard/projects/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/db/types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Rubric = Database["public"]["Tables"]["rubrics"]["Row"];

export function ProjectEditForm({
  project,
  rubrics,
}: {
  project: Project;
  rubrics: Pick<Rubric, "id" | "title">[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>프로젝트 수정</CardTitle>
        <CardDescription>제목, 루브릭, 상태를 업데이트합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateProject} className="space-y-4">
          <input type="hidden" name="project_id" value={project.id} />
          <div className="space-y-2">
            <Label htmlFor="edit_title">프로젝트 제목</Label>
            <Input id="edit_title" name="title" required defaultValue={project.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_description">설명</Label>
            <Textarea id="edit_description" name="description" defaultValue={project.description ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_source_url">뉴스 또는 Notion URL</Label>
            <Input id="edit_source_url" name="source_url" type="url" defaultValue={project.source_url ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_rubric_id">루브릭</Label>
            <Select id="edit_rubric_id" name="rubric_id" defaultValue={project.rubric_id ?? ""}>
              <option value="">미선택</option>
              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_status">상태</Label>
            <Select id="edit_status" name="status" defaultValue={project.status}>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </Select>
          </div>
          <Button type="submit" variant="outline">수정 저장</Button>
        </form>
      </CardContent>
    </Card>
  );
}
