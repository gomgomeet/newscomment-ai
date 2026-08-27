import type { Database } from "@/lib/db/types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];

export type ProjectProgress = {
  project: Project;
  commentCount: number;
  evaluatedCount: number;
  remainingCount: number;
  completionRate: number;
  lastEvaluationAt: string | null;
};

export type CriterionSummary = {
  criterion: Criterion;
  average: number;
  maxScore: number;
  percentage: number;
  count: number;
};

export type EvaluationSummary = {
  evaluation: Evaluation;
  comment: Comment | null;
  percentage: number;
};

export type DistributionBucket = {
  label: string;
  count: number;
  tone: string;
};

export function summarizeProjectProgress({
  projects,
  comments,
  evaluations,
}: {
  projects: Project[];
  comments: Comment[];
  evaluations: Evaluation[];
}) {
  const commentsByProject = groupBy(comments, (comment) => comment.project_id);
  const evaluationsByProject = groupBy(evaluations, (evaluation) => evaluation.project_id);

  return projects.map((project): ProjectProgress => {
    const projectComments = commentsByProject.get(project.id) ?? [];
    const evaluatedCommentIds = new Set(
      (evaluationsByProject.get(project.id) ?? []).map((evaluation) => evaluation.comment_id),
    );
    const lastEvaluationAt =
      (evaluationsByProject.get(project.id) ?? [])
        .map((evaluation) => evaluation.updated_at)
        .sort()
        .at(-1) ?? null;

    return {
      project,
      commentCount: projectComments.length,
      evaluatedCount: evaluatedCommentIds.size,
      remainingCount: Math.max(projectComments.length - evaluatedCommentIds.size, 0),
      completionRate: projectComments.length > 0 ? evaluatedCommentIds.size / projectComments.length : 0,
      lastEvaluationAt,
    };
  });
}

export function buildProjectReport({
  comments,
  evaluations,
  criteria,
  scores,
}: {
  comments: Comment[];
  evaluations: Evaluation[];
  criteria: Criterion[];
  scores: Score[];
}) {
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const scoreByEvaluation = groupBy(scores, (score) => score.evaluation_id);
  const maxTotalScore = criteria.reduce((total, criterion) => total + criterion.max_score, 0);
  const evaluatedCommentIds = new Set(evaluations.map((evaluation) => evaluation.comment_id));
  const completionRate = comments.length > 0 ? evaluatedCommentIds.size / comments.length : 0;

  const evaluationSummaries = evaluations
    .map((evaluation): EvaluationSummary => {
      const totalScore =
        typeof evaluation.total_score === "number"
          ? evaluation.total_score
          : (scoreByEvaluation.get(evaluation.id) ?? []).reduce((total, score) => total + score.score, 0);
      const percentage = maxTotalScore > 0 ? totalScore / maxTotalScore : 0;

      return {
        evaluation: { ...evaluation, total_score: totalScore },
        comment: commentById.get(evaluation.comment_id) ?? null,
        percentage,
      };
    })
    .sort((a, b) => (a.evaluation.total_score ?? 0) - (b.evaluation.total_score ?? 0));

  const scoresByCriterion = groupBy(scores, (score) => score.criterion_id);
  const criterionSummaries = criteria
    .map((criterion): CriterionSummary => {
      const criterionScores = scoresByCriterion.get(criterion.id) ?? [];
      const total = criterionScores.reduce((sum, score) => sum + score.score, 0);
      const average = criterionScores.length > 0 ? total / criterionScores.length : 0;
      const percentage = criterion.max_score > 0 ? average / criterion.max_score : 0;

      return {
        criterion,
        average,
        maxScore: criterion.max_score,
        percentage,
        count: criterionScores.length,
      };
    })
    .sort((a, b) => a.percentage - b.percentage);

  return {
    commentCount: comments.length,
    evaluatedCount: evaluatedCommentIds.size,
    remainingCount: Math.max(comments.length - evaluatedCommentIds.size, 0),
    completionRate,
    maxTotalScore,
    distribution: buildDistribution(evaluationSummaries),
    criterionSummaries,
    priorityStudents: evaluationSummaries.slice(0, 5),
    standoutComments: [...evaluationSummaries].reverse().slice(0, 3),
  };
}

function buildDistribution(evaluations: EvaluationSummary[]): DistributionBucket[] {
  const buckets = [
    { label: "0-39%", count: 0, tone: "bg-destructive" },
    { label: "40-59%", count: 0, tone: "bg-amber-500" },
    { label: "60-79%", count: 0, tone: "bg-sky-500" },
    { label: "80-100%", count: 0, tone: "bg-emerald-600" },
  ];

  for (const evaluation of evaluations) {
    const percentage = Math.max(0, Math.min(evaluation.percentage, 1));
    const index = percentage < 0.4 ? 0 : percentage < 0.6 ? 1 : percentage < 0.8 ? 2 : 3;
    buckets[index].count += 1;
  }

  return buckets;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const values = grouped.get(key);
    if (values) {
      values.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return grouped;
}
