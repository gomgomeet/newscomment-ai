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
import { AI_EVALUATION_PROMPT_VERSION } from "@/lib/evaluation/ai-evaluation-version";
import { readNotionResultMetadata } from "@/lib/notion/result-metadata";

type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];
type RubricLevels = Record<"4" | "3" | "2" | "1", string>;
type QuestionRubrics = Record<string, RubricLevels>[];

const MAX_EDITABLE_COMMENT_LENGTH = 5000;

function isAssessmentSurveyResponse(metadata: Database["public"]["Tables"]["comments"]["Row"]["metadata"]) {
  return Boolean(
    metadata
    && typeof metadata === "object"
    && !Array.isArray(metadata)
    && metadata.source === "assessment-survey",
  );
}

function readAssessmentQuestion(metadata: Database["public"]["Tables"]["comments"]["Row"]["metadata"]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  if (metadata.source !== "assessment-survey") return null;
  const number = typeof metadata.question_number === "number" ? metadata.question_number : null;
  const prompt = typeof metadata.survey_prompt === "string" ? metadata.survey_prompt.trim() : "";
  const schoolYear = typeof metadata.school_year === "number" ? metadata.school_year : null;
  const gradeNumber = typeof metadata.grade_number === "number" ? metadata.grade_number : null;
  const classNumber = typeof metadata.class_number === "number" ? metadata.class_number : null;
  const studentNumber = typeof metadata.student_number === "number" ? metadata.student_number : null;
  const answer = typeof metadata.answer === "string" ? metadata.answer.trim() : "";
  return number && prompt ? { number, prompt, schoolYear, gradeNumber, classNumber, studentNumber, answer } : null;
}

function usesSavedQuestionRubric(evaluation?: Evaluation) {
  const rawOutput = evaluation?.raw_output;
  return Boolean(
    rawOutput
    && typeof rawOutput === "object"
    && !Array.isArray(rawOutput)
    && rawOutput.prompt_version === AI_EVALUATION_PROMPT_VERSION,
  );
}

function hasRubricSnapshot(evaluation?: Evaluation) {
  const rawOutput = evaluation?.raw_output;
  return Boolean(
    rawOutput
    && typeof rawOutput === "object"
    && !Array.isArray(rawOutput)
    && Array.isArray(rawOutput.rubric_snapshot),
  );
}

function compactCriterionLabel(label: string) {
  if (/중심.*파악|내용.*파악/.test(label)) return "파악";
  if (/탐색|이해/.test(label)) return "이해";
  if (/근거/.test(label)) return "근거";
  if (/생각|의견|표현/.test(label)) return "표현";
  if (/비교/.test(label)) return "비교";
  if (/상호작용|존중|소통/.test(label)) return "소통";
  return label.length > 5 ? label.slice(0, 5) : label;
}

