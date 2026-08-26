"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  QUESTIONING_CHATBOT_CONFIG_KEY,
  REFERENCE_ONLY_QUESTION_MATERIAL_TEXT,
  buildRubric,
  buildStandardAssessmentAnalysis,
  createDefaultQuestioningChatbotBehavior,
  createDefaultQuestioningLessonMaterial,
  normalizeQuestioningChatbotConfig,
  standardOptions,
  type ChatMessage,
  type QuestioningChatbotConfig,
  type StudentChatResponse,
} from "@/lib/questioning-board";
import { cn } from "@/lib/utils";

const quickQuestions = [
  "제목에서 달라진 점 보기",
  "숫자가 나온 문장 찾기",
  "방법이 나온 부분 살펴보기",
  "우리 생활과 연결하기",
];

const defaultStandard = standardOptions[0];
const STUDENT_PROFILE_KEY = "questioning-student-profile";
const LESSON_CODE_KEY = "questioning-lesson-code";
const GOMGOMI_PROFILE_IMAGE = "/gomgomi-mascot.png";

type StudentProfile = {
  school: string;
  classroom: string;
  number: string;
};

type ChatApiResponse = StudentChatResponse & {
  error?: string;
};

type LessonConnectionResponse = {
  ok?: boolean;
  error?: string;
  lessonCode?: string;
  lessonTitle?: string;
  teacherLabel?: string;
  config?: unknown;
};

