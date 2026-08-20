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
  evaluations,
  scores,
}: {
  projectId: string;
  comments: Comment[];
  criteria: Criterion[];
  evaluations: Evaluation[];
  scores: Score[];
}) {
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

  return (
    <div className="space-y-4">
      {comments.map((comment) => {
        const evaluation = evaluations.find((item) => item.comment_id === comment.id);
        const evaluationScores = evaluation
          ? scores.filter((score) => score.evaluation_id === evaluation.id)
          : [];

        return (
          <CommentEvaluationCard
            key={comment.id}
            projectId={projectId}
            comment={comment}
            criteria={criteria}
            evaluation={evaluation}
            scores={evaluationScores}
          />
        );
      })}
    </div>
  );
}
