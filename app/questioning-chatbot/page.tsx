import type { Metadata } from "next";
import { StudentQuestionHelperChatbot } from "@/components/questioning/student-question-helper-chatbot";

export const metadata: Metadata = {
  title: "학생용 질문 도우미 챗봇 | NewsComment AI",
  description: "교사용 보드에서 준비한 수업 자료 범위 안에서 질문, 근거 확인, 질문 수정을 돕는 학생용 챗봇",
};

export default function QuestioningChatbotPage() {
  return <StudentQuestionHelperChatbot />;
}
