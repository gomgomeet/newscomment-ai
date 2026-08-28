import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleDashed, FileDown, Send } from "lucide-react";
import { exportStudentSummaryToNotion, saveStudentSummary } from "@/app/dashboard/growth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireUser } from "@/lib/auth/require-user";
import { getEvaluationNotionConnectionStatus } from "@/lib/notion/teacher-connection";

const changeLabels = {
  improved: "향상",
  maintained: "유지",
  "needs-support": "지원 필요",
  "not-observed": "이전 관찰 없음",
} as const;

export default async function StudentSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ summaryId: string }>;
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { summaryId } = await params;
  const { message, notice } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: summary, error: summaryError } = await supabase
    .from("student_term_summaries")
    .select("*")
    .eq("id", summaryId)
    .eq("owner_id", user.id)
    .single();
  if (summaryError || !summary) notFound();

  const [evaluationsResult, projectsResult, growthResult, notionConnection] = await Promise.all([
    summary.included_evaluation_ids.length
      ? supabase.from("evaluations").select("*").in("id", summary.included_evaluation_ids).eq("evaluator_id", user.id).order("confirmed_at")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("projects").select("id, title").eq("owner_id", user.id),
    summary.included_evaluation_ids.length
      ? supabase.from("student_growth_records").select("*").eq("owner_id", user.id).in("current_evaluation_id", summary.included_evaluation_ids).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    getEvaluationNotionConnectionStatus({ supabase, userId: user.id }),
  ]);
  const queryError = evaluationsResult.error ?? projectsResult.error ?? growthResult.error;
  if (queryError) throw new Error(queryError.message);
  const evaluationCommentIds = (evaluationsResult.data ?? []).map((evaluation) => evaluation.comment_id);
  const commentsResult = evaluationCommentIds.length
    ? await supabase.from("comments").select("id, content, student_name").in("id", evaluationCommentIds)
    : { data: [], error: null };
  if (commentsResult.error) throw new Error(commentsResult.error.message);
  const projectById = new Map((projectsResult.data ?? []).map((project) => [project.id, project]));
  const commentById = new Map((commentsResult.data ?? []).map((comment) => [comment.id, comment]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between"><Button asChild variant="ghost"><Link href="/dashboard/growth"><ArrowLeft className="h-4 w-4" /> 성장 기록 보드</Link></Button><span className="text-sm text-muted-foreground">{summary.period_label}</span></div>
      {message ? <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{message}</CardContent></Card> : null}
      {notice ? <Card className="border-teal-200 bg-teal-50"><CardContent className="p-4 text-sm text-teal-900">{notice}</CardContent></Card> : null}
      <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-6"><div className="flex justify-between gap-4"><div><p className="text-sm font-semibold text-teal-700">성장 기록·세특 작성 작업대</p><h2 className="mt-1 text-2xl font-semibold">{summary.student_key}</h2><p className="mt-2 text-sm text-muted-foreground">확정 평가 {summary.included_evaluation_ids.length}건을 근거로 작성했습니다.</p></div><span className="flex h-fit items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold">{summary.status === "confirmed" ? <CheckCircle2 className="h-4 w-4 text-teal-600" /> : <CircleDashed className="h-4 w-4 text-amber-600" />}{summary.status === "confirmed" ? "교사 확정" : "초안"}</span></div></section>
      <section className="space-y-4"><div><h3 className="text-xl font-semibold">평가 근거 타임라인</h3><p className="mt-1 text-sm text-muted-foreground">한 번의 근거는 반복 성장으로 표현하지 않습니다.</p></div>{(evaluationsResult.data ?? []).map((evaluation, index) => { const comment = commentById.get(evaluation.comment_id); return <Card key={evaluation.id}><CardHeader><div className="flex justify-between gap-3"><div><CardTitle className="text-lg">{index + 1}. {projectById.get(evaluation.project_id)?.title || "평가활동"}</CardTitle><CardDescription>{evaluation.confirmed_at ? new Date(evaluation.confirmed_at).toLocaleString("ko-KR") : "확정 시각 없음"}</CardDescription></div><span className="text-sm font-semibold">{evaluation.total_score ?? "-"}점</span></div></CardHeader><CardContent className="space-y-3"><p className="line-clamp-4 rounded-lg bg-muted/50 p-3 text-sm leading-6">{comment?.content || "원결과물 없음"}</p><p className="text-sm"><span className="font-medium">교사 피드백 · </span>{evaluation.feedback || "없음"}</p><p className="text-sm text-indigo-900"><span className="font-medium">다음 평가 포워드 · </span>{evaluation.evaluation_forward || "없음"}</p></CardContent></Card>; })}</section>
      {(growthResult.data ?? []).length ? <Card><CardHeader><CardTitle>활동 간 변화 근거</CardTitle><CardDescription>같은 기준명 키를 기준으로 이전·현재 점수를 연결했습니다.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{(growthResult.data ?? []).map((record) => <div key={record.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-medium">{record.criterion_key}</p><span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold">{changeLabels[record.change_type]}</span></div><p className="mt-2 text-sm text-muted-foreground">{record.previous_score_percentage == null ? "이전 관찰 없음" : `${Math.round(record.previous_score_percentage)}% → ${Math.round(record.current_score_percentage ?? 0)}%`}</p><p className="mt-2 text-xs leading-5 text-indigo-900">이전 평가 포워드 · {record.prior_evaluation_forward || "없음"}</p></div>)}</CardContent></Card> : null}
      <Card><CardHeader><CardTitle>세특·종합 기록 작성</CardTitle><CardDescription>자동 초안은 근거를 정리하는 시작점입니다. 교사가 검토·수정하고 확정해야 내보낼 수 있습니다.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="rounded-xl bg-muted/50 p-4"><p className="text-xs font-semibold text-muted-foreground">근거 기반 초안</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{summary.draft_text}</p></div><form action={saveStudentSummary} className="space-y-4"><input type="hidden" name="summary_id" value={summary.id} /><div className="space-y-2"><Label htmlFor="teacher_final_text">교사 최종 문장</Label><Textarea id="teacher_final_text" name="teacher_final_text" rows={9} defaultValue={summary.teacher_final_text} /></div><div className="flex flex-wrap justify-end gap-2"><Button type="submit" name="confirm" value="false" variant="outline">초안 저장</Button><Button type="submit" name="confirm" value="true">교사 최종 확정</Button></div></form></CardContent></Card>
      <Card className={summary.status === "confirmed" ? "border-indigo-200" : "opacity-70"}><CardHeader><CardTitle>확정 결과 내보내기</CardTitle><CardDescription>대시보드가 원본입니다. 필요할 때만 학교 PDF를 작성하거나 사용자의 Notion 워크스페이스에 새 페이지를 만듭니다.</CardDescription></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border p-4"><p className="font-semibold">학교 양식 PDF</p><p className="mt-2 text-sm leading-6 text-muted-foreground">등록한 학교 PDF 양식의 입력 칸 또는 지정 영역에 확정 결과를 채웁니다.</p>{summary.status === "confirmed" ? <Button asChild className="mt-4" variant="outline"><Link href="/dashboard/forms"><FileDown className="h-4 w-4" /> 학교 양식 선택</Link></Button> : <Button className="mt-4" variant="outline" disabled><FileDown className="h-4 w-4" /> 학교 양식 선택</Button>}</div><form action={exportStudentSummaryToNotion} className="space-y-3 rounded-xl border p-4"><input type="hidden" name="summary_id" value={summary.id} /><div><p className="font-semibold">Notion에 선택 저장</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{notionConnection.configured ? `${notionConnection.workspaceLabel}의 Integration이 연결된 상위 페이지 아래에 확정 기록 페이지를 하나 만듭니다.` : "평가 준비 프렙에서 내 Notion 연결을 먼저 완료해 주세요."}</p></div><div className="space-y-2"><Label htmlFor="notion_parent_page">Notion 상위 페이지 URL 또는 ID</Label><Input id="notion_parent_page" name="notion_parent_page" defaultValue={notionConnection.defaultExportParentPageId ?? ""} placeholder="https://www.notion.so/..." required={!notionConnection.defaultExportParentPageId} disabled={summary.status !== "confirmed" || !notionConnection.configured} /></div><Button type="submit" disabled={summary.status !== "confirmed" || !notionConnection.configured}><Send className="h-4 w-4" /> Notion 새 페이지로 저장</Button>{!notionConnection.configured ? <Button asChild type="button" variant="outline"><Link href="/dashboard/prep#notion-connection">Notion 연결하기</Link></Button> : null}</form></CardContent></Card>
    </div>
  );
}
