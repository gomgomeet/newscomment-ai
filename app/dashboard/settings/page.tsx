import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const setupItems = [
  "Supabase URL and publishable key are configured.",
  "Supabase migration has been applied.",
  "Email/password Auth is enabled.",
  "Redirect URLs are configured for local and production domains.",
  "RLS is enabled on all app tables.",
  "A second test account cannot see the first account's data.",
];

const privacyItems = [
  "Use fake data for demos and screenshots.",
  "Avoid storing full student names when aliases are enough.",
  "Do not commit .env.local or database exports.",
  "Keep API keys server-side only.",
  "Review AI-generated feedback before sharing it with students.",
  "Confirm school policy before using real student data.",
];

export default function SettingsPage() {
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          배포와 교사 공유 전에 확인할 운영 항목입니다.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>현재 서버 환경에서 확인 가능한 설정입니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p><span className="font-medium">Supabase URL:</span> configured through public env</p>
            <p><span className="font-medium">OpenAI key:</span> {hasOpenAiKey ? "configured" : "not configured"}</p>
            <p><span className="font-medium">AI model:</span> {process.env.OPENAI_EVALUATION_MODEL || "gpt-5.6"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Template Sharing</CardTitle>
            <CardDescription>다른 교사에게 공개할 때 권장하는 방식입니다.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            코드는 공개하고, 각 교사가 자기 Supabase 프로젝트를 연결해 사용하게 하는 방식이 가장 단순하고 안전합니다.
            실제 학생 데이터가 들어간 중앙 DB를 공유 서비스로 운영하려면 학교 승인과 운영 절차가 필요합니다.
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deployment Checklist</CardTitle>
            <CardDescription>실제 사용 전 확인 항목입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {setupItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Privacy Checklist</CardTitle>
            <CardDescription>학생 데이터 사용 전 점검 항목입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {privacyItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
