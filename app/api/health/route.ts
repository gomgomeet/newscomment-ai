import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "newscomment-ai",
    milestone: 1,
    timestamp: new Date().toISOString(),
  });
}
