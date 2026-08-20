import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

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
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            NewsComment AI
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            교사의 뉴스 댓글 평가 업무를 구조화하는 AI 평가 도구
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            프로젝트와 루브릭을 관리하고, 학생 댓글 평가와 비교 분석을 위한 기반을 제공합니다.
            Milestone 1에서는 인증, 보호된 앱 셸, 프로젝트 관리, Supabase RLS 기반을 완성합니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/login">로그인</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/sign-up">회원가입</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
