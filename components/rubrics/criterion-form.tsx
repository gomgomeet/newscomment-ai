import { addCriterion } from "@/app/dashboard/rubrics/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CriterionForm({
  rubricId,
  message,
}: {
  rubricId: string;
  message?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>평가 기준 추가</CardTitle>
        <CardDescription>기준명, 설명, 최대 점수를 입력합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={addCriterion} className="space-y-4">
          <input type="hidden" name="rubric_id" value={rubricId} />
          <div className="space-y-2">
            <Label htmlFor="label">기준명</Label>
            <Input id="label" name="label" required placeholder="예: 근거의 적절성" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Textarea id="description" name="description" required placeholder="학생 댓글에서 확인할 구체적인 평가 기준을 적어 주세요." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_score">최대 점수</Label>
            <Input id="max_score" name="max_score" type="number" min={1} max={100} defaultValue={5} required />
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <Button type="submit">기준 추가</Button>
        </form>
      </CardContent>
    </Card>
  );
}
