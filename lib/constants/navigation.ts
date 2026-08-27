import { BarChart3, FolderKanban, Gauge, Settings, Sparkles } from "lucide-react";

// 교사가 보는 모든 이름은 한글로 쓴다. 화면 제목(h2)도 여기의 label과 같게 맞춘다.
// Evaluation은 Projects와 같은 목록을 보여 주던 중복 화면이라 걷어냈고,
// Compare는 저장된 평가를 훑는 보조 화면이라 「평가 결과」 안에서 연다.
export const navigation = [
  { href: "/dashboard", label: "대시보드", icon: Gauge },
  { href: "/dashboard/projects", label: "수업활동", icon: FolderKanban },
  { href: "/dashboard/rubrics", label: "평가 루브릭", icon: Sparkles },
  { href: "/dashboard/insights", label: "평가 결과", icon: BarChart3 },
  { href: "/dashboard/settings", label: "설정", icon: Settings },
] as const;
