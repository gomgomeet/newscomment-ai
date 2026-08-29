"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import {
  applyQuestionTeacherFeedback,
  confirmQuestionEvaluations,
  generateProjectAiDrafts,
} from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CommentEvaluationCard } from "@/components/evaluations/comment-evaluation-card";
import type { Database } from "@/lib/db/types";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];
type QuestionRubrics = Record<string, Record<"4" | "3" | "2" | "1", string>>[];

function readQuestionInfo(comment: Comment) {
  const metadata = comment.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { number: 0, prompt: "기타 답안" };
  const number = typeof metadata.question_number === "number" ? metadata.question_number : 0;
  const prompt = typeof metadata.survey_prompt === "string" && metadata.survey_prompt.trim()
    ? metadata.survey_prompt.trim()
    : "문항 정보 없음";
  return { number, prompt };
}

function compareStudentOrder(a: Comment, b: Comment) {
  const readNumber = (comment: Comment, key: "class_number" | "student_number") => {
    const metadata = comment.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return Number.MAX_SAFE_INTEGER;
    return typeof metadata[key] === "number" ? metadata[key] : Number.MAX_SAFE_INTEGER;
  };

  return readNumber(a, "student_number") - readNumber(b, "student_number")
    || readNumber(a, "class_number") - readNumber(b, "class_number")
    || (a.student_name ?? "").localeCompare(b.student_name ?? "", "ko");
}

