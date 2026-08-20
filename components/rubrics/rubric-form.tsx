import { createRubric } from "@/app/dashboard/rubrics/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RubricForm({ message }: { message?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>새 루브릭</CardTitle>
        <CardDescription>댓글 평가에 사용할 기준 묶음을 생성합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createRubric} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">루브릭 제목</Label>
            <Input id="title" name="title" required placeholder="예: 뉴스 댓글 비판적 사고 루브릭" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Textarea id="description" name="description" placeholder="평가 목적과 수업 맥락을 적어 주세요." />
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <Button type="submit">루브릭 생성</Button>
        </form>
      </CardContent>
    </Card>
  );
}
