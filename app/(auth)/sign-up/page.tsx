import Link from "next/link";
import { signUp } from "@/app/(auth)/actions";
import { AuthDivider, GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>회원가입</CardTitle>
        <CardDescription>교사용 평가 작업공간을 생성합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <GoogleSignInButton label="Google로 시작하기" />
        <AuthDivider />
        <form action={signUp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">이름</Label>
            <Input id="full_name" name="full_name" type="text" autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <p className="text-xs leading-5 text-muted-foreground">
            계정을 만들면 입력한 주소로 확인 메일이 갑니다. 메일의 인증 링크를 눌러야 로그인할 수 있습니다.
          </p>
          <Button type="submit" className="w-full">계정 만들기</Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          이미 계정이 있나요?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            로그인
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