export function CommentEvaluationList({
  projectId,
  comments,
  criteria,
  teacherEvaluations,
  aiEvaluations,
  scores,
  initialView = "priority",
  answerMode = false,
  questionCriteria = [],
  questionRubrics = [],
  questionTeacherGuidance = [],
}: {
  projectId: string;
  comments: Comment[];
  criteria: Criterion[];
  teacherEvaluations: Evaluation[];
  aiEvaluations: Evaluation[];
  scores: Score[];
  initialView?: "all" | "remaining" | "priority";
  answerMode?: boolean;
  questionCriteria?: string[][];
  questionRubrics?: QuestionRubrics;
  questionTeacherGuidance?: string[];
}) {
  const [view, setView] = useState<"all" | "remaining" | "priority">(initialView);

  if (comments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{answerMode ? "제출된 답안이 없습니다" : "댓글이 없습니다"}</CardTitle>
          <CardDescription>{answerMode ? "아직 제출된 온라인 평가지 답안이 없습니다." : "오른쪽 양식에서 평가할 댓글을 먼저 추가하세요."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const evaluatedCommentIds = new Set(teacherEvaluations.map((evaluation) => evaluation.comment_id));
  const confirmedCommentIds = new Set(
    teacherEvaluations
      .filter((evaluation) => evaluation.status === "confirmed")
      .map((evaluation) => evaluation.comment_id),
  );
  const remainingCount = comments.filter((comment) => !evaluatedCommentIds.has(comment.id)).length;
  const priorityCommentIds = new Set(aiEvaluations.filter((evaluation) => {
    const teacher = teacherEvaluations.find((item) => item.comment_id === evaluation.comment_id);
    if (teacher?.status === "confirmed") return false;
    const difference = teacher?.total_score != null && evaluation.total_score != null
      ? Math.abs(teacher.total_score - evaluation.total_score)
      : 0;
    return evaluation.review_reasons.length > 0 || (evaluation.confidence ?? 0) < 0.7 || difference >= 2;
  }).map((evaluation) => evaluation.comment_id));
  const priorityCount = priorityCommentIds.size;
  const visibleComments = view === "remaining"
    ? comments.filter((comment) => !evaluatedCommentIds.has(comment.id))
    : view === "priority"
      ? comments.filter((comment) => priorityCommentIds.has(comment.id))
      : comments;

  function renderComment(comment: Comment) {
    const teacherEvaluation = teacherEvaluations.find((item) => item.comment_id === comment.id);
    const aiEvaluation = aiEvaluations.find((item) => item.comment_id === comment.id);
    const teacherScores = teacherEvaluation
      ? scores.filter((score) => score.evaluation_id === teacherEvaluation.id)
      : [];
    const aiScores = aiEvaluation
      ? scores.filter((score) => score.evaluation_id === aiEvaluation.id)
      : [];

    return (
      <CommentEvaluationCard
        key={comment.id}
        projectId={projectId}
        comment={comment}
        criteria={criteria}
        evaluation={teacherEvaluation}
        scores={teacherScores}
        aiEvaluation={aiEvaluation}
        aiScores={aiScores}
        answerMode={answerMode}
        questionCriteria={questionCriteria}
        questionRubrics={questionRubrics}
      />
    );
  }

  const answerGroups = answerMode
    ? Array.from(visibleComments.reduce((groups, comment) => {
        const question = readQuestionInfo(comment);
        const group = groups.get(question.number) ?? { ...question, comments: [] as Comment[] };
        group.comments.push(comment);
        groups.set(question.number, group);
        return groups;
      }, new Map<number, { number: number; prompt: string; comments: Comment[] }>()).values())
        .map((group) => ({ ...group, comments: group.comments.sort(compareStudentOrder) }))
        .sort((a, b) => a.number - b.number)
    : [];

  return (
    <div className="space-y-4">
      <div className="sticky top-3 z-10 flex flex-col justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/95 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold">{answerMode ? "교사 피드백" : "채점 작업대"}</p>
          <p className="text-sm text-muted-foreground">
            전체 {comments.length}개 · 완료 {comments.length - remainingCount}개 · 남음 {remainingCount}개
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={view === "priority" ? "border-teal-300 bg-teal-100 text-teal-950 hover:bg-teal-200" : "bg-white/80"}
            onClick={() => setView("priority")}
          >
            {answerMode ? "확인 우선" : "교사 확인 우선"} ({priorityCount})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={view === "all" ? "border-teal-300 bg-teal-100 text-teal-950 hover:bg-teal-200" : "bg-white/80"}
            onClick={() => setView("all")}
          >
            {answerMode ? `모든 답안 (${comments.length})` : "전체 보기"}
          </Button>
          {!answerMode ? (
            <Button type="button" size="sm" variant={view === "remaining" ? "default" : "outline"} onClick={() => setView("remaining")}>
              미평가만 보기 ({remainingCount})
            </Button>
          ) : null}
          {answerMode ? (
            <form action={generateProjectAiDrafts}>
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="return_view" value="answers" />
              <input type="hidden" name="answers_only" value="true" />
              <Button type="submit" size="sm">
                <Sparkles className="h-4 w-4" /> AI 초안 평가
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {visibleComments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{view === "priority" ? "지금은 우선 확인할 결과물이 없습니다" : "모든 댓글을 채점했습니다"}</CardTitle>
            <CardDescription>전체 보기를 누르면 모든 결과물과 저장한 평가를 확인할 수 있습니다.</CardDescription>
          </CardHeader>
        </Card>
      ) : answerMode ? (
        <div className="space-y-8">
          {answerGroups.map((group) => (
            <section key={group.number} className="space-y-3">
              <div className="flex flex-col justify-between gap-3 border-b pb-3 lg:flex-row lg:items-start">
                <div>
                  <h3 className="text-lg font-semibold">{group.number ? `${group.number}번 문항` : "기타 답안"}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{group.prompt}</p>
                  <p className="mt-1 text-xs font-medium text-teal-700">학생 답안 {group.comments.length}개</p>
                </div>
                {group.number ? (
                  <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-start sm:justify-end lg:w-auto">
                    <form action={confirmQuestionEvaluations}>
                      <input type="hidden" name="project_id" value={projectId} />
                      <input type="hidden" name="question_number" value={group.number} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="bg-white"
                        disabled={group.comments.every((comment) => confirmedCommentIds.has(comment.id))}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {group.comments.every((comment) => confirmedCommentIds.has(comment.id)) ? "확인 완료" : "교사 확인"}
                      </Button>
                    </form>
                    <details className="w-full rounded-md border bg-background lg:w-[420px]">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-teal-800">
                        교사 피드백
                        {questionTeacherGuidance[group.number - 1] ? <span className="ml-2 text-xs font-medium text-muted-foreground">적용됨</span> : null}
                      </summary>
                      <form action={applyQuestionTeacherFeedback} className="space-y-3 border-t p-3">
                        <input type="hidden" name="project_id" value={projectId} />
                        <input type="hidden" name="question_number" value={group.number} />
                        <Textarea
                          name="teacher_guidance"
                          defaultValue={questionTeacherGuidance[group.number - 1] ?? ""}
                          maxLength={1000}
                          rows={4}
                          required
                          aria-label={`${group.number}번 문항 전체 교사 피드백`}
                          placeholder="예: 의견 표현 점수가 전체적으로 낮습니다. 각 평가 요소를 1점씩 상향하고, 피드백에는 생각의 장점을 먼저 적어 주세요."
                        />
                        <div className="flex justify-end">
                          <Button type="submit" size="sm">전체 적용</Button>
                        </div>
                      </form>
                    </details>
                  </div>
                ) : null}
              </div>
              <div className="hidden grid-cols-[120px_minmax(0,1fr)_190px_minmax(220px,0.7fr)] rounded-t-md border bg-muted/50 text-xs font-semibold text-muted-foreground lg:grid">
                <p className="border-r px-4 py-2">이름</p>
                <p className="border-r px-4 py-2">답변</p>
                <p className="border-r px-4 py-2">점수</p>
                <p className="px-4 py-2">피드백</p>
              </div>
              {group.comments.map(renderComment)}
            </section>
          ))}
        </div>
      ) : visibleComments.map(renderComment)}
    </div>
  );
}
