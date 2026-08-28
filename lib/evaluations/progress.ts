import type { ProjectProgress } from "@/components/dashboard/project-progress-card";
import type { Database } from "@/lib/db/types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Comment = Pick<Database["public"]["Tables"]["comments"]["Row"], "id" | "project_id">;
type Evaluation = Pick<
  Database["public"]["Tables"]["evaluations"]["Row"],
  "comment_id" | "project_id" | "updated_at"
>;

export function buildProjectProgress(
  projects: Project[],
  comments: Comment[],
  evaluations: Evaluation[],
): ProjectProgress[] {
  const commentsByProject = new Map<string, Comment[]>();
  const evaluatedCommentIdsByProject = new Map<string, Set<string>>();
  const lastEvaluationAtByProject = new Map<string, string>();

  for (const comment of comments) {
    const projectComments = commentsByProject.get(comment.project_id) ?? [];
    projectComments.push(comment);
    commentsByProject.set(comment.project_id, projectComments);
  }

  for (const evaluation of evaluations) {
    const evaluatedCommentIds = evaluatedCommentIdsByProject.get(evaluation.project_id) ?? new Set<string>();
    evaluatedCommentIds.add(evaluation.comment_id);
    evaluatedCommentIdsByProject.set(evaluation.project_id, evaluatedCommentIds);

    const currentLastEvaluatedAt = lastEvaluationAtByProject.get(evaluation.project_id);
    if (
      !currentLastEvaluatedAt ||
      new Date(evaluation.updated_at).getTime() > new Date(currentLastEvaluatedAt).getTime()
    ) {
      lastEvaluationAtByProject.set(evaluation.project_id, evaluation.updated_at);
    }
  }

  return projects.map((project) => {
    const commentCount = commentsByProject.get(project.id)?.length ?? 0;
    const evaluatedCount = evaluatedCommentIdsByProject.get(project.id)?.size ?? 0;
    const remainingCount = Math.max(commentCount - evaluatedCount, 0);
    const progress = commentCount === 0 ? 0 : Math.round((evaluatedCount / commentCount) * 100);

    return {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      created_at: project.created_at,
      commentCount,
      evaluatedCount,
      remainingCount,
      progress,
      lastEvaluatedAt: lastEvaluationAtByProject.get(project.id) ?? null,
    };
  });
}
