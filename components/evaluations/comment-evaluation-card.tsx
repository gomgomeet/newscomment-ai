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
import type { Database, Json } from "@/lib/db/types";

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
  aiEvaluation,
  aiScores,
}: {
  projectId: string;
  comment: Comment;
  criteria: Criterion[];
  evaluation?: Evaluation;
  scores: Score[];
  aiEvaluation?: Evaluation;
  aiScores: Score[];
}) {
  const scoreByCriterion = new Map(scores.map((score) => [score.criterion_id, score]));
  const aiScoreByCriterion = new Map(aiScores.map((score) => [score.criterion_id, score]));
  const editableContent = comment.content.slice(0, MAX_EDITABLE_COMMENT_LENGTH);
  const commentWasTruncated = comment.content.length > MAX_EDITABLE_COMMENT_LENGTH;
  const metadata = typeof comment.metadata === "object" && comment.metadata !== null && !Array.isArray(comment.metadata)
    ? comment.metadata as Record<string, Json | undefined>
    : null;
  const notionPageUrl = typeof metadata?.notion_page_url === "string" ? metadata.notion_page_url : "";
  const notionLastEdited = typeof metadata?.notion_last_edited_time === "string" ? metadata.notion_last_edited_time : "";
  const isRevision = typeof metadata?.notion_revision_of === "string" && metadata.notion_revision_of.length > 0;

  return (
    <Card id={`comment-${comment.id}`} className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div>
            <CardTitle className="text-base">{comment.student_name || "이름 없는 댓글"}</CardTitle>
            <CardDescription>{new Date(comment.created_at).toLocaleString("ko-KR")}</CardDescription>
            {notionPageUrl ? <a href={notionPageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-indigo-700 hover:underline">Notion 원본 보기{isRevision ? " · 수정본" : ""}{notionLastEdited ? ` · ${new Date(notionLastEdited).toLocaleDateString("ko-KR")}` : ""}</a> : null}
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
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div><p className="font-semibold text-indigo-950">AI 평가 초안</p><p className="text-xs text-indigo-700">{aiEvaluation.model_name} · 확신도 {Math.round((aiEvaluation.confidence ?? 0) * 100)}%</p></div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700">총점 {aiEvaluation.total_score ?? 0}</span>
                </div>
                {aiEvaluation.review_reasons.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{aiEvaluation.review_reasons.map((reason) => <span key={reason} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">{reason}</span>)}</div> : null}
                <div className="mt-4 grid gap-3 md:grid-cols-2">{criteria.map((criterion) => { const aiScore = aiScoreByCriterion.get(criterion.id); return <div key={criterion.id} className="rounded-lg border border-indigo-100 bg-white p-3"><div className="flex justify-between gap-2"><p className="text-sm font-medium">{criterion.label}</p><span className="text-sm font-semibold">{aiScore?.score ?? "-"}/{criterion.max_score}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{aiScore?.rationale || "근거 없음"}</p></div>; })}</div>
                <p className="mt-4 text-sm leading-6"><span className="font-medium">종합 피드백:</span> {aiEvaluation.feedback || "없음"}</p>
                <p className="mt-2 text-sm leading-6"><span className="font-medium">평가 포워드:</span> {aiEvaluation.evaluation_forward || "없음"}</p>
              </div>
            ) : null}
            <form action={generateAiEvaluation}>
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="comment_id" value={comment.id} />
              {aiEvaluation ? <input type="hidden" name="force_ai" value="true" /> : null}
              <Button type="submit" variant="outline" size="sm">{aiEvaluation ? "AI 초안 다시 생성" : "AI 초안 생성"}</Button>
            </form>
            <form action={saveEvaluation} className="space-y-4">
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="comment_id" value={comment.id} />
              <div className="space-y-4">
                {criteria.map((criterion) => {
                  const existingScore = scoreByCriterion.get(criterion.id);
                  const suggestedScore = aiScoreByCriterion.get(criterion.id);
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
                          defaultValue={existingScore?.score ?? suggestedScore?.score ?? ""}
                          aria-label={`${criterion.label} 점수`}
                        />
                      </div>
                      <Textarea
                        name={`rationale_${criterion.id}`}
                        className="mt-3"
                        placeholder={`근거 또는 피드백 메모 (${criterion.max_score}점 만점)`}
                        defaultValue={existingScore?.rationale ?? suggestedScore?.rationale ?? ""}
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
                  defaultValue={evaluation?.feedback ?? aiEvaluation?.feedback ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`evaluation_forward_${comment.id}`}>평가 포워드</Label>
                <Textarea id={`evaluation_forward_${comment.id}`} name="evaluation_forward" placeholder="다음 결과물에서 학생이 시도할 구체적인 한 가지 행동" defaultValue={evaluation?.evaluation_forward ?? aiEvaluation?.evaluation_forward ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`change_reason_${comment.id}`}>교사 판단·수정 이유</Label>
                <Textarea id={`change_reason_${comment.id}`} name="change_reason" placeholder="AI 초안과 다르게 판단한 이유 또는 이번 확정의 핵심 근거를 기록합니다." defaultValue="" />
              </div>
              <Button type="submit">{evaluation ? "교사 평가 재확정" : "교사 평가 확정"}</Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
