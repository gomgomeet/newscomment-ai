import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/lib/db/types";

type Rubric = Database["public"]["Tables"]["rubrics"]["Row"];

export function RubricList({ rubrics }: { rubrics: Rubric[] }) {
  if (rubrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>루브릭이 없습니다</CardTitle>
          <CardDescription>오른쪽 양식에서 첫 평가 루브릭을 생성하세요.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rubrics.map((rubric) => (
        <Link key={rubric.id} href={`/dashboard/rubrics/${rubric.id}`}>
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {rubric.title}
                {rubric.auto_generated ? (
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    자동 생성
                  </span>
                ) : null}
              </CardTitle>
              <CardDescription>{rubric.description || "설명 없음"}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
