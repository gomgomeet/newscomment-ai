"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Copy,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTIONING_CHATBOT_CONFIG_KEY,
  buildRubric,
  createLocalQuestionResult,
  emptyMaterialAnalysis,
  type ChatMessage,
  type ChatResult,
  type QuestionType,
  type QuestioningChatbotConfig,
} from "@/lib/questioning-board";
import { cn } from "@/lib/utils";

const quickQuestions = [
  "자료에서 확인할 수 있는 중요한 사실은 무엇인가요?",
  "왜 이런 결과가 나타났을까요?",
  "우리 반이나 학교에서는 어떻게 적용할 수 있을까요?",
  "내 질문은 자료 속 근거를 확인하기에 좋은 질문인가요?",
];

const questionTypeStyles: Record<QuestionType, string> = {
  fact: "border-blue-200 bg-blue-50 text-blue-800",
  inference: "border-emerald-200 bg-emerald-50 text-emerald-800",
  application: "border-amber-200 bg-amber-50 text-amber-800",
  reflection: "border-rose-200 bg-rose-50 text-rose-800",
  off_topic: "border-slate-200 bg-slate-100 text-slate-700",
  safety: "border-red-200 bg-red-50 text-red-800",
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createFallbackConfig(): QuestioningChatbotConfig {
  return {
    targetGrade: "",
    subjectUnit: "질문하기 수업",
    standard: "",
    material: emptyMaterialAnalysis(),
    rubric: buildRubric(""),
    prdText: "",
    updatedAt: "",
  };
}

function isQuestioningConfig(value: unknown): value is QuestioningChatbotConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const config = value as Partial<QuestioningChatbotConfig>;
  return (
    typeof config.targetGrade === "string" &&
    typeof config.subjectUnit === "string" &&
    typeof config.standard === "string" &&
    typeof config.material === "object" &&
    config.material !== null &&
    Array.isArray(config.rubric)
  );
}

function getLatestResult(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.result) {
      const previous = messages[index - 1];
      return {
        result: message.result,
        question: previous?.role === "student" ? previous.content : "",
      };
    }
  }

  return null;
}

