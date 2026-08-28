"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Link2Off, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  initialNotionConnectionActionState,
  updateEvaluationNotionConnection,
} from "@/app/dashboard/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EvaluationNotionConnectionStatus } from "@/lib/notion/teacher-connection";

function formatVerifiedAt(value: string | null) {
  if (!value) return "서버 공용 연결";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function EvaluationNotionConnectionCard({
  connection,
  compact = false,
}: {
  connection: EvaluationNotionConnectionStatus;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateEvaluationNotionConnection,
    initialNotionConnectionActionState,
  );
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const setupReady = connection.storageReady && connection.encryptionReady;

  useEffect(() => {
    if (state.status === "success" && tokenInputRef.current) {
      tokenInputRef.current.value = "";
    }
  }, [state.status]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value === "disconnect" && !window.confirm("저장된 내 Notion 연결을 끊을까요?")) {
      event.preventDefault();
      return;
    }
  }

  return (
    <Card id="notion-connection" className={connection.configured ? "border-teal-200" : "border-amber-200"}>
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> 내 Notion 연결
            </CardTitle>
            <CardDescription className="mt-1">
              학생 결과물은 읽기 전용으로 가져오고, 확정 기록 저장은 교사가 선택할 때만 실행합니다.
            </CardDescription>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${connection.configured ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-900"}`}>
            {connection.configured ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
            {connection.configured ? "사용 가능" : "연결 필요"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection.source !== "none" ? (
          <div className="rounded-xl bg-muted/50 p-4 text-sm">
            <p className="font-semibold">{connection.workspaceLabel}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {connection.source === "teacher" ? "교사 개인 암호화 연결" : "서버 공용 시연 연결"} · 확인 {formatVerifiedAt(connection.lastVerifiedAt)}
            </p>
          </div>
        ) : null}

        {!connection.storageReady ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            Supabase에 <code>teacher_notion_connections</code> 마이그레이션을 적용해야 교사별 연결을 저장할 수 있습니다.
          </p>
        ) : null}
        {!connection.encryptionReady ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            Vercel과 로컬 서버에 <code>EVALUATION_SECRET_ENCRYPTION_KEY</code>를 16자 이상으로 설정해 주세요.
          </p>
        ) : null}

        <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
          <div className={compact ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
            <div className="space-y-2">
              <Label htmlFor={`notion_api_key_${compact ? "compact" : "full"}`}>Notion 내부 통합 토큰</Label>
              <Input
                ref={tokenInputRef}
                id={`notion_api_key_${compact ? "compact" : "full"}`}
                name="notion_api_key"
                type="password"
                autoComplete="new-password"
                placeholder={connection.source === "teacher" ? "새 토큰으로 교체할 때 입력" : "ntn_... 또는 secret_..."}
                required
                disabled={!setupReady || pending}
              />
              <p className="text-xs leading-5 text-muted-foreground">입력값은 연결 확인 뒤 암호화되며 화면에 다시 표시되지 않습니다.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`default_export_parent_page_${compact ? "compact" : "full"}`}>기본 내보내기 상위 페이지 (선택)</Label>
              <Input
                id={`default_export_parent_page_${compact ? "compact" : "full"}`}
                name="default_export_parent_page"
                defaultValue={connection.defaultExportParentPageId ?? ""}
                placeholder="https://www.notion.so/..."
                disabled={!setupReady || pending}
              />
              <p className="text-xs leading-5 text-muted-foreground">성장 기록을 선택 저장할 기본 위치입니다. 결과물 원본 DB와는 분리됩니다.</p>
            </div>
          </div>

          {state.message ? (
            <p aria-live="polite" className={`rounded-lg px-3 py-2 text-sm ${state.status === "error" ? "bg-destructive/10 text-destructive" : "bg-teal-50 text-teal-900"}`}>
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-700 hover:underline">
              Notion 통합 관리 열기
            </Link>
            <div className="flex gap-2">
              {connection.source === "teacher" ? (
                <Button type="submit" name="operation" value="disconnect" variant="outline" formNoValidate disabled={pending}>
                  <Link2Off className="h-4 w-4" /> 연결 끊기
                </Button>
              ) : null}
              <Button type="submit" name="operation" value="save" disabled={!setupReady || pending}>
                <ShieldCheck className="h-4 w-4" /> {pending ? "확인 중..." : "연결 확인 및 저장"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
