import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Database, FileText, ShieldCheck, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

const workflow = [
  {
    title: "Notion 자료 연결",
    description: "수업용 Notion 페이지, 데이터베이스, 내보낸 CSV/JSON을 평가 프로젝트의 출발점으로 둡니다.",
    icon: Database,
  },
  {
    title: "성취기준 기반 루브릭",
    description: "교사가 입력한 수업 목적과 성취기준을 바탕으로 평가 기준을 만들고 조정합니다.",
    icon: Wand2,
  },
  {
    title: "댓글과 페이지 분석",
    description: "학생 댓글을 기준별로 평가하고, 프로젝트별·학생별 흐름을 비교할 수 있게 정리합니다.",
    icon: BarChart3,
  },
];

const useCases = [
  "신문기사 댓글 수업",
  "Notion 토론 페이지",
  "학생별 읽기 반응 기록",
  "비판적 읽기 평가",
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center lg:py-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            Notion 기반 수업 자료 평가 분석
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Notion에 모인 학생 댓글과 페이지를 평가 가능한 데이터로 바꿉니다
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            NewsComment AI는 교사가 Notion에 모아 둔 신문기사, 토론 댓글, 읽기 반응 기록을
            프로젝트 단위로 가져와 루브릭 평가와 분석까지 이어 가는 도구입니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {useCases.map((useCase) => (
              <span key={useCase} className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {useCase}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/login">
                로그인
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/sign-up">회원가입</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4 shadow-sm">
          <div className="rounded-md border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="text-sm font-semibold">Notion 수업 페이지</p>
                <p className="mt-1 text-xs text-muted-foreground">댓글 데이터베이스 연결 준비</p>
              </div>
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div className="space-y-3 py-4">
              {["학생 이름", "댓글 내용", "기사 주제", "작성 시간"].map((field) => (
                <div key={field} className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">{field}</span>
                  <span className="h-2 rounded-full bg-muted" />
                </div>
              ))}
            </div>
            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
              {workflow.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="rounded-md border border-border bg-card p-3">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">{step.title}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      <section className="border-t border-border bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-10 md:grid-cols-3">
          {workflow.map((step) => {
            const Icon = step.icon;
            return (
              <article key={step.title} className="space-y-3">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">{step.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
