import { BarChart3, ClipboardCheck, FileText, FolderKanban, Gauge, Settings, Sparkles, TrendingUp } from "lucide-react";

// 교사가 보는 모든 이름은 한글로 쓴다. 화면 제목(h2)도 여기의 label과 같게 맞춘다.
// Evaluation은 Projects와 같은 목록을 보여 주던 중복 화면이라 걷어냈다.
// 교사 검토 작업대를 평가의 기본 진입점으로 두고 기준별 통계는 작업대 안에서 연다.
export const navigation = [
  { href: "/dashboard", label: "대시보드", icon: Gauge },
  { href: "/dashboard/prep", label: "평가 준비 프렙", icon: ClipboardCheck },
  { href: "/dashboard/projects", label: "수업활동", icon: FolderKanban },
  { href: "/dashboard/rubrics", label: "평가 루브릭", icon: Sparkles },
  { href: "/dashboard/compare", label: "교사 검토 작업대", icon: BarChart3 },
  { href: "/dashboard/growth", label: "성장 기록 보드(생기부)", icon: TrendingUp },
  { href: "/dashboard/forms", label: "학교 양식 작성", icon: FileText },
  { href: "/dashboard/settings", label: "설정", icon: Settings },
] as const;
