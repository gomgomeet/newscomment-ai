import { notFound } from "next/navigation";
import { submitAssessmentSurvey } from "@/app/assessment/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readAssessmentSurveyConfig, verifyAssessmentSurveyToken } from "@/lib/evaluation/assessment-survey";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function StudentAssessmentSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; token: string }>;
  searchParams: Promise<{ message?: string; submitted?: string }>;
}) {
  const { projectId, token } = await params;
  const { message, submitted } = await searchParams;
  const supabase = createAdminClient();

  const [{ data: project }, { data: prep }] = await Promise.all([
    supabase.from("projects").select("id, notion_source").eq("id", projectId).maybeSingle(),
    supabase.from("assessment_preps").select("active_version_id").eq("project_id", projectId).maybeSingle(),
  ]);

  if (!project || !prep?.active_version_id || !verifyAssessmentSurveyToken(project.id, prep.active_version_id, token)) notFound();
  const survey = readAssessmentSurveyConfig(project.notion_source);
  if (!survey || survey.versionId !== prep.active_version_id) notFound();
  const currentSchoolYear = Number(new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date()).replace(/\D/g, ""));

  if (submitted === "1") {
    return (
      <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-5 py-12">
        <div className="w-full rounded-md border bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">답을 제출했습니다</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">선생님의 결과 목록에 안전하게 저장되었습니다.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <div className="border-b pb-5">
        <p className="text-sm font-semibold text-teal-700">학생 평가지</p>
        <h1 className="mt-1 text-2xl font-semibold">{survey.title}</h1>
      </div>

      <section className="mt-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold">읽을 자료</h2>
          <p className="mt-2 whitespace-pre-wrap rounded-md border bg-white px-4 py-4 text-[15px] leading-8">{survey.sourceText}</p>
        </div>
        <div>
          <h2 className="text-base font-semibold">해야 할 일</h2>
          <div className="mt-2 space-y-2">
            {survey.prompts.map((prompt, index) => (
              <p key={index} className="rounded-md bg-teal-50 px-4 py-4 text-[15px] font-medium leading-7 text-teal-950">
                {index + 1}. {prompt}
              </p>
            ))}
          </div>
        </div>
      </section>

      {message ? <p className="mt-5 rounded-md border border-destructive px-4 py-3 text-sm text-destructive">{message}</p> : null}

      <form action={submitAssessmentSurvey} className="mt-6 space-y-5">
        <input type="hidden" name="project_id" value={project.id} />
        <input type="hidden" name="version_id" value={prep.active_version_id} />
        <input type="hidden" name="token" value={token} />
        <div className="hidden" aria-hidden="true">
          <Label htmlFor="website">웹사이트</Label><Input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="school_year">학년도</Label>
            <Input id="school_year" name="school_year" type="number" min={2000} max={2100} defaultValue={currentSchoolYear} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grade_number">학년</Label>
            <Input id="grade_number" name="grade_number" type="number" min={1} max={6} placeholder="예: 4" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="class_number">반</Label>
            <Input id="class_number" name="class_number" type="number" min={1} max={30} placeholder="예: 1" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student_number">번호</Label>
            <Input id="student_number" name="student_number" type="number" min={1} max={99} placeholder="예: 12" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student_name">이름</Label>
            <Input id="student_name" name="student_name" maxLength={50} placeholder="이름" required />
          </div>
        </div>
        {survey.prompts.map((prompt, index) => (
          <div key={index} className="space-y-2 rounded-md border bg-white p-4">
            <Label htmlFor={`answer_${index}`}>{index + 1}번 답</Label>
            <p className="text-sm leading-6 text-muted-foreground">{prompt}</p>
            <Textarea id={`answer_${index}`} name={`answer_${index}`} rows={7} maxLength={5000} required />
          </div>
        ))}
        <Button type="submit" className="w-full">답 제출하기</Button>
      </form>
    </main>
  );
}