export function CommentEvaluationCard({
  projectId,
  comment,
  criteria,
  evaluation,
  scores,
  aiEvaluation,
  aiScores,
  answerMode = false,
  questionCriteria = [],
  questionRubrics = [],
}: {
  projectId: string;
  comment: Comment;
  criteria: Criterion[];
  evaluation?: Evaluation;
  scores: Score[];
  aiEvaluation?: Evaluation;
  aiScores: Score[];
  answerMode?: boolean;
  questionCriteria?: string[][];
  questionRubrics?: QuestionRubrics;
}) {
  const scoreByCriterion = new Map(scores.map((score) => [score.criterion_id, score]));
  const aiScoreByCriterion = new Map(aiScores.map((score) => [score.criterion_id, score]));
  const editableContent = comment.content.slice(0, MAX_EDITABLE_COMMENT_LENGTH);
  const commentWasTruncated = comment.content.length > MAX_EDITABLE_COMMENT_LENGTH;
  const notionMetadata = readNotionResultMetadata(comment.metadata);
  const notionPageUrl = notionMetadata.pageUrl;
  const notionLastEdited = notionMetadata.lastEditedAt;
  const isRevision = notionMetadata.isRevision;
  const isSurveyResponse = isAssessmentSurveyResponse(comment.metadata);
  const assessmentQuestion = readAssessmentQuestion(comment.metadata);
  const questionIndex = assessmentQuestion ? assessmentQuestion.number - 1 : -1;
  const selectedCriterionIds = new Set(questionIndex >= 0 ? questionCriteria[questionIndex] ?? [] : []);
  const usesQuestionRubric = isSurveyResponse && selectedCriterionIds.size > 0;
  const criteriaForComment = usesQuestionRubric
    ? criteria.filter((criterion) => selectedCriterionIds.has(criterion.id))
    : criteria;
  const scoreLevelsByCriterion = questionIndex >= 0 ? questionRubrics[questionIndex] ?? {} : {};
  const criterionMaximum = (criterion: Criterion) => usesQuestionRubric ? 4 : criterion.max_score;
  const criterionMinimum = () => usesQuestionRubric ? 1 : 0;
  const aiUsesSavedRubric = usesSavedQuestionRubric(aiEvaluation);
  const teacherUsesSavedRubric = !usesQuestionRubric || hasRubricSnapshot(evaluation);
  const displayedScoreByCriterion = evaluation && teacherUsesSavedRubric
    ? scoreByCriterion
    : aiUsesSavedRubric
      ? aiScoreByCriterion
      : new Map<string, Score>();
  const displayedScoreSource = evaluation && teacherUsesSavedRubric ? "교사" : aiUsesSavedRubric ? "AI" : null;
  const displayedTotalScore = criteriaForComment.reduce((sum, criterion) => (
    sum + (displayedScoreByCriterion.get(criterion.id)?.score ?? 0)
  ), 0);
  const displayedMaximumScore = criteriaForComment.reduce((sum, criterion) => sum + criterionMaximum(criterion), 0);
  const savedFeedback = evaluation?.feedback?.trim() || (aiUsesSavedRubric ? aiEvaluation?.feedback?.trim() : "") || "";

  return (
    <Card id={`comment-${comment.id}`} className={`scroll-mt-24 ${answerMode ? "relative overflow-hidden rounded-md shadow-none" : ""}`}>
      <CardHeader className={answerMode ? "p-0" : undefined}>
        {answerMode ? (
          <div className="grid gap-0 lg:grid-cols-[120px_minmax(0,1fr)_190px_minmax(220px,0.7fr)]">
            <div className="border-b p-4 lg:border-b-0 lg:border-r lg:pb-14">
              <p className="mb-1 text-xs font-semibold text-muted-foreground md:hidden">이름</p>
              <CardTitle className="text-sm">
                {assessmentQuestion?.studentNumber ? `${assessmentQuestion.studentNumber}번 ` : ""}
                {comment.student_name || "이름 없는 응답"}
              </CardTitle>
            </div>
            <div className="border-b p-4 lg:border-b-0 lg:border-r">
              <p className="mb-1 text-xs font-semibold text-muted-foreground md:hidden">답변</p>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {assessmentQuestion?.answer || comment.content.replace(/^문항:[\s\S]*?\n답:\s*/, "")}
              </p>
            </div>
            <div className="border-b p-4 lg:border-b-0 lg:border-r">
              <p className="mb-2 text-xs font-semibold text-muted-foreground lg:hidden">점수</p>
              {displayedScoreSource ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {criteriaForComment.map((criterion) => (
                      <span key={criterion.id} className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                        {compactCriterionLabel(criterion.label)} {displayedScoreByCriterion.get(criterion.id)?.score ?? "-"}/{criterionMaximum(criterion)}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-teal-800">
                    {displayedScoreSource} · 총 {displayedTotalScore}/{displayedMaximumScore}
                  </p>
                </div>
              ) : aiEvaluation ? (
                <p className="text-xs font-medium text-amber-700">점수표로 다시 평가 필요</p>
              ) : (
                <p className="text-xs text-muted-foreground">미채점</p>
              )}
            </div>
            <div className="p-4">
              <p className="mb-1 text-xs font-semibold text-muted-foreground md:hidden">피드백</p>
              <p className={`whitespace-pre-wrap text-sm leading-6 ${savedFeedback ? "" : "text-muted-foreground"}`}>
                {savedFeedback || "아직 작성된 피드백이 없습니다."}
              </p>
            </div>
          </div>
        ) : (
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{comment.student_name || "이름 없는 응답"}</CardTitle>
              {isSurveyResponse ? (
                <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">온라인 평가지 응답</span>
              ) : null}
            </div>
            <CardDescription>{new Date(comment.created_at).toLocaleString("ko-KR")}</CardDescription>
            {notionPageUrl ? <a href={notionPageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-indigo-700 hover:underline">Notion 원본 보기{isRevision ? " · 수정본" : ""}{notionLastEdited ? ` · ${new Date(notionLastEdited).toLocaleDateString("ko-KR")}` : ""}</a> : null}
            {assessmentQuestion ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {assessmentQuestion.schoolYear ? <span>{assessmentQuestion.schoolYear}학년도 · </span> : null}
                {assessmentQuestion.gradeNumber ? <span>{assessmentQuestion.gradeNumber}학년 </span> : null}
                {assessmentQuestion.classNumber ? <span>{assessmentQuestion.classNumber}반 </span> : null}
                {assessmentQuestion.studentNumber ? <span>{assessmentQuestion.studentNumber}번 · </span> : null}
                <span className="font-semibold text-foreground">{assessmentQuestion.number}번 문항</span> · {assessmentQuestion.prompt}
              </p>
            ) : null}
          </div>
          {evaluation ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              총점 {evaluation.total_score ?? 0}
            </span>
          ) : null}
        </div>
        )}
      </CardHeader>
      <CardContent className={answerMode ? "p-0" : "space-y-5"}>
        {!answerMode ? (
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
              <Label htmlFor={`content_${comment.id}`}>{isSurveyResponse ? "학생 답안" : "댓글"}</Label>
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
          <Button type="submit" variant="outline" size="sm">{isSurveyResponse ? "답안 수정" : "댓글 수정"}</Button>
        </form>
        ) : null}
        <details id={`feedback-${comment.id}`} open={!answerMode} className={answerMode ? "bg-muted/20" : ""}>
          <summary className={answerMode ? "cursor-pointer border-t px-4 py-3 text-sm font-semibold text-teal-800 lg:absolute lg:left-4 lg:top-11 lg:rounded-md lg:border lg:bg-background lg:px-3 lg:py-2 lg:shadow-sm" : "hidden"}>
            피드백
          </summary>
          <div className={answerMode ? "space-y-4 border-t p-4" : ""}>
        {criteriaForComment.length === 0 ? (
          <p className="text-sm text-muted-foreground">루브릭 기준을 추가하면 평가를 저장할 수 있습니다.</p>
        ) : (
          <div className="space-y-4">
            {aiEvaluation && !aiUsesSavedRubric ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-semibold">이전 점수 기준으로 만든 AI 초안입니다.</p>
                <p className="mt-1 leading-6">저장된 문항별 4단계 점수표를 적용하려면 아래 버튼으로 다시 평가해 주세요.</p>
              </div>
            ) : null}
            {aiEvaluation && aiUsesSavedRubric ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div><p className="font-semibold text-indigo-950">AI 평가 초안</p><p className="text-xs text-indigo-700">{aiEvaluation.model_name} · 확신도 {Math.round((aiEvaluation.confidence ?? 0) * 100)}%</p></div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700">총점 {aiEvaluation.total_score ?? 0}</span>
                </div>
                {aiEvaluation.review_reasons.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{aiEvaluation.review_reasons.map((reason) => <span key={reason} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">{reason}</span>)}</div> : null}
                <div className="mt-4 grid gap-3 md:grid-cols-2">{criteriaForComment.map((criterion) => { const aiScore = aiScoreByCriterion.get(criterion.id); return <div key={criterion.id} className="rounded-lg border border-indigo-100 bg-white p-3"><div className="flex justify-between gap-2"><p className="text-sm font-medium">{criterion.label}</p><span className="text-sm font-semibold">{aiScore?.score ?? "-"}/{criterionMaximum(criterion)}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{aiScore?.rationale || "근거 없음"}</p></div>; })}</div>
                <p className="mt-4 text-sm leading-6"><span className="font-medium">종합 피드백:</span> {aiEvaluation.feedback || "없음"}</p>
                {!answerMode ? <p className="mt-2 text-sm leading-6"><span className="font-medium">평가 포워드:</span> {aiEvaluation.evaluation_forward || "없음"}</p> : null}
              </div>
            ) : null}
            <form action={generateAiEvaluation}>
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="comment_id" value={comment.id} />
              {answerMode ? <input type="hidden" name="return_view" value="answers" /> : null}
              {aiEvaluation ? <input type="hidden" name="force_ai" value="true" /> : null}
              <Button type="submit" variant="outline" size="sm">
                {aiEvaluation && aiUsesSavedRubric ? "AI 초안 다시 생성" : "저장된 점수표로 AI 평가"}
              </Button>
            </form>
            <form action={saveEvaluation} className="space-y-4">
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="comment_id" value={comment.id} />
              {answerMode ? <input type="hidden" name="return_view" value="answers" /> : null}
              <div className="space-y-4">
                {criteriaForComment.map((criterion) => {
                  const existingScore = scoreByCriterion.get(criterion.id);
                  const suggestedScore = aiUsesSavedRubric ? aiScoreByCriterion.get(criterion.id) : undefined;
                  const maximumScore = criterionMaximum(criterion);
                  const levels = scoreLevelsByCriterion[criterion.id];
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
                          {levels ? (
                            <details className="mt-2 rounded-md border bg-muted/30 text-xs">
                              <summary className="cursor-pointer px-2.5 py-2 font-semibold">AI가 적용하는 4단계 채점 기준</summary>
                              <div className="grid gap-2 border-t p-2.5 sm:grid-cols-2">
                                {(["4", "3", "2", "1"] as const).map((level) => (
                                  <p key={level} className="leading-5"><span className="font-semibold">{level}점 · </span>{levels[level]}</p>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </div>
                        <Input
                          id={`score_${comment.id}_${criterion.id}`}
                          name={`score_${criterion.id}`}
                          type="number"
                          min={criterionMinimum()}
                          max={maximumScore}
                          step={usesQuestionRubric ? "1" : "0.5"}
                          required
                          defaultValue={existingScore?.score ?? suggestedScore?.score ?? ""}
                          aria-label={`${criterion.label} 점수`}
                        />
                      </div>
                      <Textarea
                        name={`rationale_${criterion.id}`}
                        className="mt-3"
                        placeholder={`근거 또는 피드백 메모 (${maximumScore}점 만점)`}
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
              {answerMode ? (
                <input type="hidden" name="evaluation_forward" value={evaluation?.evaluation_forward ?? ""} />
              ) : (
                <div className="space-y-2">
                  <Label htmlFor={`evaluation_forward_${comment.id}`}>평가 포워드</Label>
                  <Textarea id={`evaluation_forward_${comment.id}`} name="evaluation_forward" placeholder="다음 결과물에서 학생이 시도할 구체적인 한 가지 행동" defaultValue={evaluation?.evaluation_forward ?? aiEvaluation?.evaluation_forward ?? ""} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor={`change_reason_${comment.id}`}>교사 판단·수정 이유</Label>
                <Textarea id={`change_reason_${comment.id}`} name="change_reason" placeholder="AI 초안과 다르게 판단한 이유 또는 이번 확정의 핵심 근거를 기록합니다." defaultValue="" />
              </div>
              <Button type="submit">{evaluation ? "교사 다시 확인" : "교사 확인"}</Button>
            </form>
          </div>
        )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
