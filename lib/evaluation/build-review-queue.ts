import type { Database } from "@/lib/db/types";
import type {
  ReviewQueueAiEvaluation,
  ReviewQueueItem,
  ReviewQueueTeacherEvaluation,
} from "@/lib/evaluation/review-queue-types";
import { readAssessmentSurveyConfig } from "./assessment-survey-config.ts";
import { readNotionResultMetadata } from "../notion/result-metadata.ts";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];

function keepLatest(
  map: Map<string, Evaluation>,
  evaluation: Evaluation,
) {
  const current = map.get(evaluation.comment_id);
  if (!current || current.updated_at < evaluation.updated_at) {
    map.set(evaluation.comment_id, evaluation);
  }
}

function hasAnyReason(reasons: string[], patterns: RegExp[]) {
  return reasons.some((reason) => patterns.some((pattern) => pattern.test(reason)));
}

function criteriaForComment(project: Project, comment: Comment, criteria: Criterion[]) {
  const metadata = comment.metadata;
  const survey = readAssessmentSurveyConfig(project.notion_source);
  if (
    !survey
    || !metadata
    || typeof metadata !== "object"
    || Array.isArray(metadata)
    || metadata.source !== "assessment-survey"
    || typeof metadata.question_number !== "number"
  ) {
    return criteria.map((criterion) => ({ criterion, maxScore: criterion.max_score }));
  }

  const selectedIds = new Set(survey.questionCriteria[metadata.question_number - 1] ?? []);
  const selected = criteria.filter((criterion) => selectedIds.has(criterion.id));
  return (selected.length > 0 ? selected : criteria).map((criterion) => ({
    criterion,
    maxScore: selected.length > 0 ? 4 : criterion.max_score,
  }));
}

