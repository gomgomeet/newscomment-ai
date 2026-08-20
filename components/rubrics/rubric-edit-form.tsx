import { updateRubric } from "@/app/dashboard/rubrics/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/db/types";

type Rubric = Database["public"]["Tables"]["rubrics"]["Row"];

export function RubricEditForm({ rubric }: { rubric: Rubric }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>루브릭 수정</CardTitle>
        <CardDescription>루브릭 제목과 설명을 업데이트합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateRubric} className="space-y-4">
          <input type="hidden" name="rubric_id" value={rubric.id} />
          <div className="space-y-2">
            <Label htmlFor="edit_rubric_title">루브릭 제목</Label>
            <Input id="edit_rubric_title" name="title" required defaultValue={rubric.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_rubric_description">설명</Label>
            <Textarea
              id="edit_rubric_description"
              name="description"
              defaultValue={rubric.description ?? ""}
            />
          </div>
          <Button type="submit" variant="outline">루브릭 수정</Button>
        </form>
      </CardContent>
    </Card>
  );
}
