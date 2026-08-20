import { BarChart3, FolderKanban, Gauge, GitCompare, Settings, Sparkles } from "lucide-react";

export const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/rubrics", label: "Rubrics", icon: Sparkles },
  { href: "/dashboard/evaluation", label: "Evaluation", icon: BarChart3 },
  { href: "/dashboard/compare", label: "Compare", icon: GitCompare },
  { href: "/dashboard/insights", label: "Insights", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;