export function buildEvaluationReviewQueue({
  projects,
  comments,
  evaluations,
  scores,
  criteria,
}: {
  projects: Project[];
  comments: Comment[];
  evaluations: Evaluation[];
  scores: Score[];
  criteria: Criterion[];
}): ReviewQueueItem[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const teacherByComment = new Map<string, Evaluation>();
  const aiByComment = new Map<string, Evaluation>();

  for (const evaluation of evaluations) {
    keepLatest(
      evaluation.source === "teacher-manual" ? teacherByComment : aiByComment,
      evaluation,
    );
  }

  const scoresByEvaluation = new Map<string, Map<string, Score>>();
  for (const score of scores) {
    const byCriterion = scoresByEvaluation.get(score.evaluation_id) ?? new Map<string, Score>();
    byCriterion.set(score.criterion_id, score);
    scoresByEvaluation.set(score.evaluation_id, byCriterion);
  }

  const criteriaByRubric = new Map<string, Criterion[]>();
  for (const criterion of criteria) {
    const rubricCriteria = criteriaByRubric.get(criterion.rubric_id) ?? [];
    rubricCriteria.push(criterion);
    criteriaByRubric.set(criterion.rubric_id, rubricCriteria);
  }
  for (const rubricCriteria of criteriaByRubric.values()) {
    rubricCriteria.sort((a, b) => a.sort_order - b.sort_order);
  }

  return comments
    .flatMap((comment) => {
      const project = projectById.get(comment.project_id);
      if (!project) return [];

      const teacherEvaluation = teacherByComment.get(comment.id) ?? null;
      const aiEvaluation = aiByComment.get(comment.id) ?? null;
      const teacherScores = teacherEvaluation
        ? scoresByEvaluation.get(teacherEvaluation.id)
        : undefined;
      const aiScores = aiEvaluation ? scoresByEvaluation.get(aiEvaluation.id) : undefined;
      const rubricCriteria = project.rubric_id
        ? (criteriaByRubric.get(project.rubric_id) ?? [])
        : [];
      const appliedCriteria = criteriaForComment(project, comment, rubricCriteria);

      const ai: ReviewQueueAiEvaluation | null = aiEvaluation
        ? {
            totalScore: aiEvaluation.total_score,
            feedback: aiEvaluation.feedback,
            evaluationForward: aiEvaluation.evaluation_forward,
            status: aiEvaluation.status,
            confidence: aiEvaluation.confidence,
            modelName: aiEvaluation.model_name,
            reviewReasons: aiEvaluation.review_reasons,
          }
        : null;
      const teacher: ReviewQueueTeacherEvaluation | null = teacherEvaluation
        ? {
            totalScore: teacherEvaluation.total_score,
            feedback: teacherEvaluation.feedback,
            evaluationForward: teacherEvaluation.evaluation_forward,
            status: teacherEvaluation.status,
            revision: teacherEvaluation.revision,
            changeReason: teacherEvaluation.change_reason,
            confirmedAt: teacherEvaluation.confirmed_at,
          }
        : null;

      const scoreDifference =
        teacher?.totalScore != null && ai?.totalScore != null
          ? teacher.totalScore - ai.totalScore
          : null;
      const studentMissing = !comment.student_name?.trim();
      const aiReasons = ai?.reviewReasons ?? [];
      const evidenceConcern = hasAnyReason(
        aiReasons,
        [/근거/i, /출처/i, /손상/i, /evidence/i, /source/i],
      );
      const rewriteRecommended = hasAnyReason(
        aiReasons,
        [/재작성/i, /불완전/i, /손상/i, /rewrite/i],
      );
      const growthReady =
        teacher?.status === "confirmed" &&
        Boolean(teacher.evaluationForward?.trim()) &&
        !studentMissing;

      const priorityReasons = new Set<string>();
      const teacherResolvedAiConcern =
        teacherEvaluation?.status === "confirmed" && Boolean(teacherEvaluation.change_reason?.trim());
      if (!teacherEvaluation) {
        priorityReasons.add(aiEvaluation ? "교사 미확정" : "채점 시작 필요");
      } else if (teacherEvaluation.status !== "confirmed") {
        priorityReasons.add("교사 재확정 필요");
      }
      if (!teacherResolvedAiConcern && ai?.confidence != null && ai.confidence < 0.7) {
        priorityReasons.add("낮은 AI 확신도");
      }
      if (!teacherResolvedAiConcern && scoreDifference != null && Math.abs(scoreDifference) >= 2) {
        priorityReasons.add("교사·AI 점수 차이");
      }
      if (studentMissing) priorityReasons.add("학생 식별자 누락");
      if (teacherEvaluation?.status === "confirmed" && !teacherEvaluation.evaluation_forward?.trim()) {
        priorityReasons.add("평가 포워드 확인");
      }
      if (!teacherResolvedAiConcern) {
        for (const reason of aiReasons) priorityReasons.add(reason);
      }
      const teacherReview = priorityReasons.size > 0;

      const updatedAt = [comment.updated_at, aiEvaluation?.updated_at, teacherEvaluation?.updated_at]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? comment.updated_at;

      const item: ReviewQueueItem = {
        commentId: comment.id,
        projectId: project.id,
        projectTitle: project.title,
        studentLabel: comment.student_name?.trim() || "학생 식별자 없음",
        content: comment.content,
        createdAt: comment.created_at,
        updatedAt,
        notionPageUrl: readNotionResultMetadata(comment.metadata).pageUrl,
        ai,
        teacher,
        scoreDifference,
        priorityReasons: Array.from(priorityReasons),
        signals: {
          teacherReview,
          evidenceConcern,
          rewriteRecommended,
          growthReady,
        },
        criteria: appliedCriteria.map(({ criterion, maxScore }) => ({
          id: criterion.id,
          label: criterion.label,
          maxScore,
          teacherScore: teacherScores?.get(criterion.id)?.score ?? null,
          aiScore: aiScores?.get(criterion.id)?.score ?? null,
          teacherRationale: teacherScores?.get(criterion.id)?.rationale ?? null,
          aiRationale: aiScores?.get(criterion.id)?.rationale ?? null,
        })),
      };

      return [item];
    })
    .sort((a, b) => {
      if (a.signals.teacherReview !== b.signals.teacherReview) {
        return a.signals.teacherReview ? -1 : 1;
      }
      if (a.priorityReasons.length !== b.priorityReasons.length) {
        return b.priorityReasons.length - a.priorityReasons.length;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
