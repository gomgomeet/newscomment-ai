import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CriteriaList } from "@/components/rubrics/criteria-list";
import { CriterionForm } from "@/components/rubrics/criterion-form";
import { RubricEditForm } from "@/components/rubrics/rubric-edit-form";
import { requireUser } from "@/lib/auth/require-user";

export default async function RubricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ rubricId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { rubricId } = await params;
  const { message } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data: rubric, error: rubricError } = await supabase
    .from("rubrics")
    .select("*")
    .eq("id", rubricId)
    .eq("owner_id", user.id)
    .single();

  if (rubricError || !rubric) {
    notFound();
  }

  const { data: criteria, error: criteriaError } = await supabase
    .from("rubric_criteria")
    .select("*")
    .eq("rubric_id", rubric.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (criteriaError) {
    throw new Error(criteriaError.message);
  }

  const totalScore = (criteria ?? []).reduce((sum, criterion) => sum + criterion.max_score, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-muted-foreground">Rubric detail</p>
            <h2 className="text-2xl font-semibold tracking-tight">{rubric.title}</h2>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/rubrics">목록으로</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>루브릭 정보</CardTitle>
            <CardDescription>{rubric.description || "설명이 없습니다."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <p><span className="font-medium">기준 수:</span> {(criteria ?? []).length}</p>
            <p><span className="font-medium">총점:</span> {totalScore}</p>
            <p><span className="font-medium">생성일:</span> {new Date(rubric.created_at).toLocaleDateString("ko-KR")}</p>
          </CardContent>
        </Card>
        <CriteriaList criteria={criteria ?? []} />
      </section>
      <aside className="space-y-4">
        <RubricEditForm rubric={rubric} />
        <CriterionForm rubricId={rubric.id} message={message} />
      </aside>
    </div>
  );
}
