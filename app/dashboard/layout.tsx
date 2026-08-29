import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="flex-1 px-4 py-6 print:p-0 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
