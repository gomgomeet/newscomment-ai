import { updateCriterion } from "@/app/dashboard/rubrics/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/db/types";

type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];

export function CriteriaList({ criteria }: { criteria: Criterion[] }) {
  if (criteria.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>평가 기준이 없습니다</CardTitle>
          <CardDescription>오른쪽 양식에서 루브릭 기준을 추가하세요.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {criteria.map((criterion, index) => (
        <Card key={criterion.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  {index + 1}. {criterion.label}
                </CardTitle>
                <CardDescription>{criterion.description}</CardDescription>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {criterion.max_score}점
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={updateCriterion} className="space-y-3 rounded-md border border-border p-3">
              <input type="hidden" name="rubric_id" value={criterion.rubric_id} />
              <input type="hidden" name="criterion_id" value={criterion.id} />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_110px]">
                <div className="space-y-2">
                  <Label htmlFor={`label_${criterion.id}`}>기준명</Label>
                  <Input id={`label_${criterion.id}`} name="label" required defaultValue={criterion.label} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`max_score_${criterion.id}`}>최대 점수</Label>
                  <Input
                    id={`max_score_${criterion.id}`}
                    name="max_score"
                    type="number"
                    min={1}
                    max={100}
                    required
                    defaultValue={criterion.max_score}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`sort_order_${criterion.id}`}>정렬</Label>
                  <Input
                    id={`sort_order_${criterion.id}`}
                    name="sort_order"
                    type="number"
                    min={0}
                    required
                    defaultValue={criterion.sort_order}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`description_${criterion.id}`}>설명</Label>
                <Textarea
                  id={`description_${criterion.id}`}
                  name="description"
                  required
                  defaultValue={criterion.description}
                />
              </div>
              <Button type="submit" variant="outline" size="sm">기준 수정</Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
