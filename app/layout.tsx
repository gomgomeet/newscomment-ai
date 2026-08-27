import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "NewsComment AI - 과정 중심 평가 보드",
  description: "학생이 쓴 뉴스 댓글을 루브릭으로 채점하고 학급의 성장을 살펴보는 교사용 보드",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
