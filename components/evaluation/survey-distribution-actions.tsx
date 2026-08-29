"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, ExternalLink, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SurveyDistributionActions({ surveyPath }: { surveyPath: string | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surveyUrl = typeof window === "undefined" || !surveyPath
    ? surveyPath ?? ""
    : `${window.location.origin}${surveyPath}`;

  useEffect(() => {
    if (!open || !canvasRef.current || !surveyUrl) return;
    void QRCode.toCanvas(canvasRef.current, surveyUrl, {
      width: 220,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    });
  }, [open, surveyUrl]);

  async function copyLink() {
    if (!surveyUrl) return;
    await navigator.clipboard.writeText(surveyUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!surveyPath}
        onClick={() => setOpen(true)}
      >
        <QrCode className="h-4 w-4" /> 학생 배포 링크·QR
      </Button>

      {open && surveyPath ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="survey-distribution-title"
            className="w-full max-w-md rounded-md bg-background p-5 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="survey-distribution-title" className="text-lg font-semibold">학생에게 평가지 배포</h2>
                <p className="mt-1 text-sm text-muted-foreground">링크를 보내거나 화면의 QR 코드를 보여 주세요.</p>
              </div>
              <Button type="button" variant="ghost" className="h-9 w-9 p-0" onClick={() => setOpen(false)} aria-label="닫기">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 grid place-items-center rounded-md border bg-white p-4">
              <canvas ref={canvasRef} aria-label="학생용 평가지 QR 코드" />
            </div>

            <div className="mt-4 flex gap-2">
              <Input value={surveyUrl} readOnly aria-label="학생용 평가지 링크" />
              <Button type="button" variant="outline" onClick={copyLink} aria-label="링크 복사">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="mt-4 flex justify-end">
              <Button asChild>
                <Link href={surveyPath} target="_blank">학생 화면 열기 <ExternalLink className="h-4 w-4" /></Link>
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
