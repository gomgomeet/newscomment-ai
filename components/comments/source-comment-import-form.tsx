import { importCommentsFromSource } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SourceCommentImportForm({
  projectId,
  sourceUrl,
}: {
  projectId: string;
  sourceUrl: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>댓글 자동 가져오기</CardTitle>
        <CardDescription>
          공개 TXT, CSV, TSV, JSON URL에서 댓글을 가져와 저장합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={importCommentsFromSource} className="space-y-4">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="source_url">소스 URL</Label>
            <Input
              id="source_url"
              name="source_url"
              type="url"
              defaultValue={sourceUrl ?? ""}
              placeholder="https://example.com/comments.csv"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              형식: 한 줄에 댓글 하나, 학생명+탭+댓글, 학생명+쉼표+댓글, 또는 comments 배열 JSON.
            </p>
          </div>
          <Button type="submit">자동 가져오기</Button>
        </form>
      </CardContent>
    </Card>
  );
}
