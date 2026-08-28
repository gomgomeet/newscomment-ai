import { importNotionPageForEvaluation } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NotionPageEvaluationForm({
  projectId,
  configured,
  rubricReady,
}: {
  projectId: string;
  configured: boolean;
  rubricReady: boolean;
}) {
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>1순위 · Notion 페이지 바로 평가</CardTitle>
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">이번 연수 실습</span>
        </div>
        <CardDescription>
          학생 결과물 페이지의 전체 본문을 가져와 성취기준별 AI 평가 초안을 만듭니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={importNotionPageForEvaluation} className="space-y-4">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="notion_page_url">학생 Notion 페이지 링크</Label>
            <Input
              id="notion_page_url"
              name="notion_page_url"
              type="url"
              required
              placeholder="https://www.notion.so/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notion_student_name">학생 식별명</Label>
            <Input id="notion_student_name" name="student_name" placeholder="예: 3반 12번 (실명 대신 권장)" />
          </div>
          <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              name="generate_ai_draft"
              value="yes"
              defaultChecked={rubricReady}
              disabled={!rubricReady}
            />
            <span>
              <span className="block font-medium">가져온 뒤 AI 평가 초안 바로 생성</span>
              <span className="text-xs leading-5 text-muted-foreground">
                {rubricReady ? "루브릭의 성취기준별 점수·근거·피드백을 생성합니다." : "먼저 이 수업활동에 루브릭을 연결해 주세요."}
              </span>
            </span>
          </label>
          {!configured ? (
            <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
              서버에 NOTION_API_KEY를 설정하고, 페이지의 공유 → 연결에서 해당 Notion 통합을 추가해야 합니다.
            </p>
          ) : null}
          <Button type="submit" disabled={!configured}>페이지 읽고 평가하기</Button>
        </form>
      </CardContent>
    </Card>
  );
}
