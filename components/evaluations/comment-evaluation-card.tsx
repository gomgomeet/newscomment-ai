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

const MAX_EDITABLE_COMMENT_LENGTH = 5000;

export function CommentEvaluationCard({
  projectId,
  comment,
  criteria,
  evaluation,
  scores,
}: {
  projectId: string;
  comment: Comment;
  criteria: Criterion[];
  evaluation?: Evaluation;
  scores: Score[];
}) {
  const scoreByCriterion = new Map(scores.map((score) => [score.criterion_id, score]));
  const editableContent = comment.content.slice(0, MAX_EDITABLE_COMMENT_LENGTH);
  const commentWasTruncated = comment.content.length > MAX_EDITABLE_COMMENT_LENGTH;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div>
            <CardTitle className="text-base">{comment.student_name || "이름 없는 댓글"}</CardTitle>
            <CardDescription>{new Date(comment.created_at).toLocaleString("ko-KR")}</CardDescription>
          </div>
          {evaluation ? (
            <div className="text-right text-xs text-muted-foreground">
              <span className="rounded-md bg-muted px-2 py-1 font-medium">총점 {evaluation.total_score ?? 0}</span>
              <p className="mt-2">{evaluation.evaluation_stage === "trial" ? "시험 채점" : evaluation.evaluation_stage === "batch" ? "일괄 채점" : "교사 평가"} · {evaluation.review_status === "pending" ? "검토 대기" : evaluation.review_status === "kept" ? "유지" : evaluation.review_status === "revised" ? "수정" : "보류"}</p>
            </div>
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
            <form action={generateAiEvaluation}>
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="comment_id" value={comment.id} />
              <Button type="submit" variant="outline" size="sm">AI 초안 생성</Button>
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
              <div className="space-y-2">
                <Label htmlFor={`feedforward_${comment.id}`}>피드포워드</Label>
                <Textarea id={`feedforward_${comment.id}`} name="feedforward" placeholder="다음 활동에서 학생이 시도할 구체적인 한 가지를 적으세요." defaultValue={evaluation?.feedforward ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`review_status_${comment.id}`}>교사 검토</Label>
                <select id={`review_status_${comment.id}`} name="review_status" defaultValue={evaluation?.review_status === "pending" ? "kept" : evaluation?.review_status ?? "revised"} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="kept">유지: AI 초안을 그대로 확정</option>
                  <option value="revised">수정: 교사가 점수·문장을 고쳐 확정</option>
                  <option value="held">보류: 증거를 더 확인</option>
                </select>
              </div>
              <Button type="submit">{evaluation ? "평가 업데이트" : "평가 저장"}</Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
