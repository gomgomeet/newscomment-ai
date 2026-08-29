import { BarChart3, ClipboardCheck, ClipboardList, FileText, Gauge, Settings, TrendingUp } from "lucide-react";

// 교사가 보는 모든 이름은 한글로 쓴다. 화면 제목(h2)도 여기의 label과 같게 맞춘다.
// 교사 피드백을 평가의 기본 검토 진입점으로 두고 기준별 통계는 작업대 안에서 연다.
export const navigation = [
  { href: "/dashboard", label: "대시보드", icon: Gauge },
  { href: "/dashboard/prep", label: "평가 설계", icon: ClipboardCheck },
  { href: "/dashboard/evaluation", label: "평가 바로 하기", icon: ClipboardList },
  { href: "/dashboard/compare", label: "교사 피드백", icon: BarChart3 },
  { href: "/dashboard/growth", label: "성장 기록 보드(생기부)", icon: TrendingUp },
  { href: "/dashboard/forms", label: "학교 양식 작성", icon: FileText },
  { href: "/dashboard/settings", label: "설정", icon: Settings },
] as const;
