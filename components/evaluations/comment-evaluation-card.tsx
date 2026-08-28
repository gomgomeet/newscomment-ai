import {
  generateAiEvaluation,
  saveEvaluation,
  updateComment,
} from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/db/types";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];

const MAX_EDITABLE_COMMENT_LENGTH = 30000;

export function CommentEvaluationCard({
  projectId,
  comment,
  criteria,
  evaluation,
  aiEvaluation,
  scores,
  aiScores,
}: {
  projectId: string;
  comment: Comment;
  criteria: Criterion[];
  evaluation?: Evaluation;
  aiEvaluation?: Evaluation;
  scores: Score[];
  aiScores: Score[];
}) {
  const scoreByCriterion = new Map(scores.map((score) => [score.criterion_id, score]));
  const editableContent = comment.content.slice(0, MAX_EDITABLE_COMMENT_LENGTH);
  const commentWasTruncated = comment.content.length > MAX_EDITABLE_COMMENT_LENGTH;
  const aiScoreByCriterion = new Map(aiScores.map((score) => [score.criterion_id, score]));
  const metadata =
    typeof comment.metadata === "object" && comment.metadata !== null && !Array.isArray(comment.metadata)
      ? comment.metadata
      : {};
  const sourceUrl = typeof metadata.notion_page_url === "string" ? metadata.notion_page_url : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div>
            <CardTitle className="text-base">{comment.student_name || "이름 없는 댓글"}</CardTitle>
            <CardDescription>{new Date(comment.created_at).toLocaleString("ko-KR")}</CardDescription>
            {sourceUrl ? (
              <a className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline" href={sourceUrl} target="_blank" rel="noreferrer">
                원본 Notion 페이지 열기
              </a>
            ) : null}
          </div>
          {evaluation ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              총점 {evaluation.total_score ?? 0}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={updateComment} className="space-y-3 rounded-md border border-border bg-background p-3">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="comment_id" value={comment.id} />
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor={`student_${comment.id}`}>학생</Label>
              <Input
                id={`student_${comment.id}`}
                name="student_name"
                defaultValue={comment.student_name ?? ""}
                placeholder="선택 입력"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`content_${comment.id}`}>댓글</Label>
              <Textarea
                id={`content_${comment.id}`}
                name="content"
                required
                maxLength={MAX_EDITABLE_COMMENT_LENGTH}
                defaultValue={editableContent}
              />
              {commentWasTruncated ? (
                <p className="text-xs text-destructive">
                  댓글이 너무 길어 {MAX_EDITABLE_COMMENT_LENGTH}자까지만 표시했습니다. 저장하면 잘린 내용으로 정리됩니다.
                </p>
              ) : null}
            </div>
          </div>
          <Button type="submit" variant="outline" size="sm">댓글 수정</Button>
        </form>
        {criteria.length === 0 ? (
          <p className="text-sm text-muted-foreground">루브릭 기준을 추가하면 평가를 저장할 수 있습니다.</p>
        ) : (
          <div className="space-y-4">
            {aiEvaluation ? (
              <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">AI 평가 초안 · 교사 확인 전</p>
                  <span className="text-xs font-medium">총점 {aiEvaluation.total_score ?? 0}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {criteria.map((criterion) => {
                    const aiScore = aiScoreByCriterion.get(criterion.id);
                    return (
                      <div key={criterion.id} className="rounded-md bg-background p-3 text-xs">
                        <p className="font-medium">{criterion.label}: {aiScore?.score ?? 0} / {criterion.max_score}</p>
                        <p className="mt-1 leading-5 text-muted-foreground">{aiScore?.rationale || "근거 없음"}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-sm leading-6">{aiEvaluation.feedback || "종합 피드백이 없습니다."}</p>
                <p className="text-xs text-muted-foreground">원자료와 성취기준을 대조한 뒤 아래 교사 평가로 확정하세요.</p>
              </div>
            ) : null}
            <form action={generateAiEvaluation}>
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="comment_id" value={comment.id} />
              <Button type="submit" variant="outline" size="sm">{aiEvaluation ? "AI 초안 다시 생성" : "AI 초안 생성"}</Button>
            </form>
            <form action={saveEvaluation} className="space-y-4">
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="comment_id" value={comment.id} />
              <div className="space-y-4">
                {criteria.map((criterion) => {
                  const existingScore = scoreByCriterion.get(criterion.id);
                  return (
                    <div key={criterion.id} className="rounded-md border border-border p-3">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                        <div>
                          <Label htmlFor={`score_${comment.id}_${criterion.id}`}>
                            {criterion.label}
                          </Label>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {criterion.description}
                          </p>
                        </div>
                        <Input
                          id={`score_${comment.id}_${criterion.id}`}
                          name={`score_${criterion.id}`}
                          type="number"
                          min={0}
                          max={criterion.max_score}
                          step="0.5"
                          required
                          defaultValue={existingScore?.score ?? ""}
                          aria-label={`${criterion.label} 점수`}
                        />
                      </div>
                      <Textarea
                        name={`rationale_${criterion.id}`}
                        className="mt-3"
                        placeholder={`근거 또는 피드백 메모 (${criterion.max_score}점 만점)`}
                        defaultValue={existingScore?.rationale ?? ""}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`feedback_${comment.id}`}>종합 피드백</Label>
                <Textarea
                  id={`feedback_${comment.id}`}
                  name="feedback"
                  placeholder="학생에게 전달할 종합 피드백을 입력하세요."
                  defaultValue={evaluation?.feedback ?? ""}
                />
              </div>
              <Button type="submit">{evaluation ? "평가 업데이트" : "평가 저장"}</Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
