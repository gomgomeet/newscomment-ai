import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database, Json } from "@/lib/db/types";

type Prep = Database["public"]["Tables"]["assessment_preps"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];
type Rubric = Database["public"]["Tables"]["rubrics"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];

function readStandards(value: Json) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, Json | undefined>;
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const textValue = record.text ?? record.summary;
    const text = typeof textValue === "string" ? textValue.trim() : "";
    return code || text ? [{ code, text }] : [];
  });
}

export function AssessmentPrepOverview({
  prep,
  project,
  rubric,
  criteria,
}: {
  prep: Prep;
  project: Project;
  rubric: Rubric | null;
  criteria: Criterion[];
}) {
  const standards = readStandards(prep.achievement_standards);
  const createdAt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date(project.created_at));

  return (
    <div className="space-y-5">
      <div className="border-b pb-5">
        <p className="text-sm text-muted-foreground">{createdAt}</p>
        <h2 className="mt-1 text-2xl font-semibold">{project.title}</h2>
      </div>

      <Card>
        <CardHeader><CardTitle>1. 수업 맥락</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-md bg-muted px-2.5 py-1 font-medium">{prep.grade_level || "학년 미설정"}</span>
            <span className="rounded-md bg-muted px-2.5 py-1 font-medium">{prep.subject || "교과 미설정"}</span>
          </div>
          <p className="whitespace-pre-line text-sm leading-7">{prep.lesson_context || "저장된 수업 맥락이 없습니다."}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. 성취기준과 평가 목표</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">성취기준</h3>
            {standards.length > 0 ? (
              <div className="divide-y rounded-md border">
                {standards.map((standard, index) => (
                  <div key={`${standard.code}-${index}`} className="px-4 py-3 text-sm leading-6">
                    {standard.code ? <span className="mr-2 font-semibold">[{standard.code.replace(/^\[|\]$/g, "")}]</span> : null}
                    {standard.text}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">저장된 성취기준이 없습니다.</p>}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">평가 목표</h3>
            <p className="rounded-md bg-muted/40 px-4 py-3 text-sm leading-7">
              {prep.evaluation_goal || "저장된 평가 목표가 없습니다."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. 평가 루브릭</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rubric ? (
            <>
              <p className="font-semibold">{rubric.title}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {criteria.map((criterion, index) => (
                  <div key={criterion.id} className="rounded-md border p-4">
                    <div>
                      <p className="text-xs text-muted-foreground">평가 요소 {index + 1}</p>
                      <p className="mt-1 font-semibold">{criterion.label}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{criterion.description}</p>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">저장된 루브릭이 없습니다.</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end border-t pt-5">
        <Button asChild>
          <Link href={`/dashboard/prep/${prep.id}?mode=edit`}><Pencil className="h-4 w-4" /> 수정</Link>
        </Button>
      </div>
    </div>
  );
}
