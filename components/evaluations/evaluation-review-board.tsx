"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Search,
  Sparkles,
  TriangleAlert,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ReviewQueueItem } from "@/lib/evaluation/review-queue-types";

type FilterKey = "priority" | "evidence" | "rewrite" | "growth" | "all";

const filters: { key: FilterKey; label: string }[] = [
  { key: "priority", label: "교사 확인 우선" },
  { key: "evidence", label: "근거 확인" },
  { key: "rewrite", label: "재작성 권장" },
  { key: "growth", label: "성장 기록 준비" },
  { key: "all", label: "전체" },
];

function matchesFilter(item: ReviewQueueItem, filter: FilterKey) {
  if (filter === "priority") return item.signals.teacherReview || item.priorityReasons.length > 0;
  if (filter === "evidence") return item.signals.evidenceConcern;
  if (filter === "rewrite") return item.signals.rewriteRecommended;
  if (filter === "growth") return item.signals.growthReady;
  return true;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-xl bg-muted p-2.5 text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

function EvaluationPanel({
  title,
  score,
  feedback,
  evaluationForward,
  meta,
  changeReason,
  emphasis = false,
}: {
  title: string;
  score: number | null;
  feedback: string | null;
  evaluationForward: string | null;
  meta: string;
  changeReason?: string | null;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-xl border border-indigo-200 bg-indigo-50/60 p-4"
          : "rounded-xl border border-border bg-background p-4"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
        </div>
        <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-sm font-semibold shadow-sm">
          {score == null ? "미채점" : `${score}점`}
        </span>
      </div>
      <dl className="mt-4 space-y-3 text-sm leading-6">
        <div>
          <dt className="font-medium">종합 피드백</dt>
          <dd className="mt-1 text-muted-foreground">{feedback?.trim() || "아직 기록되지 않았습니다."}</dd>
        </div>
        <div>
          <dt className="font-medium">평가 포워드</dt>
          <dd className="mt-1 text-indigo-950">
            {evaluationForward?.trim() || "다음 활동을 위한 제안이 아직 없습니다."}
          </dd>
        </div>
        {changeReason ? (
          <div>
            <dt className="font-medium">교사 판단·수정 이유</dt>
            <dd className="mt-1 text-muted-foreground">{changeReason}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function ReviewCard({ item }: { item: ReviewQueueItem }) {
  const teacherConfirmed = item.teacher?.status === "confirmed";
  const aiConfidence = item.ai?.confidence;

  return (
    <Card className="[content-visibility:auto] [contain-intrinsic-size:720px]">
      <CardHeader className="space-y-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{item.studentLabel}</CardTitle>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {item.projectTitle}
              </span>
              {teacherConfirmed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" /> 교사 확정
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  <TriangleAlert className="size-3.5" aria-hidden="true" /> 확인 필요
                </span>
              )}
            </div>
            <CardDescription className="mt-2">
              결과물 {formatDate(item.createdAt)}
              {aiConfidence != null ? ` · AI 확신도 ${Math.round(aiConfidence * 100)}%` : ""}
            </CardDescription>
          </div>
          {item.scoreDifference != null ? (
            <span className="w-fit rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold">
              교사−AI {item.scoreDifference > 0 ? "+" : ""}{item.scoreDifference.toFixed(1)}점
            </span>
          ) : null}
        </div>

        {item.priorityReasons.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="교사 확인 사유">
            {item.priorityReasons.map((reason) => (
              <span key={reason} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                {reason}
              </span>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-5">
        <section className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">학생 원결과물</p>
            {item.notionPageUrl ? (
              <a
                href={item.notionPageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
              >
                Notion 원본 보기 <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-7">
            {item.content}
          </p>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <EvaluationPanel
            title="AI 평가 초안"
            score={item.ai?.totalScore ?? null}
            feedback={item.ai?.feedback ?? null}
            evaluationForward={item.ai?.evaluationForward ?? null}
            meta={item.ai ? `${item.ai.modelName || "AI 모델"} · 교사 판단 전 초안` : "아직 생성되지 않음"}
            emphasis
          />
          <EvaluationPanel
            title="교사 최종 평가"
            score={item.teacher?.totalScore ?? null}
            feedback={item.teacher?.feedback ?? null}
            evaluationForward={item.teacher?.evaluationForward ?? null}
            changeReason={item.teacher?.changeReason}
            meta={
              item.teacher
                ? `${teacherConfirmed ? "확정" : "작성 중"} · v${item.teacher.revision}`
                : "아직 확정되지 않음"
            }
          />
        </div>

        {item.criteria.length > 0 ? (
          <details className="group rounded-xl border border-border bg-background">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
              기준별 점수와 판단 근거 비교 ({item.criteria.length}개)
              <span className="ml-2 text-xs font-normal text-muted-foreground group-open:hidden">펼치기</span>
            </summary>
            <div className="grid gap-3 border-t border-border p-4 lg:grid-cols-2">
              {item.criteria.map((criterion) => (
                <div key={criterion.id} className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold">{criterion.label}</p>
                    <p className="shrink-0 text-xs font-medium text-muted-foreground">
                      교사 {criterion.teacherScore ?? "-"} · AI {criterion.aiScore ?? "-"} / {criterion.maxScore}
                    </p>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-xs leading-5">
                    <span className="font-semibold text-indigo-800">AI 근거 · </span>
                    {criterion.aiRationale?.trim() || "근거 없음"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5">
                    <span className="font-semibold">교사 근거 · </span>
                    {criterion.teacherRationale?.trim() || "아직 기록되지 않음"}
                  </p>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/dashboard/projects/${item.projectId}?view=answers#comment-${item.commentId}`}>
              문항별 교사 피드백 <ArrowRight className="ml-1 size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/projects/${item.projectId}/results`}>활동 평가 결과</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EvaluationReviewBoard({
  items,
  initialProjectId = "all",
}: {
  items: ReviewQueueItem[];
  initialProjectId?: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("priority");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("ko-KR"));

  const projects = useMemo(
    () => Array.from(new Map(items.map((item) => [item.projectId, item.projectTitle]))),
    [items],
  );
  const projectItems = useMemo(
    () => projectId === "all" ? items : items.filter((item) => item.projectId === projectId),
    [items, projectId],
  );
  const counts = useMemo(
    () => ({
      priority: projectItems.filter((item) => matchesFilter(item, "priority")).length,
      evidence: projectItems.filter((item) => matchesFilter(item, "evidence")).length,
      rewrite: projectItems.filter((item) => matchesFilter(item, "rewrite")).length,
      growth: projectItems.filter((item) => matchesFilter(item, "growth")).length,
      all: projectItems.length,
      confirmed: projectItems.filter((item) => item.teacher?.status === "confirmed").length,
      aiWaiting: projectItems.filter((item) => !item.ai).length,
    }),
    [projectItems],
  );
  const visibleItems = useMemo(() => {
    return projectItems.filter((item) => {
      if (!matchesFilter(item, filter)) return false;
      if (!deferredQuery) return true;

      const haystack = [
        item.studentLabel,
        item.projectTitle,
        item.content,
        ...item.priorityReasons,
      ].join(" ").toLocaleLowerCase("ko-KR");
      return haystack.includes(deferredQuery);
    });
  }, [deferredQuery, filter, projectItems]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
            <Sparkles className="size-4" aria-hidden="true" /> 과정중심 평가
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">교사 피드백</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Notion에서 읽어온 원결과물과 AI 판단 근거를 비교하고, 교사가 확인할 평가부터 골라 최종 평가와 평가 포워드를 확정합니다.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/dashboard/insights">
            <BarChart3 className="mr-1 size-4" aria-hidden="true" /> 기준별 결과 분석
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="전체 결과물" value={counts.all} description="연결된 모든 평가활동" icon={FileSearch} />
        <SummaryCard title="교사 확인 우선" value={counts.priority} description="미확정 또는 추가 판단 필요" icon={TriangleAlert} />
        <SummaryCard title="교사 최종 확정" value={counts.confirmed} description="평가 포워드 누적 가능" icon={UserRoundCheck} />
        <SummaryCard title="AI 초안 대기" value={counts.aiWaiting} description="초안 생성을 시작할 결과물" icon={Sparkles} />
      </div>

      <div className="sticky top-3 z-10 space-y-3 rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {filters.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant={filter === option.key ? "default" : "outline"}
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label} ({counts[option.key]})
            </Button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px_auto]">
          <div className="relative">
            <Label htmlFor="review-search" className="sr-only">학생·활동·결과물 검색</Label>
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="review-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="학생, 활동, 결과물 내용 검색"
              className="pl-9"
            />
          </div>
          <div>
            <Label htmlFor="review-project" className="sr-only">평가활동 선택</Label>
            <Select id="review-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="all">모든 평가활동</option>
              {projects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </Select>
          </div>
          {projectId === "all" ? (
            <Button type="button" variant="outline" disabled>문항별 교사 피드백</Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/dashboard/projects/${projectId}?view=answers`}>문항별 교사 피드백</Link>
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>연결된 결과물이 없습니다</CardTitle>
            <CardDescription>평가활동에서 Notion 결과물을 가져오거나 결과물을 직접 추가하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/dashboard/projects">평가활동 열기</Link></Button>
          </CardContent>
        </Card>
      ) : visibleItems.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>이 조건에 해당하는 결과물이 없습니다</CardTitle>
            <CardDescription>필터나 검색어를 바꾸면 다른 결과물을 확인할 수 있습니다.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">조건에 맞는 결과물 {visibleItems.length}개</p>
          {visibleItems.map((item) => <ReviewCard key={item.commentId} item={item} />)}
        </div>
      )}
    </div>
  );
}
