import { redirect } from "next/navigation";

// 이 화면은 수업활동 목록을 그대로 한 번 더 보여 주던 중복이었다. 메뉴에서 걷어내고
// 라우트만 남겨, 예전 주소를 기억하는 북마크가 죽지 않게 한다.
export default function EvaluationPage() {
  redirect("/dashboard/projects");
}
