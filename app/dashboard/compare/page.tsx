import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const [{ project: requestedProjectId }, { supabase, user }] = await Promise.all([
    searchParams,
    requireUser(),
  ]);

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (projectsError) throw new Error(projectsError.message);

  const projectIds = (projects ?? []).map((project) => project.id);
  if (projectIds.length === 0) redirect("/dashboard/evaluation");

  const requestedProject = requestedProjectId && projectIds.includes(requestedProjectId)
    ? requestedProjectId
    : null;
  if (requestedProject) redirect(`/dashboard/projects/${requestedProject}?view=answers`);

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("project_id, metadata")
    .in("project_id", projectIds);

  if (commentsError) throw new Error(commentsError.message);

  const projectsWithAnswers = new Set((comments ?? []).flatMap((comment) => {
    const metadata = comment.metadata;
    return metadata
      && typeof metadata === "object"
      && !Array.isArray(metadata)
      && metadata.source === "assessment-survey"
      ? [comment.project_id]
      : [];
  }));
  const targetProjectId = projectIds.find((projectId) => projectsWithAnswers.has(projectId));

  redirect(targetProjectId
    ? `/dashboard/projects/${targetProjectId}?view=answers`
    : "/dashboard/evaluation");
}