const emptyStudentProfile: StudentProfile = {
  school: "",
  classroom: "",
  number: "",
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 자료가 언제 적용된 것인지 사람이 읽을 수 있게. 오래된 자료를 한눈에 알아본다. */
function formatAppliedAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "시각 미상";
  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
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

function splitPreviewSentences(text: string) {
  const normalized = text.replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  return (normalized.match(/[^.!?。？！]+[.!?。？！]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12)
    .slice(0, 3);
}

function buildMaterialPreviewLines(material: QuestioningChatbotConfig["material"], displayText: string) {
  if (displayText === REFERENCE_ONLY_QUESTION_MATERIAL_TEXT) {
    return [
      "긴 지문이나 교과서 자료는 원문을 직접 보며 표시된 부분을 먼저 확인해요.",
      "제목, 숫자, 달라진 점을 가볍게 살펴본 뒤 궁금한 점을 떠올려 봐요.",
    ];
  }

  const previewFromSummary = splitPreviewSentences(material.summary);
  if (previewFromSummary.length) {
    return previewFromSummary;
  }

  const textLines = displayText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12 && !/기자$/.test(line))
    .slice(0, 3);

  return textLines;
}

function buildExplorationPoints(material: QuestioningChatbotConfig["material"], isReferenceOnly: boolean) {
  if (isReferenceOnly) {
    return ["제목 확인", "표시된 부분 확인", "달라진 점 찾기", "궁금한 점 떠올리기"];
  }

  const conceptPoints = material.keyConcepts.slice(0, 3).map((concept) => `${concept} 살펴보기`);
  return Array.from(new Set([...conceptPoints, "숫자와 변화 찾기", "이유가 나온 부분 보기"])).slice(0, 4);
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

export function StudentQuestionHelperChatbot() {
  const usesRemoteLessonRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatSessionIdRef = useRef(makeId());
  const [config, setConfig] = useState<QuestioningChatbotConfig>(() => createFallbackConfig());
  // 지금 보이는 자료가 어디서 왔는지. "왜 안 바뀌지?"를 화면이 직접 말하게 한다.
  const [configSource, setConfigSource] = useState<"fallback" | "local" | "remote">("fallback");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [lessonCode, setLessonCode] = useState("");
  const [isQuestionMaterialOpen, setIsQuestionMaterialOpen] = useState(false);
  const [isChatStarted, setIsChatStarted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<StudentProfile>(emptyStudentProfile);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(true);
  const [activeTypingMessageId, setActiveTypingMessageId] = useState<string | null>(null);
  const [typedAssistantText, setTypedAssistantText] = useState("");

  const materialReady = Boolean(config.material.visibleText.trim() || config.material.summary.trim());
  const questionMaterialText = config.material.visibleText.trim();
  const questionMaterialDisplayText =
    questionMaterialText || (config.material.summary.trim() ? REFERENCE_ONLY_QUESTION_MATERIAL_TEXT : "");
  const isReferenceOnlyMaterial = questionMaterialDisplayText === REFERENCE_ONLY_QUESTION_MATERIAL_TEXT;
  const materialPreviewLines = useMemo(
    () => buildMaterialPreviewLines(config.material, questionMaterialDisplayText),
    [config.material, questionMaterialDisplayText],
  );
  const explorationPoints = useMemo(
    () => buildExplorationPoints(config.material, isReferenceOnlyMaterial),
    [config.material, isReferenceOnlyMaterial],
  );
  const rubric = config.rubric.length ? config.rubric : buildRubric(config.standard);
  const seedQuestions = useMemo(() => {
    return Array.from(new Set([...explorationPoints, ...quickQuestions])).slice(0, 4);
  }, [explorationPoints]);
  const isTypingAssistantResponse = Boolean(activeTypingMessageId);
  const hasStudentTurn = messages.some((message) => message.role === "student");
  const latestAssistantResult = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.result)?.result;
  const conversationIsClosing = Boolean(latestAssistantResult?.isClosing);

  useEffect(() => {
    if (!activeTypingMessageId) {
      return;
    }

    const message = messages.find(
      (currentMessage) => currentMessage.id === activeTypingMessageId && currentMessage.role === "assistant",
    );
    if (!message?.content) {
      const resetTimer = window.setTimeout(() => setActiveTypingMessageId(null), 0);
      return () => window.clearTimeout(resetTimer);
    }

    const fullText = message.content;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const resetTimer = window.setTimeout(() => setActiveTypingMessageId(null), 0);
      return () => window.clearTimeout(resetTimer);
    }

    let nextLength = 0;
    const step = fullText.length > 160 ? 3 : 2;

    const timer = window.setInterval(() => {
      nextLength = Math.min(nextLength + step, fullText.length);
      setTypedAssistantText(fullText.slice(0, nextLength));
      if (nextLength >= fullText.length) {
        window.clearInterval(timer);
        window.setTimeout(() => {
          setActiveTypingMessageId((currentId) =>
            currentId === activeTypingMessageId ? null : currentId,
          );
        }, 160);
      }
    }, 24);

    return () => window.clearInterval(timer);
  }, [activeTypingMessageId, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typedAssistantText, isSending]);

  function appendAssistantMessage(message: ChatMessage) {
    setMessages((current) => [...current, message]);
    setActiveTypingMessageId(message.id);
    setTypedAssistantText("");
  }

  async function loadLessonConnection(code: string, successMessage = "수업 코드의 질문 자료가 연결되었습니다.") {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setNotice("수업 코드를 입력해 주세요.");
      return;
    }

    setNotice("수업 자료를 불러오고 있습니다.");

    try {
      const response = await fetch(
        `/api/questioning-board/connections?lessonCode=${encodeURIComponent(trimmedCode)}`,
      );
      const payload = (await response.json()) as LessonConnectionResponse;

      if (!response.ok || !payload.ok || !isQuestioningConfig(payload.config)) {
        throw new Error(payload.error || "수업 연결 정보를 불러오지 못했습니다.");
      }

      const nextLessonCode = payload.lessonCode || trimmedCode.toUpperCase();
      usesRemoteLessonRef.current = true;
      setConfigSource("remote");
      setLessonCode(nextLessonCode);
      setConfig(normalizeQuestioningChatbotConfig(payload.config));
      window.localStorage.setItem(LESSON_CODE_KEY, nextLessonCode);
      setNotice(successMessage);
    } catch (error) {
      usesRemoteLessonRef.current = false;
      const message = error instanceof Error ? error.message : "수업 연결 정보를 불러오지 못했습니다.";
      setNotice(message);
    }
  }

  useEffect(() => {
    function applyChatbotConfig(storedValue: string | null, successMessage: string) {
      if (!storedValue) {
        setConfig(createFallbackConfig());
        setConfigSource("fallback");
        setNotice("기본 수업 자료가 연결되었습니다. 교사용 보드에서 수정하면 수정한 자료가 우선 적용됩니다.");
        return;
      }

      try {
        const parsed = JSON.parse(storedValue) as unknown;
        if (!isQuestioningConfig(parsed)) {
          throw new Error("저장된 챗봇 설정 형식이 올바르지 않습니다.");
        }
        setConfig(normalizeQuestioningChatbotConfig(parsed));
        setConfigSource("local");
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
      const urlLessonCode = new URLSearchParams(window.location.search).get("lesson") || "";

      if (urlLessonCode) {
        void loadLessonConnection(urlLessonCode, "공유된 수업 링크의 질문 자료가 연결되었습니다.");
      } else {
        applyChatbotConfig(
          window.localStorage.getItem(QUESTIONING_CHATBOT_CONFIG_KEY),
          "교사용 보드의 수업 자료와 챗봇 동작 설정이 연결되었습니다.",
        );
      }
      applyStudentProfile(window.localStorage.getItem(STUDENT_PROFILE_KEY));
    }, 0);

    function handleStorage(event: StorageEvent) {
      if (event.key === QUESTIONING_CHATBOT_CONFIG_KEY) {
        if (!usesRemoteLessonRef.current) {
          applyChatbotConfig(event.newValue, "교사용 보드에서 수정한 챗봇 설정을 바로 적용했습니다.");
        }
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

  // 교사가 수업 연결에 학교·학년반을 적어 두었으면 아이는 번호만 고르면 된다.
  const classInfo = config.classInfo;
  const numberChoices = useMemo(() => {
    const size = classInfo?.classSize ?? 0;
    return size > 0 ? Array.from({ length: size }, (_, index) => String(index + 1)) : [];
  }, [classInfo?.classSize]);
  const activeStudentProfile = useMemo(() => {
    if (!studentProfile || !classInfo) return studentProfile;
    const parsedNumber = Number(studentProfile.number);
    const numberIsAllowed =
      !classInfo.classSize ||
      (Number.isInteger(parsedNumber) && parsedNumber >= 1 && parsedNumber <= classInfo.classSize);
    return studentProfile.school === classInfo.school &&
      studentProfile.classroom === classInfo.classroom &&
      numberIsAllowed
      ? studentProfile
      : null;
  }, [classInfo, studentProfile]);

  // 교사가 정한 값을 상태에 밀어 넣지 않고 화면에서 덮어쓴다. 아이가 예전에 다른
  // 학교를 저장해 두었더라도 이번 수업 기록은 이 학급 이름으로 남아야 한다.
  const shownDraft = classInfo
    ? {
        ...profileDraft,
        school: classInfo.school,
        classroom: classInfo.classroom,
        number:
          numberChoices.length === 0 || numberChoices.includes(profileDraft.number) ? profileDraft.number : "",
      }
    : profileDraft;
  const shouldShowProfilePanel = isProfilePanelOpen || !activeStudentProfile;

  function handleSaveStudentProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedProfile = normalizeStudentProfile(
      classInfo
        ? { ...profileDraft, school: classInfo.school, classroom: classInfo.classroom }
        : profileDraft,
    );

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

    if (!activeStudentProfile) {
      setNotice("먼저 학교·반·번호를 입력해 주세요. 이름은 입력하지 않아도 됩니다.");
      setIsProfilePanelOpen(true);
      return;
    }

    const greetingMessage: ChatMessage = {
      id: makeId(),
      role: "assistant",
      content:
        "안녕하세요! 저는 질문 자료를 함께 살펴보는 질문 도우미예요. 제목과 먼저 볼 내용을 가볍게 살펴보고, 눈에 들어온 내용이나 궁금한 점을 말해 주세요.",
    };

    setMessages([greetingMessage]);
    setActiveTypingMessageId(greetingMessage.id);
    setTypedAssistantText("");
    setIsChatStarted(true);
    setNotice("");
  }

  async function handleAskQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    if (activeTypingMessageId) {
      setNotice("곰곰이의 답변이 끝난 뒤 이어서 질문해 주세요.");
      return;
    }

    if (!materialReady) {
      setNotice("교사용 보드에서 수업 자료를 먼저 반영해야 질문 도우미 챗봇을 사용할 수 있습니다.");
      return;
    }

    if (!activeStudentProfile) {
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
      const recentConversation = messages.slice(-18).map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const requestBody = lessonCode
        ? {
            lessonCode,
            sessionId: chatSessionIdRef.current,
            question: trimmedQuestion,
            studentProfile: activeStudentProfile,
            conversation: recentConversation,
          }
        : {
            standard: config.standard,
            targetGrade: config.targetGrade,
            subjectUnit: config.subjectUnit,
            material: config.material,
            rubric,
            behavior: config.behavior,
            sessionId: chatSessionIdRef.current,
            question: trimmedQuestion,
            studentProfile: activeStudentProfile,
            conversation: recentConversation,
          };
      const response = await fetch("/api/questioning-board/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as ChatApiResponse;

      if (!response.ok) {
        throw new Error(payload.error || "챗봇 응답 생성에 실패했습니다.");
      }

      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: payload.studentReply,
        result: payload,
      };
      appendAssistantMessage(assistantMessage);
      if (payload.noticeCode === "provider_unavailable") {
        setNotice("지금은 준비된 질문 자료 안에서 안전하게 대화를 이어 가고 있어요.");
      } else if (payload.noticeCode === "source_limited") {
        setNotice("질문 자료만으로 알기 어려운 내용은 단정하지 않고 함께 확인할 부분으로 남겨 두었어요.");
      } else if (payload.noticeCode === "record_unavailable") {
        setNotice("대화는 계속할 수 있지만 이번 활동 기록은 저장되지 않았어요.");
      }
    } catch {
      const fallback: StudentChatResponse = {
        schemaVersion: 2,
        studentReply:
          "지금은 질문 자료와 연결이 잠시 끊겼어요. 방금 떠올린 생각을 그대로 두었다가 잠시 뒤 다시 이야기해 주세요.",
        expectsStudentReply: false,
        isClosing: false,
        localFallback: true,
        noticeCode: "provider_unavailable",
      };
      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: fallback.studentReply,
        result: fallback,
      };
      appendAssistantMessage(assistantMessage);
      setNotice("연결이 원활하지 않아요. 잠시 뒤 다시 이야기해 주세요.");
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
                {lessonCode ? ` · 수업 코드 ${lessonCode}` : ""}
              </p>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                {configSource === "remote"
                  ? `수업 연결 자료 · ${formatAppliedAt(config.updatedAt)} 적용`
                  : configSource === "local"
                    ? `교사용 보드 자료(이 브라우저) · ${formatAppliedAt(config.updatedAt)} 적용`
                    : "⚠ 예시 자료가 보이는 중 — 수업 코드로 접속하거나, 교사용 보드에서 ⑧을 눌러 주세요."}
              </p>
            </div>
          </div>
          {notice ? (
            <div className="flex min-w-0 items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 shadow-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 break-words">{notice}</p>
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
                  {activeStudentProfile
                    ? formatStudentProfile(activeStudentProfile)
                    : studentProfile && classInfo
                      ? "새 수업의 학교·반에 맞게 번호를 다시 확인해 주세요."
                      : "이름 대신 학교·반·번호만 입력해 주세요."}
                </p>
              </div>
              {activeStudentProfile ? (
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
            {shouldShowProfilePanel ? (
              <>
                <form
                  className="grid gap-3 border-t border-rose-100 p-4 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto]"
                  onSubmit={handleSaveStudentProfile}
                >
                <div className="space-y-2">
                  <Label htmlFor="student-school" className="font-bold text-slate-700">
                    학교
                  </Label>
                  <Input
                    id="student-school"
                    value={shownDraft.school}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, school: event.target.value }))}
                    placeholder="예: 푸른초등학교"
                    readOnly={Boolean(classInfo)}
                    className="rounded-2xl border-rose-100 bg-white px-4 py-3 text-slate-800 shadow-sm placeholder:text-slate-400 read-only:bg-slate-100 read-only:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-classroom" className="font-bold text-slate-700">
                    반
                  </Label>
                  <Input
                    id="student-classroom"
                    value={shownDraft.classroom}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, classroom: event.target.value }))}
                    placeholder="예: 4-2"
                    readOnly={Boolean(classInfo)}
                    className="rounded-2xl border-rose-100 bg-white px-4 py-3 text-slate-800 shadow-sm placeholder:text-slate-400 read-only:bg-slate-100 read-only:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-number" className="font-bold text-slate-700">
                    번호
                  </Label>
                  {numberChoices.length > 0 ? (
                    <select
                      id="student-number"
                      value={shownDraft.number}
                      onChange={(event) => setProfileDraft((current) => ({ ...current, number: event.target.value }))}
                      className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-slate-800 shadow-sm"
                    >
                      <option value="">번호 고르기</option>
                      {numberChoices.map((choice) => (
                        <option key={choice} value={choice}>
                          {choice}번
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="student-number"
                      value={shownDraft.number}
                      onChange={(event) => setProfileDraft((current) => ({ ...current, number: event.target.value }))}
                      placeholder="예: 15"
                      className="rounded-2xl border-rose-100 bg-white px-4 py-3 text-slate-800 shadow-sm placeholder:text-slate-400"
                    />
                  )}
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="w-full rounded-full bg-rose-500 font-bold text-white hover:bg-rose-600 sm:w-auto">
                    저장
                  </Button>
                </div>
              </form>
              </>
            ) : null}
          </div>

          <div className="rounded-3xl border border-sky-100 bg-white/95 shadow-sm backdrop-blur">
            <div className="flex flex-col items-stretch gap-3 border-b border-sky-100 p-4 sm:flex-row sm:items-center sm:justify-between">
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
                className="self-end rounded-full border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100 sm:self-auto"
              >
                {isQuestionMaterialOpen ? "전체 닫기" : "전체 보기"}
                {isQuestionMaterialOpen ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-2xl bg-sky-100/75 p-4">
                <p className="text-sm font-bold text-sky-900">먼저 볼 내용</p>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-800">
                  {(materialPreviewLines.length
                    ? materialPreviewLines
                    : ["아직 교사용 보드에서 연결된 질문 자료가 없습니다."]
                  ).map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
                      <span className="break-words">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {explorationPoints.length ? (
                <div>
                  <p className="text-sm font-bold text-slate-800">빠른 탐색 포인트</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {explorationPoints.map((point) => (
                      <span
                        key={point}
                        className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
                      >
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {isQuestionMaterialOpen ? (
              <div id="student-question-material" className="space-y-3 border-t border-sky-100 p-4">
                <p className="text-sm font-bold text-slate-800">질문 자료 전체 내용</p>
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
              {!hasStudentTurn && !conversationIsClosing ? (
                <div className="space-y-2">
                <p className="text-xs font-bold text-violet-700">빠른 생각 출발점</p>
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
                </div>
              ) : null}
              <div
                className="h-[460px] space-y-3 overflow-y-auto rounded-3xl border border-violet-100 bg-violet-100/70 p-3"
                aria-live="polite"
              >
                {messages.length ? (
                  messages.map((message) => {
                    const isAssistantTyping =
                      message.role === "assistant" && message.id === activeTypingMessageId;
                    const messageContent = isAssistantTyping ? typedAssistantText : message.content;

                    return (
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
                        <p className="whitespace-pre-wrap break-words">
                          {messageContent}
                          {isAssistantTyping ? (
                            <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full bg-violet-400 align-[-2px]" />
                          ) : null}
                        </p>
                      </div>
                      {message.role === "student" ? (
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-teal-100 text-xs font-bold text-teal-800 shadow-sm">
                          나
                        </span>
                      ) : null}
                    </div>
                    );
                  })
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-sm font-medium text-slate-500">
                    <GomgomiAvatar size="lg" />
                    <p className="mt-3">곰곰이가 먼저 인사할 준비를 하고 있어요.</p>
                    위의 채팅 시작을 누르면 질문 도우미가 먼저 인사해요.
                  </div>
                )}
                {isSending ? (
                  <div className="flex items-start gap-2">
                    <div className="motion-safe:animate-pulse">
                      <GomgomiAvatar size="md" />
                    </div>
                    <div className="max-w-[calc(100%-3rem)] rounded-3xl border border-white bg-white p-4 text-sm leading-6 text-slate-800 shadow-sm">
                      <p className="mb-1 text-xs font-bold text-slate-500">곰곰이 질문 도우미</p>
                      <div className="flex items-center gap-2 font-medium text-violet-700">
                        <span>질문 자료를 살펴보고 있어요</span>
                        <span className="flex gap-1" aria-hidden="true">
                          <span className="size-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.2s]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.1s]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-violet-400" />
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
              <form className="space-y-2" onSubmit={handleAskQuestion}>
                <Label htmlFor="student-question" className="font-bold text-slate-700">내 생각이나 질문</Label>
                <Textarea
                  id="student-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={
                    isTypingAssistantResponse
                      ? "곰곰이가 답변을 마치는 중이에요."
                      : conversationIsClosing
                        ? "더 이야기하고 싶은 생각이 생기면 이어서 적어도 괜찮아요."
                      : isChatStarted
                      ? "질문 도우미에게 궁금한 점이나 내 생각을 적어 보세요."
                      : "먼저 채팅 시작을 눌러 주세요."
                  }
                  className="min-h-24 rounded-3xl border-violet-100 bg-white/90 px-4 py-3 text-slate-800 shadow-sm placeholder:text-slate-400"
                  disabled={!isChatStarted || isTypingAssistantResponse}
                  onKeyDown={(event) => {
                    // 엔터로 바로 보낸다. 줄을 바꾸고 싶으면 Shift+엔터.
                    // 한글 조합 중(isComposing)의 엔터는 글자 확정이므로 보내지 않는다.
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <Button
                  type="submit"
                  className="w-full rounded-full bg-rose-500 font-bold text-white shadow-sm hover:bg-rose-600"
                  disabled={isSending || isTypingAssistantResponse || !materialReady || !isChatStarted}
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
