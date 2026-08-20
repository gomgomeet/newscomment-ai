import { importComments } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function BulkCommentForm({ projectId }: { projectId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>여러 댓글 가져오기</CardTitle>
        <CardDescription>한 줄에 댓글 하나를 붙여넣어 한 번에 저장합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={importComments} className="space-y-4">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="bulk_content">댓글 목록</Label>
            <Textarea
              id="bulk_content"
              name="bulk_content"
              className="min-h-44"
              placeholder={"학생명\t댓글 내용\n학생명,댓글 내용\n댓글 내용만 입력"}
              required
            />
          </div>
          <Button type="submit" variant="outline">가져오기</Button>
        </form>
      </CardContent>
    </Card>
  );
}
