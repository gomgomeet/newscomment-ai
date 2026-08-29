import { redirect } from "next/navigation";

export default function EvaluationWorksheetFallbackPage() {
  redirect(
    `/dashboard/evaluation?message=${encodeURIComponent("평가할 활동을 선택한 뒤 평가지 만들기를 다시 열어 주세요.")}`,
  );
}
