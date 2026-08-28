import type { Database, Json } from "@/lib/db/types";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];

export type ProjectEvaluationReport = ReturnType<typeof buildProjectEvaluationReport>;

function readMetadataText(metadata: Json, key: string) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, Json | undefined>)[key];
  return typeof value === "string" && value ? value : null;
}

function clampPercentage(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

function contentExcerpt(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 180)}…` : normalized;
}

export function buildProjectEvaluationReport({
  comments,
  criteria,
  evaluations,
  scores,
}: {
  comments: Comment[];
  criteria: Criterion[];
  evaluations: Evaluation[];
  scores: Score[];
}) {
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const scoresByEvaluationId = new Map<string, Score[]>();

  for (const score of scores) {
    const evaluationScores = scoresByEvaluationId.get(score.evaluation_id) ?? [];
    evaluationScores.push(score);
    scoresByEvaluationId.set(score.evaluation_id, evaluationScores);
  }

  const maxTotal = criteria.reduce((sum, criterion) => sum + criterion.max_score, 0);
  const evaluatedRows = evaluations
    .map((evaluation) => {
      const comment = commentById.get(evaluation.comment_id);
      if (!comment) return null;

      const evaluationScores = scoresByEvaluationId.get(evaluation.id) ?? [];
      const totalScore =
        evaluation.total_score ?? evaluationScores.reduce((sum, score) => sum + score.score, 0);
      const percentage = maxTotal > 0 ? clampPercentage((totalScore / maxTotal) * 100) : 0;
      const weakest = evaluationScores
        .map((score) => {
          const criterion = criterionById.get(score.criterion_id);
          const maxScore = criterion?.max_score ?? 1;
          return {
            label: criterion?.label ?? "알 수 없는 기준",
            percentage: maxScore > 0 ? clampPercentage((score.score / maxScore) * 100) : 0,
          };
        })
        .sort((a, b) => a.percentage - b.percentage)[0];

      return {
        evaluationId: evaluation.id,
        commentId: comment.id,
        studentName: comment.student_name || "이름 없는 결과물",
        totalScore,
        percentage,
        weakestCriterion: weakest?.label ?? "기준별 점수 없음",
        feedback: evaluation.feedback,
        excerpt: contentExcerpt(comment.content),
        sourceUrl: readMetadataText(comment.metadata, "notion_page_url"),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const averageTotal =
    evaluatedRows.length > 0
      ? evaluatedRows.reduce((sum, row) => sum + row.totalScore, 0) / evaluatedRows.length
      : 0;

  const distributionRanges = [
    { key: "90-100", label: "90–100%", min: 90, max: 101 },
    { key: "80-89", label: "80–89%", min: 80, max: 90 },
    { key: "60-79", label: "60–79%", min: 60, max: 80 },
    { key: "40-59", label: "40–59%", min: 40, max: 60 },
    { key: "0-39", label: "0–39%", min: 0, max: 40 },
  ];
  const distribution = distributionRanges.map((range) => {
    const count = evaluatedRows.filter(
      (row) => row.percentage >= range.min && row.percentage < range.max,
    ).length;
    return {
      ...range,
      count,
      share: evaluatedRows.length > 0 ? (count / evaluatedRows.length) * 100 : 0,
    };
  });

  const criterionAggregates = new Map<string, { total: number; count: number }>();
  for (const score of scores) {
    const current = criterionAggregates.get(score.criterion_id) ?? { total: 0, count: 0 };
    criterionAggregates.set(score.criterion_id, {
      total: current.total + score.score,
      count: current.count + 1,
    });
  }

  const criterionSummaries = criteria
    .map((criterion) => {
      const aggregate = criterionAggregates.get(criterion.id) ?? { total: 0, count: 0 };
      const average = aggregate.count > 0 ? aggregate.total / aggregate.count : 0;
      return {
        id: criterion.id,
        label: criterion.label,
        description: criterion.description,
        average,
        maxScore: criterion.max_score,
        percentage:
          criterion.max_score > 0 ? clampPercentage((average / criterion.max_score) * 100) : 0,
        count: aggregate.count,
      };
    })
    .filter((criterion) => criterion.count > 0)
    .sort((a, b) => a.percentage - b.percentage);

  return {
    submittedCount: comments.length,
    evaluatedCount: evaluatedRows.length,
    completionRate: comments.length > 0 ? (evaluatedRows.length / comments.length) * 100 : 0,
    maxTotal,
    averageTotal,
    averagePercentage: maxTotal > 0 ? clampPercentage((averageTotal / maxTotal) * 100) : 0,
    distribution,
    criterionSummaries,
    priorityStudents: [...evaluatedRows]
      .sort((a, b) => a.percentage - b.percentage || a.studentName.localeCompare(b.studentName, "ko"))
      .slice(0, 5),
    highlights: [...evaluatedRows]
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3)
      .map((row, index) => ({ ...row, exampleLabel: `예시 후보 ${index + 1}` })),
  };
}
