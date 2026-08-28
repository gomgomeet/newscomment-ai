import Link from "next/link";
import { FileText, LockKeyhole, Upload } from "lucide-react";
import { uploadSchoolPdfTemplate } from "@/app/dashboard/forms/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth/require-user";

export default async function SchoolFormsPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: templates, error } = await supabase.from("school_pdf_templates").select("*").eq("owner_id", user.id).order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="rounded-2xl border border-violet-200 bg-[linear-gradient(135deg,#f5f3ff_0%,#ffffff_64%,#eff6ff_100%)] p-6 sm:p-8"><div className="flex items-start gap-4"><FileText className="mt-1 h-6 w-6 text-violet-700" /><div><p className="text-sm font-semibold text-violet-700">학교별 양식은 PDF 하나로</p><h2 className="mt-1 text-3xl font-semibold">학교 양식 PDF 작성 도우미</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">학교 양식 PDF를 읽고 입력 칸 또는 교사가 지정한 영역을 평가 데이터에 연결합니다. 교사가 확정한 성장 기록만 작성에 사용합니다.</p></div></div></section>
      {message ? <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{message}</CardContent></Card> : null}
      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> PDF 양식 업로드</CardTitle><CardDescription>개인정보가 없는 텍스트형 또는 입력 필드형 PDF, 최대 10MB·20페이지를 지원합니다.</CardDescription></CardHeader><CardContent><form action={uploadSchoolPdfTemplate} encType="multipart/form-data" className="space-y-4"><div className="space-y-2"><Label htmlFor="school_name">학교명 또는 구분명</Label><Input id="school_name" name="school_name" required placeholder="예: 샘플 초등학교" /></div><div className="space-y-2"><Label htmlFor="document_type">문서 종류</Label><Input id="document_type" name="document_type" required placeholder="예: 과정중심평가 종합 기록" /></div><div className="space-y-2"><Label htmlFor="school_year">학년도</Label><Input id="school_year" name="school_year" required defaultValue={String(new Date().getFullYear())} /></div><div className="space-y-2"><Label htmlFor="pdf_file">학교 양식 PDF</Label><Input id="pdf_file" name="pdf_file" type="file" accept="application/pdf,.pdf" required /></div><div className="rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" />원본은 교사별 비공개 Storage 경로에 저장되고 공개 URL은 만들지 않습니다.</div><div className="flex flex-wrap gap-2"><Button type="submit">업로드하고 분석</Button><Button asChild variant="outline"><a href="/samples/school-evaluation-template-sample.pdf" download>시연용 샘플 PDF 받기</a></Button></div></form></CardContent></Card>
        <section className="space-y-4"><div><h3 className="text-xl font-semibold">내 학교 양식</h3><p className="mt-1 text-sm text-muted-foreground">분석한 양식을 다시 열어 항목을 연결하고 PDF를 작성합니다.</p></div>{templates?.length ? <div className="grid gap-4 sm:grid-cols-2">{templates.map((template) => <Card key={template.id}><CardHeader><CardTitle className="text-lg">{template.school_name}</CardTitle><CardDescription>{template.document_type} · {template.school_year}</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p>페이지 {template.page_count} · {template.has_acroform ? "입력 필드 감지" : "수동 영역 지정"}</p><p className="text-muted-foreground">분석 상태 · {template.analysis_status}</p><Button asChild size="sm" variant="outline"><Link href={`/dashboard/forms/${template.id}`}>양식 설정 열기</Link></Button></CardContent></Card>)}</div> : <Card><CardHeader><CardTitle>아직 등록한 PDF가 없습니다</CardTitle><CardDescription>왼쪽에서 개인정보 없는 샘플 양식을 먼저 업로드해 주세요.</CardDescription></CardHeader></Card>}</section>
      </div>
    </div>
  );
}
