import { importCommentsFromNotion } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { NotionSourceDefaults } from "@/lib/notion/project-source";

export function NotionCommentImportForm({
  projectId,
  defaults,
  configured,
}: {
  projectId: string;
  defaults: NotionSourceDefaults;
  configured: boolean;
}) {
  return (
    <Card id="notion-import">
      <CardHeader>
        <CardTitle>Notion 결과물 읽어오기</CardTitle>
        <CardDescription>
          학생이 작성한 데이터베이스 속성 또는 각 페이지 본문을 읽어 평가할 결과물로 가져옵니다. Notion 원본은 수정하지 않습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {configured ? null : (
          <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
            서버에 <code>NOTION_API_KEY</code>가 설정되어 있지 않습니다. Notion 통합 토큰을 환경 변수에 추가한 뒤
            사용해 주세요.
          </p>
        )}
        <form action={importCommentsFromNotion} className="space-y-4">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="notion_database">Notion 데이터베이스 URL</Label>
            <Input
              id="notion_database"
              name="notion_database"
              defaultValue={defaults.database_url}
              placeholder="https://www.notion.so/workspace/1a2b3c..."
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Notion에서 데이터베이스를 열고 <span className="font-medium">공유 &rarr; 연결</span>로 통합을 추가한 뒤 URL을
              붙여넣어 주세요.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="content_mode">결과물이 작성된 위치</Label>
            <Select id="content_mode" name="content_mode" defaultValue={defaults.content_mode}>
              <option value="property">데이터베이스 속성</option>
              <option value="page_body">각 학생 페이지 본문</option>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              학생이 복제한 템플릿 페이지 안에서 작성했다면 <span className="font-medium">각 학생 페이지 본문</span>을 선택하세요.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="content_property">결과물 내용 속성</Label>
            <Input
              id="content_property"
              name="content_property"
              defaultValue={defaults.content_property}
              placeholder="댓글 또는 결과물"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              페이지 본문을 읽을 때는 이 값을 사용하지 않습니다.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="student_property">학생 이름 속성</Label>
              <Input
                id="student_property"
                name="student_property"
                defaultValue={defaults.student_property}
                placeholder="이름"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic_property">기사 주제 속성</Label>
              <Input
                id="topic_property"
                name="topic_property"
                defaultValue={defaults.topic_property}
                placeholder="주제"
              />
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            학생 이름과 기사 주제 속성은 선택 사항입니다. 비워 두면 저장하지 않습니다.
          </p>
          <Button type="submit">Notion 결과물 읽어오기</Button>
        </form>
      </CardContent>
    </Card>
  );
}
