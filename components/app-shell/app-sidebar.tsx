"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Database } from "lucide-react";
import { navigation } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTeacherFeedbackPage = pathname.startsWith("/dashboard/projects/") && searchParams.get("view") === "answers";

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 flex-col border-r border-border bg-card print:hidden md:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link href="/dashboard" className="text-base font-semibold text-foreground">
          과정 중심 평가 보드
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/dashboard/compare"
            ? isTeacherFeedbackPage || pathname === item.href || pathname.startsWith(`${item.href}/`)
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                active && "bg-muted text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <Link
          href="/dashboard/projects"
          className="flex items-center gap-3 rounded-md border border-teal-700 bg-teal-700 px-3 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800"
        >
          <Database className="h-4 w-4" aria-hidden="true" />
          Notion 자료 평가
        </Link>
      </div>
    </aside>
  );
}
