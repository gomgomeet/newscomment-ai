"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentEvaluationCard } from "@/components/evaluations/comment-evaluation-card";
import type { Database } from "@/lib/db/types";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];

export function CommentEvaluationList({
  projectId,
  comments,
  criteria,
  teacherEvaluations,
  aiEvaluations,
  scores,
}: {
  projectId: string;
  comments: Comment[];
  criteria: Criterion[];
  teacherEvaluations: Evaluation[];
  aiEvaluations: Evaluation[];
  scores: Score[];
}) {
  const [view, setView] = useState<"all" | "remaining" | "priority">("priority");

  if (comments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>댓글이 없습니다</CardTitle>
          <CardDescription>오른쪽 양식에서 평가할 댓글을 먼저 추가하세요.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const evaluatedCommentIds = new Set(teacherEvaluations.map((evaluation) => evaluation.comment_id));
  const remainingCount = comments.filter((comment) => !evaluatedCommentIds.has(comment.id)).length;
  const priorityCommentIds = new Set(aiEvaluations.filter((evaluation) => {
    const teacher = teacherEvaluations.find((item) => item.comment_id === evaluation.comment_id);
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

  return (
    <div className="space-y-4">
      <div className="sticky top-3 z-10 flex flex-col justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold">채점 작업대</p>
          <p className="text-sm text-muted-foreground">
            전체 {comments.length}개 · 완료 {comments.length - remainingCount}개 · 남음 {remainingCount}개
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={view === "priority" ? "default" : "outline"} onClick={() => setView("priority")}>
            교사 확인 우선 ({priorityCount})
          </Button>
          <Button type="button" size="sm" variant={view === "all" ? "default" : "outline"} onClick={() => setView("all")}>
            전체 보기
          </Button>
          <Button type="button" size="sm" variant={view === "remaining" ? "default" : "outline"} onClick={() => setView("remaining")}>
            미평가만 보기 ({remainingCount})
          </Button>
        </div>
      </div>

      {visibleComments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{view === "priority" ? "지금은 우선 확인할 결과물이 없습니다" : "모든 댓글을 채점했습니다"}</CardTitle>
            <CardDescription>전체 보기를 누르면 모든 결과물과 저장한 평가를 확인할 수 있습니다.</CardDescription>
          </CardHeader>
        </Card>
      ) : visibleComments.map((comment) => {
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
          />
        );
      })}
    </div>
  );
}
