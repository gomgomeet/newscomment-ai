import Link from "next/link";
import { ArrowLeft, CheckCircle2, Database, ExternalLink, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { importCommentsFromNotion } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import type { Json } from "@/lib/db/types";
import { importCommentsFromNotionDatabase, NotionImportError, type NotionImportResult } from "@/lib/notion/import-comments";

function asRecord(value: Json | null | undefined) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : null;
}

function readConfigText(config: Record<string, Json | undefined> | null, key: string) {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
}

export default async function NotionPreviewPage({ params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;
  const { supabase, user } = await requireUser();
  const { data: prep, error: prepError } = await supabase
    .from("assessment_preps")
    .select("id, project_id, notion_config")
    .eq("id", prepId)
    .eq("owner_id", user.id)
    .single();

  if (prepError || !prep) notFound();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", prep.project_id)
    .eq("owner_id", user.id)
    .single();

  if (projectError || !project) notFound();

  const config = asRecord(prep.notion_config);
  const databaseInput = readConfigText(config, "database_url");
  const contentMode = readConfigText(config, "content_mode") === "page_body" ? "page_body" : "property";
  const contentProperty = readConfigText(config, "content_property");
  const studentProperty = readConfigText(config, "student_property");
  const topicProperty = readConfigText(config, "topic_property");
  let preview: NotionImportResult | null = null;
  let previewError = "";

  if (!databaseInput) {
    previewError = "평가 준비안에 Notion 데이터베이스 URL을 먼저 저장해 주세요.";
  } else {
    try {
      preview = await importCommentsFromNotionDatabase({
        databaseInput,
        contentMode,
        contentProperty,
        studentProperty,
        topicProperty,
        maxRows: 3,
        maxContentLength: 5000,
      });
    } catch (error) {
      previewError = error instanceof NotionImportError
        ? `${error.message}${error.availableProperties.length ? ` 사용 가능한 속성: ${error.availableProperties.join(", ")}` : ""}`
        : "Notion 연결 미리보기에 실패했습니다.";
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="ghost"><Link href={`/dashboard/prep/${prep.id}`}><ArrowLeft className="h-4 w-4" /> 평가 준비안으로</Link></Button>
        <span className="text-sm text-muted-foreground">{project.title}</span>
      </div>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-6">
        <div className="flex items-start gap-3"><Database className="mt-1 h-5 w-5 text-indigo-700" /><div><p className="text-sm font-semibold text-indigo-700">Notion 읽기 전용 연결 미리보기</p><h2 className="mt-1 text-2xl font-semibold">저장 전에 학생 결과물 3개를 확인합니다.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">이 화면은 페이지와 속성을 읽기만 하며 Notion 원본을 수정하지 않습니다.</p></div></div>
      </section>

      {previewError ? (
        <Card className="border-amber-200 bg-amber-50"><CardContent className="flex gap-3 p-5 text-sm text-amber-950"><TriangleAlert className="h-5 w-5 shrink-0" /><p>{previewError}</p></CardContent></Card>
      ) : null}

      {preview ? (
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-teal-600" /> 연결됨</CardTitle><CardDescription>Integration에 공유된 DB와 속성을 정상적으로 읽었습니다.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><span className="font-medium">결과물 위치:</span> {contentMode === "page_body" ? "각 학생 페이지 본문" : `속성 · ${contentProperty}`}</p>
              <div className="flex flex-wrap gap-2">{preview.availableProperties.map((property) => <span key={property} className="rounded-full bg-muted px-2.5 py-1 text-xs">{property}</span>)}</div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {preview.rows.map((row, index) => (
              <Card key={`${row.page_id}-${row.last_edited_time ?? index}`}>
                <CardHeader><CardTitle className="text-base">{row.student_name || `학생 식별자 없음 · ${index + 1}`}</CardTitle><CardDescription>{row.topic || "활동명 없음"}</CardDescription></CardHeader>
                <CardContent className="space-y-4"><p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-6">{row.content}</p><div className="text-xs text-muted-foreground"><p>마지막 수정 · {row.last_edited_time ? new Date(row.last_edited_time).toLocaleString("ko-KR") : "확인 불가"}</p>{row.page_url ? <Link href={row.page_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-indigo-700 hover:underline">원본 페이지 <ExternalLink className="h-3 w-3" /></Link> : null}</div></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>평가 목록에 연결</CardTitle><CardDescription>새 결과물은 추가하고, 수정본은 기존 원문을 지우지 않은 채 새 근거 버전으로 저장합니다.</CardDescription></CardHeader>
            <CardContent>
              <form action={importCommentsFromNotion}>
                <input type="hidden" name="project_id" value={project.id} />
                <input type="hidden" name="notion_database" value={databaseInput} />
                <input type="hidden" name="content_mode" value={contentMode} />
                <input type="hidden" name="content_property" value={contentProperty} />
                <input type="hidden" name="student_property" value={studentProperty} />
                <input type="hidden" name="topic_property" value={topicProperty} />
                <Button type="submit" disabled={preview.rows.length === 0}>확인한 결과물 읽어오기</Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
