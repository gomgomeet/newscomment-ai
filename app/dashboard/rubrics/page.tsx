import { RubricForm } from "@/components/rubrics/rubric-form";
import { RubricList } from "@/components/rubrics/rubric-list";
import { requireUser } from "@/lib/auth/require-user";

export default async function RubricsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: rubrics, error } = await supabase
    .from("rubrics")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Rubrics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            평가 기준 묶음과 배점을 관리합니다.
          </p>
        </div>
        <RubricList rubrics={rubrics ?? []} />
      </section>
      <RubricForm message={message} />
    </div>
  );
}