export function StudentQuestionHelperChatbot() {
  const [config, setConfig] = useState<QuestioningChatbotConfig>(() => createFallbackConfig());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [revisedQuestion, setRevisedQuestion] = useState("");
  const [reflectionNote, setReflectionNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");

  const materialReady = Boolean(config.material.summary.trim());
  const rubric = config.rubric.length ? config.rubric : buildRubric(config.standard);
  const seedQuestions = config.material.questionSeeds.length ? config.material.questionSeeds : quickQuestions;
  const latest = useMemo(() => getLatestResult(messages), [messages]);

  const activityRecord = useMemo(() => {
    return [
      `첫 질문: ${latest?.question || ""}`,
      `질문 유형: ${latest?.result.typeLabel || ""}`,
      `챗봇 답 요약: ${latest?.result.answer || ""}`,
      `자료 속 근거: ${evidenceNote}`,
      `고친 질문: ${revisedQuestion}`,
      `성찰 문장: ${reflectionNote}`,
    ].join("\n");
  }, [evidenceNote, latest, reflectionNote, revisedQuestion]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(QUESTIONING_CHATBOT_CONFIG_KEY);
      if (!stored) {
        setNotice("교사용 보드에서 수업 자료를 먼저 반영하면 이 챗봇이 해당 자료와 연결됩니다.");
        return;
      }

      try {
        const parsed = JSON.parse(stored) as unknown;
        if (!isQuestioningConfig(parsed)) {
          throw new Error("저장된 챗봇 설정 형식이 올바르지 않습니다.");
        }
        setConfig(parsed);
        setNotice("교사용 보드의 수업 자료와 루브릭이 연결되었습니다.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "챗봇 설정을 읽을 수 없습니다.";
        setNotice(message);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleAskQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    if (!materialReady) {
      setNotice("교사용 보드에서 수업 자료를 먼저 반영해야 질문 도우미 챗봇을 사용할 수 있습니다.");
      return;
    }

    const studentMessage: ChatMessage = {
      id: makeId(),
      role: "student",
      content: trimmedQuestion,
    };

    setMessages((current) => [...current, studentMessage]);
    setQuestion("");
    setIsSending(true);
    setNotice("");

    try {
      const response = await fetch("/api/questioning-board/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standard: config.standard,
          targetGrade: config.targetGrade,
          subjectUnit: config.subjectUnit,
          material: config.material,
          rubric,
          question: trimmedQuestion,
        }),
      });
      const payload = (await response.json()) as ChatResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "챗봇 응답 생성에 실패했습니다.");
      }

      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: payload.answer,
        result: payload,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      const fallback = createLocalQuestionResult({
        question: trimmedQuestion,
        material: config.material,
        rubric,
      });
      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: fallback.answer,
        result: fallback,
      };
      setMessages((current) => [...current, assistantMessage]);
      const message = error instanceof Error ? error.message : "AI 응답에 실패했습니다.";
      setNotice(`${message} 현재 응답은 로컬 예비 분류로 생성했습니다.`);
    } finally {
      setIsSending(false);
    }
  }

  async function handleCopyActivityRecord() {
    await navigator.clipboard.writeText(activityRecord);
    setNotice("현재 질문 활동 기록을 복사했습니다.");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground">
                <Bot className="size-4 text-primary" aria-hidden="true" />
                학생용 질문 도우미 챗봇
              </div>
              <h1 className="mt-4 text-2xl font-semibold leading-tight sm:text-3xl">
                자료를 보고 질문하고, 근거를 확인하고, 더 나은 질문으로 고쳐 씁니다
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                {config.subjectUnit} · {config.targetGrade || "대상 미정"}
              </p>
            </div>
            <Button asChild type="button" variant="outline">
              <a href="/questioning-board">교사용 보드</a>
            </Button>
          </div>
          {notice ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{notice}</p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <section className="space-y-4">
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">수업 자료 범위</h2>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm leading-6 text-muted-foreground">
                {config.material.summary || "아직 교사용 보드에서 연결된 수업 자료가 없습니다."}
              </p>
              {config.material.keyConcepts.length ? (
                <div className="flex flex-wrap gap-2">
                  {config.material.keyConcepts.map((concept) => (
                    <span key={concept} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {concept}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">질문 대화</h2>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                {seedQuestions.slice(0, 4).map((seed) => (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => setQuestion(seed)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                  >
                    {seed}
                  </button>
                ))}
              </div>
              <div className="h-[460px] space-y-3 overflow-y-auto rounded-md border border-border bg-background p-3">
                {messages.length ? (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "rounded-md border p-3 text-sm leading-6",
                        message.role === "student"
                          ? "ml-8 border-primary/20 bg-primary/5"
                          : "mr-8 border-border bg-card",
                      )}
                    >
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">
                        {message.role === "student" ? "내 질문" : "질문 도우미"}
                      </p>
                      <p>{message.content}</p>
                      {message.result ? (
                        <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              "inline-flex rounded-md border px-2 py-1 font-medium",
                              questionTypeStyles[message.result.questionType],
                            )}
                          >
                            {message.result.typeLabel}
                          </span>
                          <p>{message.result.typeReason}</p>
                          <p>
                            <b className="text-foreground">근거 확인</b> · {message.result.evidencePrompt}
                          </p>
                          <p>
                            <b className="text-foreground">질문 수정</b> · {message.result.revisionSuggestion}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
                    <Bot className="mb-3 size-8 text-primary" aria-hidden="true" />
                    자료를 보고 궁금한 점을 질문해 보세요.
                  </div>
                )}
              </div>
              <form className="space-y-2" onSubmit={handleAskQuestion}>
                <Label htmlFor="student-question">내 질문</Label>
                <Textarea
                  id="student-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="자료를 보고 궁금한 점을 질문해 보세요."
                  className="min-h-24"
                />
                <Button type="submit" className="w-full" disabled={isSending || !materialReady}>
                  {isSending ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  질문 보내기
                </Button>
              </form>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">질문 활동 기록</h2>
              </div>
            </div>
            <div className="space-y-4 p-4">
              {latest ? (
                <div className="rounded-md border border-border bg-background p-3 text-sm leading-6">
                  <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-medium", questionTypeStyles[latest.result.questionType])}>
                    {latest.result.typeLabel}
                  </span>
                  <p className="mt-3 text-muted-foreground">{latest.result.revisionSuggestion}</p>
                </div>
              ) : (
                <div className="rounded-md border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
                  질문을 보내면 이곳에 제출용 기록을 정리할 수 있습니다.
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="evidence-note">자료 속 근거</Label>
                <Textarea
                  id="evidence-note"
                  value={evidenceNote}
                  onChange={(event) => setEvidenceNote(event.target.value)}
                  placeholder="근거가 되는 문장, 장면, 표를 적어 보세요."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revised-question">고친 질문</Label>
                <Textarea
                  id="revised-question"
                  value={revisedQuestion}
                  onChange={(event) => setRevisedQuestion(event.target.value)}
                  placeholder="처음 질문을 더 구체적이고 깊은 질문으로 고쳐 보세요."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reflection-note">성찰 문장</Label>
                <Textarea
                  id="reflection-note"
                  value={reflectionNote}
                  onChange={(event) => setReflectionNote(event.target.value)}
                  placeholder="내 질문이 어떻게 좋아졌는지 적어 보세요."
                />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={handleCopyActivityRecord} disabled={!latest}>
                <Copy className="size-4" aria-hidden="true" />
                기록 복사
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">평가 기준</h2>
              </div>
            </div>
            <div className="space-y-2 p-4">
              {rubric.map((criterion) => (
                <div key={criterion.key} className="rounded-md border border-border bg-background p-3">
                  <p className="text-sm font-semibold">{criterion.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{criterion.feedbackForward}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
