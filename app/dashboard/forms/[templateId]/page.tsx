import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { addManualPdfField, updatePdfField } from "@/app/dashboard/forms/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PDF_SOURCE_KEYS } from "@/lib/pdf/school-form";
import { requireUser } from "@/lib/auth/require-user";

const sourceLabels: Record<string, string> = {
  student_key: "학생 식별자", project_title: "평가활동명", assessment_period: "평가 기간",
  achievement_standards: "성취기준", learning_goal: "평가 목표", criterion_results: "기준별 결과",
  strengths: "강점", growth_needs: "보완점", feedback_forward: "평가 포워드",
  growth_summary: "성장 요약", special_record_draft: "세특 초안", teacher_final_text: "교사 최종 문장",
};

export default async function SchoolFormDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { templateId } = await params;
  const { message, notice } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: template, error } = await supabase.from("school_pdf_templates").select("*").eq("id", templateId).eq("owner_id", user.id).single();
  if (error || !template) notFound();
  const [fieldsResult, summariesResult, signedResult] = await Promise.all([
    supabase.from("school_pdf_template_fields").select("*").eq("template_id", template.id).order("sort_order"),
    supabase.from("student_term_summaries").select("id, student_key, period_label, teacher_final_text, status").eq("owner_id", user.id).eq("status", "confirmed").order("updated_at", { ascending: false }),
    supabase.storage.from("school-form-templates").createSignedUrl(template.storage_path, 300),
  ]);
  const queryError = fieldsResult.error ?? summariesResult.error ?? signedResult.error;
  if (queryError) throw new Error(queryError.message);
  const fields = fieldsResult.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex justify-between gap-4"><Button asChild variant="ghost"><Link href="/dashboard/forms"><ArrowLeft className="h-4 w-4" /> 학교 양식 목록</Link></Button>{signedResult.data?.signedUrl ? <Button asChild variant="outline"><a href={signedResult.data.signedUrl} target="_blank" rel="noreferrer">원본 PDF 확인 <ExternalLink className="h-4 w-4" /></a></Button> : null}</div>
      {message ? <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{message}</CardContent></Card> : null}{notice ? <Card className="border-teal-200 bg-teal-50"><CardContent className="p-4 text-sm text-teal-900">{notice}</CardContent></Card> : null}
      <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-6"><p className="text-sm font-semibold text-violet-700">학교 양식 설정</p><h2 className="mt-1 text-2xl font-semibold">{template.school_name} · {template.document_type}</h2><p className="mt-2 text-sm text-muted-foreground">페이지 {template.page_count} · 작성 항목 {fields.length}개 · SHA-256 {template.sha256.slice(0, 12)}…</p></section>
      <Card><CardHeader><CardTitle>1. PDF 항목 연결</CardTitle><CardDescription>각 입력 칸 또는 수동 영역을 평가 데이터 키에 연결하고 글자 수를 정합니다. 일반 PDF 좌표는 좌측 아래가 (0, 0)입니다.</CardDescription></CardHeader><CardContent className="space-y-4">{fields.map((field) => <form key={field.id} action={updatePdfField} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-6"><input type="hidden" name="template_id" value={template.id} /><input type="hidden" name="field_id" value={field.id} /><div className="space-y-2 lg:col-span-2"><Label>항목명</Label><Input name="field_label" defaultValue={field.field_label} /></div><div className="space-y-2 lg:col-span-2"><Label>데이터 소스</Label><Select name="source_key" defaultValue={field.source_key}>{PDF_SOURCE_KEYS.map((key) => <option key={key} value={key}>{sourceLabels[key]}</option>)}</Select></div><div className="space-y-2"><Label>글자 수</Label><Input name="char_limit" type="number" min={1} defaultValue={field.char_limit ?? ""} /></div><div className="space-y-2"><Label>줄 수</Label><Input name="line_limit" type="number" min={1} defaultValue={field.line_limit ?? ""} /></div><div className="space-y-2"><Label>글꼴 크기</Label><Input name="font_size" type="number" min={6} max={24} step="0.5" defaultValue={field.font_size} /></div><div className="space-y-2"><Label>필수</Label><Select name="is_required" defaultValue={field.is_required ? "true" : "false"}><option value="false">선택</option><option value="true">필수</option></Select></div><div className="space-y-2"><Label>페이지</Label><Input name="page_number" type="number" min={1} max={template.page_count} defaultValue={field.page_number} /></div>{field.acroform_name ? <div className="flex items-end text-xs text-muted-foreground lg:col-span-3">AcroForm · {field.acroform_name}</div> : <><div className="space-y-2"><Label>X</Label><Input name="x" type="number" defaultValue={field.x ?? 40} /></div><div className="space-y-2"><Label>Y</Label><Input name="y" type="number" defaultValue={field.y ?? 40} /></div><div className="space-y-2"><Label>너비</Label><Input name="width" type="number" defaultValue={field.width ?? 500} /></div><div className="space-y-2"><Label>높이</Label><Input name="height" type="number" defaultValue={field.height ?? 80} /></div></>}<div className="flex items-end justify-end lg:col-span-6"><Button type="submit" size="sm" variant="outline">항목 연결 저장</Button></div></form>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>수동 영역 추가</CardTitle><CardDescription>입력 필드가 없는 일반 PDF에 작성 영역을 추가합니다.</CardDescription></CardHeader><CardContent><form action={addManualPdfField} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7"><input type="hidden" name="template_id" value={template.id} /><Input name="field_label" required placeholder="항목 이름" /><Input name="page_number" type="number" min={1} max={template.page_count} defaultValue={1} /><Input name="x" type="number" defaultValue={40} placeholder="X" /><Input name="y" type="number" defaultValue={40} placeholder="Y" /><Input name="width" type="number" defaultValue={500} placeholder="너비" /><Input name="height" type="number" defaultValue={80} placeholder="높이" /><Button type="submit"><Plus className="h-4 w-4" /> 추가</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>2. 확정 성장 기록으로 PDF 작성</CardTitle><CardDescription>미확정 세특 문장은 목록에 나타나지 않습니다. 먼저 성장 기록 보드에서 교사 최종 문장을 확정하세요.</CardDescription></CardHeader><CardContent>{summariesResult.data?.length ? <div className="space-y-3">{summariesResult.data.map((summary) => <div key={summary.id} className="flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"><div><p className="font-semibold">{summary.student_key}</p><p className="mt-1 text-sm text-muted-foreground">{summary.period_label} · {summary.teacher_final_text.slice(0, 80)}{summary.teacher_final_text.length > 80 ? "…" : ""}</p></div><div className="flex gap-2"><Button asChild size="sm" variant="outline"><a href={`/api/pdf/templates/${template.id}/generate?summaryId=${summary.id}`}>PDF 다운로드</a></Button><Button asChild size="sm"><a href={`/api/pdf/templates/${template.id}/generate?summaryId=${summary.id}&store=1`}>생성·보관</a></Button></div></div>)}</div> : <p className="text-sm text-muted-foreground">교사가 확정한 성장 기록이 없습니다.</p>}</CardContent></Card>
    </div>
  );
}
