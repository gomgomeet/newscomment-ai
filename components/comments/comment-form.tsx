import { addComment } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CommentForm({ projectId }: { projectId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>댓글 추가</CardTitle>
        <CardDescription>평가할 학생 댓글을 직접 입력합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={addComment} className="space-y-4">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="student_name">학생 이름</Label>
            <Input id="student_name" name="student_name" placeholder="선택 입력" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">댓글 내용</Label>
            <Textarea
              id="content"
              name="content"
              required
              placeholder="학생이 작성한 뉴스 댓글을 입력하세요."
            />
          </div>
          <Button type="submit">댓글 저장</Button>
        </form>
      </CardContent>
    </Card>
  );
}
