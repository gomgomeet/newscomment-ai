import { ProjectForm } from "@/components/projects/project-form";
import { ProjectList } from "@/components/projects/project-list";
import { requireUser } from "@/lib/auth/require-user";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const { data: rubrics, error: rubricsError } = await supabase
    .from("rubrics")
    .select("id, title")
    .eq("owner_id", user.id)
    .order("title", { ascending: true });

  if (rubricsError) {
    throw new Error(rubricsError.message);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">수업활동</h2>
        <ProjectList projects={projects ?? []} />
      </section>
      <ProjectForm message={message} rubrics={rubrics ?? []} />
    </div>
  );
}
