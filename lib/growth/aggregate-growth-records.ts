import type { Database } from "@/lib/db/types";
import { buildEvidenceBasedActivityRecord } from "@/lib/growth/student-records";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type AssessmentPrep = Database["public"]["Tables"]["assessment_preps"]["Row"];

export type GrowthRecordActivity = {
  id: string;
  title: string;
  subject: string;
  commentCount: number;
  evaluatedCount: number;
  completionPercentage: number;
  averagePercentage: number | null;
  weakestCriterion: string | null;
  reviewCount: number;
  forwardSamples: string[];
};

export type GrowthRecordStudent = {
  studentKey: string;
  activityCount: number;
  subjectCount: number;
  evaluationCount: number;
  averagePercentage: number | null;
  strongestCriterion: string | null;
  needsAttentionCriterion: string | null;
  latestActivityTitle: string;
  latestEvaluatedAt: string;
  latestFeedback: string | null;
  latestEvaluationForward: string | null;
  changePercentage: number | null;
  reviewReasons: string[];
};

export type GrowthRecordActivitySpecial = {
  studentKey: string;
  projectId: string;
  activityTitle: string;
  subject: string;
  gradeLevel: string;
  evaluationIds: string[];
  confirmedAt: string;
  recordText: string;
  evidenceSummary: string;
};

type CriterionAggregate = { label: string; totalPercentage: number; count: number };

