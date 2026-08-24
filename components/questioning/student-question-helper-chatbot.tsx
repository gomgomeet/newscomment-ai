"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTIONING_AI_SETTINGS_KEY,
  QUESTIONING_CHATBOT_CONFIG_KEY,
  buildRubric,
  buildStandardAssessmentAnalysis,
  createDefaultQuestioningChatbotBehavior,
  createDefaultQuestioningLessonMaterial,
  createLocalQuestionResult,
  isQuestioningAiSettings,
  normalizeQuestioningChatbotBehavior,
  standardOptions,
  type ChatMessage,
  type ChatResult,
  type QuestioningAiSettings,
  type QuestioningChatbotConfig,
} from "@/lib/questioning-board";
import { cn } from "@/lib/utils";

const quickQuestions = [
  "자료에서 확인할 수 있는 중요한 사실은 무엇인가요?",
  "왜 이런 결과가 나타났을까요?",
  "우리 반이나 학교에서는 어떻게 적용할 수 있을까요?",
  "이 자료를 읽고 새롭게 궁금해진 점은 무엇인가요?",
];

const defaultStandard = standardOptions[0];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createFallbackConfig(): QuestioningChatbotConfig {
  const material = createDefaultQuestioningLessonMaterial();
  return {
    targetGrade: defaultStandard.gradeBand,
    subjectUnit: `${defaultStandard.subject} / 질문하기 수업`,
    standard: defaultStandard.standard,
    assessmentAnalysis: buildStandardAssessmentAnalysis(defaultStandard.standard),
    material,
    rubric: buildRubric(defaultStandard.standard),
    behavior: createDefaultQuestioningChatbotBehavior(),
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

function normalizeQuestioningConfig(config: QuestioningChatbotConfig): QuestioningChatbotConfig {
  return {
    ...config,
    behavior: normalizeQuestioningChatbotBehavior(config.behavior),
  };
}

function formatUpdatedAt(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function StudentQuestionHelperChatbot() {
  const [config, setConfig] = useState<QuestioningChatbotConfig>(() => createFallbackConfig());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [aiSettings, setAiSettings] = useState<QuestioningAiSettings | null>(null);
  const [isQuestionMaterialOpen, setIsQuestionMaterialOpen] = useState(false);
  const [isChatStarted, setIsChatStarted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");

  const materialReady = Boolean(config.material.summary.trim());
  const questionMaterialText = config.material.visibleText.trim() || config.material.summary.trim();
  const rubric = config.rubric.length ? config.rubric : buildRubric(config.standard);
  const seedQuestions = useMemo(() => {
    const materialSeeds = config.material.questionSeeds.filter(
      (seed) => !/(좋은 질문|질문 유형|분류|평가|근거를 확인하기에)/.test(seed),
    );
    return Array.from(new Set([...materialSeeds, ...quickQuestions])).slice(0, 4);
  }, [config.material.questionSeeds]);
  const connectedAt = useMemo(() => formatUpdatedAt(config.updatedAt), [config.updatedAt]);

  useEffect(() => {
    function applyAiSettings(storedValue: string | null) {
      if (!storedValue) {
        setAiSettings(null);
        return;
      }

      try {
        const parsedAiSettings = JSON.parse(storedValue) as unknown;
        if (isQuestioningAiSettings(parsedAiSettings) && parsedAiSettings.apiKey.trim()) {
          setAiSettings(parsedAiSettings);
          return;
        }
        setAiSettings(null);
      } catch {
        setAiSettings(null);
      }
    }

    function applyChatbotConfig(storedValue: string | null, successMessage: string) {
      if (!storedValue) {
        setConfig(createFallbackConfig());
        setNotice("기본 수업 자료가 연결되었습니다. 교사용 보드에서 수정하면 수정한 자료가 우선 적용됩니다.");
        return;
      }

      try {
        const parsed = JSON.parse(storedValue) as unknown;
        if (!isQuestioningConfig(parsed)) {
          throw new Error("저장된 챗봇 설정 형식이 올바르지 않습니다.");
        }
        setConfig(normalizeQuestioningConfig(parsed));
        setNotice(successMessage);
      } catch (error) {
        const message = error instanceof Error ? error.message : "챗봇 설정을 읽을 수 없습니다.";
        setNotice(message);
      }
    }

    const timer = window.setTimeout(() => {
      applyAiSettings(window.localStorage.getItem(QUESTIONING_AI_SETTINGS_KEY));
      applyChatbotConfig(
        window.localStorage.getItem(QUESTIONING_CHATBOT_CONFIG_KEY),
        "교사용 보드의 수업 자료와 챗봇 동작 설정이 연결되었습니다.",
      );
    }, 0);

    function handleStorage(event: StorageEvent) {
      if (event.key === QUESTIONING_AI_SETTINGS_KEY) {
        applyAiSettings(event.newValue);
      }
      if (event.key === QUESTIONING_CHATBOT_CONFIG_KEY) {
        applyChatbotConfig(event.newValue, "교사용 보드에서 수정한 챗봇 설정을 바로 적용했습니다.");
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  function handleStartChat() {
    if (isChatStarted || !materialReady) {
      return;
    }

    const greetingMessage: ChatMessage = {
      id: makeId(),
      role: "assistant",
      content:
        "안녕하세요! 저는 질문 자료를 함께 살펴보는 질문 도우미예요. 자료에서 가장 먼저 눈에 들어온 내용이나 궁금한 점을 말해 주세요.",
    };

    setMessages([greetingMessage]);
    setIsChatStarted(true);
    setNotice("");
  }

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

    if (!isChatStarted) {
      setNotice("먼저 채팅 시작을 눌러 질문 도우미와 대화를 시작해 주세요.");
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
          behavior: config.behavior,
          question: trimmedQuestion,
          conversation: messages.slice(-8).map((message) => ({
            role: message.role,
            content:
              message.role === "assistant" && message.result?.followUpQuestion
                ? `${message.content}\n${message.result.followUpQuestion}`
                : message.content,
          })),
          ...(aiSettings?.apiKey ? { apiKey: aiSettings.apiKey, model: aiSettings.model } : {}),
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
    } catch {
      const fallback = createLocalQuestionResult({
        question: trimmedQuestion,
        material: config.material,
        rubric,
        behavior: config.behavior,
      });
      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: fallback.answer,
        result: fallback,
      };
      setMessages((current) => [...current, assistantMessage]);
      setNotice("생성형 AI 응답을 사용할 수 없어 현재 질문 자료를 바탕으로 로컬 응답을 제공했습니다.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-[linear-gradient(135deg,#fde7c6_0%,#bdebf0_46%,#ddd6fe_100%)] text-slate-800"
      style={{
        fontFamily:
          '"Comic Sans MS", "Segoe Print", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif',
      }}
    >
      <header className="border-b border-teal-100 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-cyan-50 px-4 py-2 text-sm font-semibold text-teal-700 shadow-sm">
                <Bot className="size-4 text-teal-500" aria-hidden="true" />
                질문 챗봇(학생용)
              </div>
              <h1 className="mt-4 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                챗봇에게 질문하기
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-600">
                {config.subjectUnit} · {config.targetGrade || "대상 미정"}
              </p>
            </div>
            <Button
              asChild
              type="button"
              variant="outline"
              className="rounded-full border-teal-100 bg-white/90 text-teal-700 shadow-sm hover:bg-cyan-50"
            >
              <a href="/questioning-board">교사용 보드</a>
            </Button>
          </div>
          {notice ? (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 shadow-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{notice}</p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <section className="space-y-4">
          <div className="rounded-3xl border border-teal-100 bg-white/95 shadow-sm backdrop-blur">
            <div className="border-b border-teal-100 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-teal-500" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-900">제작보드 연결</h2>
              </div>
            </div>
            <div className="grid gap-3 p-4 text-sm leading-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold text-teal-700">수업 자료</p>
                <p className="mt-1 font-semibold text-slate-800">{config.material.materialTitle || "연결된 자료 없음"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-teal-700">연결 상태</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {materialReady ? `연결됨${connectedAt ? ` · ${connectedAt}` : ""}` : "교사용 보드 설정 필요"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-teal-700">성취기준</p>
                <p className="mt-1 text-slate-600">{config.standard || "성취기준 미연결"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-teal-700">AI 응답</p>
                <p className="mt-1 text-slate-600">
                  {aiSettings?.apiKey
                    ? "제작보드에 저장된 Gemini API 키 사용"
                    : "서버 기본 설정 또는 로컬 예비 모드"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-sky-100 bg-white/95 shadow-sm backdrop-blur">
            <div
              className={cn(
                "flex items-center justify-between gap-3 p-4",
                isQuestionMaterialOpen && "border-b border-sky-100",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 shrink-0 text-sky-500" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-900">질문 자료</h2>
                </div>
                <p className="mt-1 break-words pl-7 text-xl font-bold leading-8 text-slate-900">
                  {config.material.materialTitle || "연결된 질문 자료 없음"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={isQuestionMaterialOpen}
                aria-controls="student-question-material"
                onClick={() => setIsQuestionMaterialOpen((current) => !current)}
                className="rounded-full border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100"
              >
                {isQuestionMaterialOpen ? "닫기" : "열기"}
                {isQuestionMaterialOpen ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            {isQuestionMaterialOpen ? (
              <div id="student-question-material" className="space-y-3 p-4">
                <p className="whitespace-pre-wrap break-words rounded-2xl bg-sky-100/80 p-4 text-sm leading-7 text-slate-800">
                  {questionMaterialText || "아직 교사용 보드에서 연결된 질문 자료가 없습니다."}
                </p>
                {config.material.keyConcepts.length ? (
                  <div className="flex flex-wrap gap-2">
                    {config.material.keyConcepts.map((concept) => (
                      <span key={concept} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                        {concept}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-violet-100 bg-white/95 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3 border-b border-violet-100 p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-violet-500" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-900">질문 대화</h2>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleStartChat}
                disabled={isChatStarted || !materialReady}
                className="rounded-full bg-violet-500 text-white shadow-sm hover:bg-violet-600"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {isChatStarted ? "대화 중" : "채팅 시작"}
              </Button>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                {seedQuestions.slice(0, 4).map((seed) => (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => setQuestion(seed)}
                    disabled={!isChatStarted}
                    className="rounded-full border border-amber-100 bg-amber-100/90 px-3 py-1.5 text-left text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {seed}
                  </button>
                ))}
              </div>
              <div
                className="h-[460px] space-y-3 overflow-y-auto rounded-3xl border border-violet-100 bg-violet-100/70 p-3"
                aria-live="polite"
              >
                {messages.length ? (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "rounded-3xl border p-4 text-sm leading-6 shadow-sm",
                        message.role === "student"
                          ? "ml-8 border-teal-100 bg-teal-50 text-teal-950"
                          : "mr-8 border-white bg-white text-slate-800",
                      )}
                    >
                      <p className="mb-1 text-xs font-bold text-slate-500">
                        {message.role === "student" ? "내 말" : "질문 도우미"}
                      </p>
                      <p>{message.content}</p>
                      {message.result?.followUpQuestion ? (
                        <div className="mt-3 rounded-2xl border-l-4 border-violet-300 bg-violet-50 px-3 py-2">
                          <p className="text-xs font-bold text-violet-600">이어서 이야기해 볼까요?</p>
                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {message.result.followUpQuestion}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-sm font-medium text-slate-500">
                    <Bot className="mb-3 size-8 text-violet-400" aria-hidden="true" />
                    위의 채팅 시작을 누르면 질문 도우미가 먼저 인사해요.
                  </div>
                )}
              </div>
              <form className="space-y-2" onSubmit={handleAskQuestion}>
                <Label htmlFor="student-question" className="font-bold text-slate-700">내 생각이나 질문</Label>
                <Textarea
                  id="student-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={
                    isChatStarted
                      ? "질문 도우미에게 궁금한 점이나 내 생각을 적어 보세요."
                      : "먼저 채팅 시작을 눌러 주세요."
                  }
                  className="min-h-24 rounded-3xl border-violet-100 bg-white/90 px-4 py-3 text-slate-800 shadow-sm placeholder:text-slate-400"
                  disabled={!isChatStarted}
                />
                <Button
                  type="submit"
                  className="w-full rounded-full bg-teal-500 font-bold text-white shadow-sm hover:bg-teal-600"
                  disabled={isSending || !materialReady || !isChatStarted}
                >
                  {isSending ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  보내기
                </Button>
              </form>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
