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
  const templateUrl = readTemplateUrl(process.env.NIE_NOTION_TEMPLATE_URL);

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>1순위 · 복제한 Notion 템플릿 연결</CardTitle>
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">이번 연수 실습</span>
        </div>
        <CardDescription>
          제공된 NIE 템플릿을 평가 앱이 읽을 수 있는 Notion 워크스페이스에 복제한 뒤 연결합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium">먼저 NIE 템플릿을 복제하세요</p>
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            <li>강사가 안내한 공동 연수용 Notion 워크스페이스에 템플릿을 복제합니다.</li>
            <li>학생 결과물을 작성하고, 해당 페이지의 공유 → 연결에서 평가 앱 통합을 추가합니다.</li>
            <li>학생 페이지 링크를 복사해 아래 입력란에 붙여넣습니다.</li>
          </ol>
          {templateUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={templateUrl} target="_blank" rel="noreferrer">NIE 템플릿 복제하기</a>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">복제 링크는 연수 안내 자료에서 제공합니다.</p>
          )}
          <p className="text-xs text-muted-foreground">개인 워크스페이스 연결과 Notion 템플릿 자동 생성은 후속 기능입니다.</p>
        </div>
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

function readTemplateUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
