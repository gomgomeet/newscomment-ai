"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTIONING_AI_SETTINGS_KEY,
  QUESTIONING_CHATBOT_CONFIG_KEY,
  REFERENCE_ONLY_QUESTION_MATERIAL_TEXT,
  buildRubric,
  buildStandardAssessmentAnalysis,
  createDefaultQuestioningChatbotBehavior,
  createDefaultQuestioningLessonMaterial,
  createLocalQuestionResult,
  isQuestioningAiSettings,
  normalizeQuestionMaterialForStudentDisplay,
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
const STUDENT_PROFILE_KEY = "questioning-student-profile";
const GOMGOMI_PROFILE_IMAGE = "/gomgomi-profile.svg";

type StudentProfile = {
  school: string;
  classroom: string;
  number: string;
};

const emptyStudentProfile: StudentProfile = {
  school: "",
  classroom: "",
  number: "",
};

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

function isStudentProfile(value: unknown): value is StudentProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const profile = value as Partial<StudentProfile>;
  return (
    typeof profile.school === "string" &&
    typeof profile.classroom === "string" &&
    typeof profile.number === "string"
  );
}

function normalizeStudentProfile(profile: StudentProfile): StudentProfile {
  return {
    school: profile.school.trim(),
    classroom: profile.classroom.trim(),
    number: profile.number.trim(),
  };
}

function formatClassroom(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("반") ? trimmed : `${trimmed}반`;
}

function formatStudentNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("번") ? trimmed : `${trimmed}번`;
}

function formatStudentProfile(profile: StudentProfile) {
  return `${profile.school.trim()} ${formatClassroom(profile.classroom)} ${formatStudentNumber(profile.number)}`;
}

function GomgomiAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = {
    sm: "size-7",
    md: "size-10",
    lg: "size-16",
  }[size];

  const imageSize = {
    sm: 28,
    md: 40,
    lg: 64,
  }[size];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-200 bg-amber-50 shadow-sm",
        sizeClass,
      )}
      aria-hidden="true"
    >
      <Image
        src={GOMGOMI_PROFILE_IMAGE}
        alt=""
        width={imageSize}
        height={imageSize}
        unoptimized
        className="h-full w-full object-cover"
      />
    </span>
  );
}

