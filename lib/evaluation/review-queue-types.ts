export type ReviewQueueCriterion = {
  id: string;
  label: string;
  maxScore: number;
  teacherScore: number | null;
  aiScore: number | null;
  teacherRationale: string | null;
  aiRationale: string | null;
};

export type ReviewQueueEvaluation = {
  totalScore: number | null;
  feedback: string | null;
  evaluationForward: string | null;
  status: "draft" | "confirmed";
};

export type ReviewQueueAiEvaluation = ReviewQueueEvaluation & {
  confidence: number | null;
  modelName: string | null;
  reviewReasons: string[];
};

export type ReviewQueueTeacherEvaluation = ReviewQueueEvaluation & {
  revision: number;
  changeReason: string | null;
  confirmedAt: string | null;
};

export type ReviewQueueItem = {
  commentId: string;
  projectId: string;
  projectTitle: string;
  studentLabel: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  notionPageUrl: string | null;
  ai: ReviewQueueAiEvaluation | null;
  teacher: ReviewQueueTeacherEvaluation | null;
  scoreDifference: number | null;
  priorityReasons: string[];
  signals: {
    teacherReview: boolean;
    evidenceConcern: boolean;
    rewriteRecommended: boolean;
    growthReady: boolean;
  };
  criteria: ReviewQueueCriterion[];
};
