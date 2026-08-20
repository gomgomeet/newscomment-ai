import type { User } from "@supabase/supabase-js";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <div>
        <p className="text-sm text-muted-foreground">교사용 평가 작업공간</p>
        <h1 className="text-lg font-semibold text-foreground">Milestone 1</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:inline">
          {user.email}
        </span>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            로그아웃
          </Button>
        </form>
      </div>
    </header>
  );
}