function normalizeQuestioningConfig(config: QuestioningChatbotConfig): QuestioningChatbotConfig {
  return {
    ...config,
    material: normalizeQuestionMaterialForStudentDisplay(config.material),
    behavior: normalizeQuestioningChatbotBehavior(config.behavior),
  };
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
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<StudentProfile>(emptyStudentProfile);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(true);

  const materialReady = Boolean(config.material.visibleText.trim() || config.material.summary.trim());
  const questionMaterialText = config.material.visibleText.trim();
  const questionMaterialDisplayText =
    questionMaterialText || (config.material.summary.trim() ? REFERENCE_ONLY_QUESTION_MATERIAL_TEXT : "");
  const rubric = config.rubric.length ? config.rubric : buildRubric(config.standard);
  const seedQuestions = useMemo(() => {
    const materialSeeds = config.material.questionSeeds.filter(
      (seed) => !/(좋은 질문|질문 유형|분류|평가|근거를 확인하기에)/.test(seed),
    );
    return Array.from(new Set([...materialSeeds, ...quickQuestions])).slice(0, 4);
  }, [config.material.questionSeeds]);

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

    function applyStudentProfile(storedValue: string | null) {
      if (!storedValue) {
        setStudentProfile(null);
        setProfileDraft(emptyStudentProfile);
        setIsProfilePanelOpen(true);
        return;
      }

      try {
        const parsedProfile = JSON.parse(storedValue) as unknown;
        if (!isStudentProfile(parsedProfile)) {
          throw new Error("학생 정보 형식이 올바르지 않습니다.");
        }

        const normalizedProfile = normalizeStudentProfile(parsedProfile);
        if (!normalizedProfile.school || !normalizedProfile.classroom || !normalizedProfile.number) {
          throw new Error("학생 정보가 비어 있습니다.");
        }

        setStudentProfile(normalizedProfile);
        setProfileDraft(normalizedProfile);
        setIsProfilePanelOpen(false);
      } catch {
        window.localStorage.removeItem(STUDENT_PROFILE_KEY);
        setStudentProfile(null);
        setProfileDraft(emptyStudentProfile);
        setIsProfilePanelOpen(true);
      }
    }

    const timer = window.setTimeout(() => {
      applyAiSettings(window.localStorage.getItem(QUESTIONING_AI_SETTINGS_KEY));
      applyChatbotConfig(
        window.localStorage.getItem(QUESTIONING_CHATBOT_CONFIG_KEY),
        "교사용 보드의 수업 자료와 챗봇 동작 설정이 연결되었습니다.",
      );
      applyStudentProfile(window.localStorage.getItem(STUDENT_PROFILE_KEY));
    }, 0);

    function handleStorage(event: StorageEvent) {
      if (event.key === QUESTIONING_AI_SETTINGS_KEY) {
        applyAiSettings(event.newValue);
      }
      if (event.key === QUESTIONING_CHATBOT_CONFIG_KEY) {
        applyChatbotConfig(event.newValue, "교사용 보드에서 수정한 챗봇 설정을 바로 적용했습니다.");
      }
      if (event.key === STUDENT_PROFILE_KEY) {
        applyStudentProfile(event.newValue);
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  function handleSaveStudentProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedProfile = normalizeStudentProfile(profileDraft);

    if (!normalizedProfile.school || !normalizedProfile.classroom || !normalizedProfile.number) {
      setNotice("학교, 반, 번호를 모두 입력해 주세요. 이름은 입력하지 않아도 됩니다.");
      setIsProfilePanelOpen(true);
      return;
    }

    window.localStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify(normalizedProfile));
    setStudentProfile(normalizedProfile);
    setProfileDraft(normalizedProfile);
    setIsProfilePanelOpen(false);
    setNotice("학교·반·번호를 저장했습니다. 이 정보는 이 브라우저에만 보관됩니다.");
  }

  function handleStartChat() {
    if (isChatStarted || !materialReady) {
      return;
    }

    if (!studentProfile) {
      setNotice("먼저 학교·반·번호를 입력해 주세요. 이름은 입력하지 않아도 됩니다.");
      setIsProfilePanelOpen(true);
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

    if (!studentProfile) {
      setNotice("먼저 학교·반·번호를 입력해 주세요. 이름은 입력하지 않아도 됩니다.");
      setIsProfilePanelOpen(true);
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
          studentProfile,
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
          '"Gaegu", "Gowun Dodum", "Jua", "배달의민족 주아", "BMJUA", "Arial Rounded MT Bold", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif',
      }}
    >
      <header className="border-b border-teal-100 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-cyan-50 px-4 py-2 text-sm font-semibold text-teal-700 shadow-sm">
                <GomgomiAvatar size="sm" />
                질문 챗봇(학생용)
              </div>
              <h1 className="mt-4 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                챗봇에게 질문하기
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-600">
                {config.subjectUnit} · {config.targetGrade || "대상 미정"}
              </p>
            </div>
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
          <div className="rounded-3xl border border-rose-100 bg-white/95 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-rose-500" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-900">학생 정보</h2>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {studentProfile
                    ? formatStudentProfile(studentProfile)
                    : "이름 대신 학교·반·번호만 입력해 주세요."}
                </p>
              </div>
              {studentProfile ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsProfilePanelOpen((current) => !current)}
                  className="rounded-full border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100"
                >
                  {isProfilePanelOpen ? "접기" : "수정"}
                  {isProfilePanelOpen ? (
                    <ChevronUp className="size-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-4" aria-hidden="true" />
                  )}
                </Button>
              ) : null}
            </div>
            {isProfilePanelOpen ? (
              <form className="grid gap-3 border-t border-rose-100 p-4 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto]" onSubmit={handleSaveStudentProfile}>
                <div className="space-y-2">
                  <Label htmlFor="student-school" className="font-bold text-slate-700">
                    학교
                  </Label>
                  <Input
                    id="student-school"
                    value={profileDraft.school}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, school: event.target.value }))}
                    placeholder="예: 푸른초등학교"
                    className="rounded-2xl border-rose-100 bg-white px-4 py-3 text-slate-800 shadow-sm placeholder:text-slate-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-classroom" className="font-bold text-slate-700">
                    반
                  </Label>
                  <Input
                    id="student-classroom"
                    value={profileDraft.classroom}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, classroom: event.target.value }))}
                    placeholder="예: 4-2"
                    className="rounded-2xl border-rose-100 bg-white px-4 py-3 text-slate-800 shadow-sm placeholder:text-slate-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-number" className="font-bold text-slate-700">
                    번호
                  </Label>
                  <Input
                    id="student-number"
                    value={profileDraft.number}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, number: event.target.value }))}
                    placeholder="예: 15"
                    className="rounded-2xl border-rose-100 bg-white px-4 py-3 text-slate-800 shadow-sm placeholder:text-slate-400"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="w-full rounded-full bg-rose-500 font-bold text-white hover:bg-rose-600 sm:w-auto">
                    저장
                  </Button>
                </div>
              </form>
            ) : null}
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
                  {questionMaterialDisplayText || "아직 교사용 보드에서 연결된 질문 자료가 없습니다."}
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
                <GomgomiAvatar size="md" />
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
                        "flex items-start gap-2",
                        message.role === "student" ? "justify-end" : "justify-start",
                      )}
                    >
                      {message.role === "assistant" ? <GomgomiAvatar size="md" /> : null}
                      <div
                        className={cn(
                          "max-w-[calc(100%-3rem)] rounded-3xl border p-4 text-sm leading-6 shadow-sm",
                          message.role === "student"
                            ? "border-teal-100 bg-teal-50 text-teal-950"
                            : "border-white bg-white text-slate-800",
                        )}
                      >
                        <p className="mb-1 text-xs font-bold text-slate-500">
                          {message.role === "student" ? "내 말" : "곰곰이 질문 도우미"}
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
                      {message.role === "student" ? (
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-teal-100 text-xs font-bold text-teal-800 shadow-sm">
                          나
                        </span>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-sm font-medium text-slate-500">
                    <GomgomiAvatar size="lg" />
                    <p className="mt-3">곰곰이가 먼저 인사할 준비를 하고 있어요.</p>
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
                  className="w-full rounded-full bg-rose-500 font-bold text-white shadow-sm hover:bg-rose-600"
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
