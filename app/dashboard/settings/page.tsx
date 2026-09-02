import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvaluationNotionConnectionCard } from "@/components/notion/evaluation-notion-connection-card";
import { requireUser } from "@/lib/auth/require-user";
import { getAiDraftProviderStatus } from "@/lib/evaluation/ai-draft-provider";
import { getEvaluationNotionConnectionStatus } from "@/lib/notion/teacher-connection";

const setupItems = [
  "Supabase 주소와 publishable 키를 넣었다.",
  "마이그레이션을 번호 순서대로 적용했다.",
  "이메일/비밀번호 로그인이 켜져 있다.",
  "Google 로그인을 쓴다면 제공자를 켜고 클라이언트 ID와 보안 비밀번호를 넣었다.",
  "로컬 주소와 배포 주소를 Redirect URLs에 등록했다.",
  "모든 표에 RLS가 켜져 있다.",
  "다른 계정으로 로그인하면 내 데이터가 보이지 않는다.",
  "Notion 가져오기를 쓴다면 마이그레이션 002를 적용했다.",
];

const privacyItems = [
  "시연이나 화면 갈무리에는 가짜 데이터를 쓴다.",
  "학생 번호나 별칭으로 충분하면 실명을 저장하지 않는다.",
  ".env.local과 데이터베이스 내보내기 파일은 커밋하지 않는다.",
  "API 키는 서버에만 둔다.",
  "AI가 쓴 피드백은 학생에게 주기 전에 교사가 읽고 고친다.",
  "실제 학생 데이터를 쓰기 전에 학교 방침을 확인한다.",
];

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const notionConnection = await getEvaluationNotionConnectionStatus({ supabase, userId: user.id });
  const aiDraftProvider = getAiDraftProviderStatus();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">설정</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          배포와 교사 공유 전에 확인할 운영 항목입니다.
        </p>
      </div>
      <EvaluationNotionConnectionCard connection={notionConnection} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>연결 상태</CardTitle>
            <CardDescription>현재 서버 환경에서 확인 가능한 설정입니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p><span className="font-medium">Supabase 주소:</span> 공개 환경변수로 설정됨</p>
            <p><span className="font-medium">AI 초안 제공자:</span> {aiDraftProvider.configured ? aiDraftProvider.label : "설정 안 됨"}</p>
            <p><span className="font-medium">AI 모델:</span> {aiDraftProvider.model}</p>
            <p><span className="font-medium">Notion 연결:</span> {notionConnection.configured ? notionConnection.workspaceLabel : "연결 필요"}</p>
            <p><span className="font-medium">Notion API 버전:</span> {process.env.NOTION_API_VERSION || "2022-06-28"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>다른 교사와 공유하기</CardTitle>
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
            <CardTitle>배포 전 확인</CardTitle>
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
            <CardTitle>개인정보 점검</CardTitle>
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