function clampPercentage(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function normalizeStudentKey(value: string | null) {
  return value?.trim().replace(/\s+/g, " ") || null;
}

function projectSubject(prep: AssessmentPrep | undefined) {
  return prep?.subject.trim() || "교과 미설정";
}

function studentAnswer(comment: Comment | undefined) {
  if (!comment) return "";
  const metadata = comment.metadata;
  if (
    metadata
    && typeof metadata === "object"
    && !Array.isArray(metadata)
    && metadata.source === "assessment-survey"
    && typeof metadata.answer === "string"
  ) {
    return metadata.answer.trim();
  }
  return comment.content.trim();
}

function addCriterionScore(
  aggregates: Map<string, CriterionAggregate>,
  score: Score,
  criterionById: Map<string, Criterion>,
) {
  const criterion = criterionById.get(score.criterion_id);
  if (!criterion || criterion.max_score <= 0) return;

  const current = aggregates.get(criterion.id) ?? {
    label: criterion.label,
    totalPercentage: 0,
    count: 0,
  };
  current.totalPercentage += clampPercentage((score.score / criterion.max_score) * 100);
  current.count += 1;
  aggregates.set(criterion.id, current);
}

function criterionExtremes(aggregates: Map<string, CriterionAggregate>) {
  const rows = Array.from(aggregates.values()).map((row) => ({
    ...row,
    percentage: row.count > 0 ? row.totalPercentage / row.count : 0,
  }));

  return {
    strongest: rows.length > 0 ? rows.reduce((best, row) => row.percentage > best.percentage ? row : best).label : null,
    weakest: rows.length > 0 ? rows.reduce((worst, row) => row.percentage < worst.percentage ? row : worst).label : null,
  };
}

export function aggregateGrowthRecords({
  projects,
  comments,
  evaluations,
  scores,
  criteria,
  preps,
}: {
  projects: Project[];
  comments: Comment[];
  evaluations: Evaluation[];
  scores: Score[];
  criteria: Criterion[];
  preps: AssessmentPrep[];
}) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const prepByProjectId = new Map(preps.map((prep) => [prep.project_id, prep]));
  const scoresByEvaluation = new Map<string, Score[]>();

  for (const score of scores) {
    const rows = scoresByEvaluation.get(score.evaluation_id) ?? [];
    rows.push(score);
    scoresByEvaluation.set(score.evaluation_id, rows);
  }

  const maxScoreByProject = new Map<string, number>();
  for (const project of projects) {
    const maxScore = criteria
      .filter((criterion) => criterion.rubric_id === project.rubric_id)
      .reduce((sum, criterion) => sum + criterion.max_score, 0);
    maxScoreByProject.set(project.id, maxScore);
  }

  const evaluationPercentage = new Map<string, number>();
  const reviewReasonsByEvaluation = new Map<string, string[]>();
  for (const evaluation of evaluations) {
    const maxScore = maxScoreByProject.get(evaluation.project_id) ?? 0;
    const percentage =
      maxScore > 0 && evaluation.total_score != null
        ? clampPercentage((evaluation.total_score / maxScore) * 100)
        : null;
    if (percentage != null) evaluationPercentage.set(evaluation.id, percentage);

    const expectedCriterionCount = criteria.filter(
      (criterion) => criterion.rubric_id === projectById.get(evaluation.project_id)?.rubric_id,
    ).length;
    const reasons: string[] = [];
    for (const reason of evaluation.review_reasons) reasons.push(reason);
    if (!evaluation.feedback?.trim()) reasons.push("종합 피드백 확인");
    if ((scoresByEvaluation.get(evaluation.id)?.length ?? 0) < expectedCriterionCount) reasons.push("기준 점수 누락");
    if (percentage != null && percentage < 60) reasons.push("보완 관찰 필요");
    reviewReasonsByEvaluation.set(evaluation.id, reasons);
  }

  const activities: GrowthRecordActivity[] = projects.map((project) => {
    const projectComments = comments.filter((comment) => comment.project_id === project.id);
    const projectEvaluations = evaluations.filter((evaluation) => evaluation.project_id === project.id);
    const evaluatedCommentIds = new Set(projectEvaluations.map((evaluation) => evaluation.comment_id));
    const criterionAggregates = new Map<string, CriterionAggregate>();
    for (const evaluation of projectEvaluations) {
      for (const score of scoresByEvaluation.get(evaluation.id) ?? []) {
        addCriterionScore(criterionAggregates, score, criterionById);
      }
    }

    const percentages = projectEvaluations
      .map((evaluation) => evaluationPercentage.get(evaluation.id))
      .filter((value): value is number => value != null);

    return {
      id: project.id,
      title: project.title,
      subject: projectSubject(prepByProjectId.get(project.id)),
      commentCount: projectComments.length,
      evaluatedCount: evaluatedCommentIds.size,
      completionPercentage:
        projectComments.length > 0 ? Math.round((evaluatedCommentIds.size / projectComments.length) * 100) : 0,
      averagePercentage: average(percentages),
      weakestCriterion: criterionExtremes(criterionAggregates).weakest,
      reviewCount: projectEvaluations.filter(
        (evaluation) => (reviewReasonsByEvaluation.get(evaluation.id)?.length ?? 0) > 0,
      ).length,
      forwardSamples: Array.from(new Set(
        projectEvaluations
          .map((evaluation) => evaluation.evaluation_forward?.trim())
          .filter((value): value is string => Boolean(value)),
      )).slice(0, 3),
    };
  });

  const studentBuckets = new Map<string, Evaluation[]>();
  const activityBuckets = new Map<string, { studentKey: string; projectId: string; evaluations: Evaluation[] }>();
  let unnamedResultCount = 0;
  for (const evaluation of evaluations) {
    const studentKey = normalizeStudentKey(commentById.get(evaluation.comment_id)?.student_name ?? null);
    if (!studentKey) {
      unnamedResultCount += 1;
      continue;
    }
    const rows = studentBuckets.get(studentKey) ?? [];
    rows.push(evaluation);
    studentBuckets.set(studentKey, rows);

    const activityBucketKey = `${studentKey}\u0000${evaluation.project_id}`;
    const activityBucket = activityBuckets.get(activityBucketKey) ?? {
      studentKey,
      projectId: evaluation.project_id,
      evaluations: [],
    };
    activityBucket.evaluations.push(evaluation);
    activityBuckets.set(activityBucketKey, activityBucket);
  }

  const activitySpecialRecords: GrowthRecordActivitySpecial[] = Array.from(activityBuckets.values()).map((bucket) => {
    const criterionLabels = bucket.evaluations.flatMap((evaluation) =>
      (scoresByEvaluation.get(evaluation.id) ?? []).flatMap((score) => {
        const criterion = criterionById.get(score.criterion_id);
        return criterion ? [criterion.label] : [];
      }),
    );
    const answerTexts = bucket.evaluations.flatMap((evaluation) => {
      const content = studentAnswer(commentById.get(evaluation.comment_id));
      return content ? [content] : [];
    });
    const uniqueCriteria = Array.from(new Set(criterionLabels));
    const activityTitle = projectById.get(bucket.projectId)?.title ?? "평가활동";
    const prep = prepByProjectId.get(bucket.projectId);

    return {
      studentKey: bucket.studentKey,
      projectId: bucket.projectId,
      activityTitle,
      subject: projectSubject(prep),
      gradeLevel: prep?.grade_level.trim() || "",
      evaluationIds: bucket.evaluations.map((evaluation) => evaluation.id),
      confirmedAt: bucket.evaluations
        .map((evaluation) => evaluation.confirmed_at ?? evaluation.updated_at)
        .toSorted()
        .at(-1) ?? "",
      recordText: buildEvidenceBasedActivityRecord({ activityTitle, answerTexts, criterionLabels: uniqueCriteria }),
      evidenceSummary: `교사 확정 답안 ${bucket.evaluations.length}건${uniqueCriteria.length > 0 ? ` · ${uniqueCriteria.slice(0, 3).join(" · ")}` : ""}`,
    };
  }).toSorted((a, b) => {
    const studentOrder = a.studentKey.localeCompare(b.studentKey, "ko");
    return studentOrder !== 0 ? studentOrder : b.confirmedAt.localeCompare(a.confirmedAt);
  });

  const students: GrowthRecordStudent[] = Array.from(studentBuckets.entries()).map(([studentKey, rows]) => {
    const sortedRows = rows.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at));
    const latest = sortedRows[0];
    const criterionAggregates = new Map<string, CriterionAggregate>();
    const reviewReasons = new Set<string>();
    const percentages: number[] = [];

    for (const evaluation of rows) {
      const percentage = evaluationPercentage.get(evaluation.id);
      if (percentage != null) percentages.push(percentage);
      for (const reason of reviewReasonsByEvaluation.get(evaluation.id) ?? []) reviewReasons.add(reason);
      for (const score of scoresByEvaluation.get(evaluation.id) ?? []) {
        addCriterionScore(criterionAggregates, score, criterionById);
      }
    }

    const extremes = criterionExtremes(criterionAggregates);
    const chronologicalPercentages = rows
      .toSorted((a, b) => a.updated_at.localeCompare(b.updated_at))
      .map((evaluation) => evaluationPercentage.get(evaluation.id))
      .filter((value): value is number => value != null);
    return {
      studentKey,
      activityCount: new Set(rows.map((evaluation) => evaluation.project_id)).size,
      subjectCount: new Set(rows.map((evaluation) => projectSubject(prepByProjectId.get(evaluation.project_id)))).size,
      evaluationCount: rows.length,
      averagePercentage: average(percentages),
      strongestCriterion: extremes.strongest,
      needsAttentionCriterion: extremes.weakest,
      latestActivityTitle: projectById.get(latest.project_id)?.title ?? "수업활동 없음",
      latestEvaluatedAt: latest.updated_at,
      latestFeedback: latest.feedback?.trim() || null,
      latestEvaluationForward: latest.evaluation_forward?.trim() || null,
      changePercentage: chronologicalPercentages.length >= 2
        ? chronologicalPercentages.at(-1)! - chronologicalPercentages[0]
        : null,
      reviewReasons: Array.from(reviewReasons),
    };
  });

  students.sort((a, b) => {
    if (a.reviewReasons.length !== b.reviewReasons.length) return b.reviewReasons.length - a.reviewReasons.length;
    return (a.averagePercentage ?? 101) - (b.averagePercentage ?? 101);
  });

  return {
    activities: activities.toSorted((a, b) => b.reviewCount - a.reviewCount),
    activitySpecialRecords,
    students,
    reviewStudentCount: students.filter((student) => student.reviewReasons.length > 0).length,
    unnamedResultCount,
  };
}
