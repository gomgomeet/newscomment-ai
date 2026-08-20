import Link from "next/link";
import { signIn } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { message, notice } = await searchParams;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>NewsComment AI 대시보드에 접속합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {notice ? (
          <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <form action={signIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <Button type="submit" className="w-full">로그인</Button>
        </form>
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
          로그인이 되지 않는다면 가입할 때 받은 확인 메일의 인증 링크를 눌렀는지 확인해 주세요.
          메일이 보이지 않으면 스팸함도 확인해 보세요.
        </p>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          계정이 없나요?{" "}
          <Link href="/sign-up" className="font-medium text-primary hover:underline">
            회원가입
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
