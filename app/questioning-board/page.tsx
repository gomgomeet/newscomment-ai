import type { Metadata } from "next";
import { QuestioningChatbotBoard } from "@/components/questioning/questioning-chatbot-board";

export const metadata: Metadata = {
  title: "교사용 질문 챗봇 제작 보드 | NewsComment AI",
  description: "성취기준, 수업 자료 이미지, 평가 루브릭, 학생용 질문 챗봇 PRD를 연결하는 교사용 HTML 보드",
};

export default function QuestioningBoardPage() {
  return <QuestioningChatbotBoard />;
}
