import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";

export interface AppNavItem {
  /** Stable, non-translated — used for DOM ids (`nav-${id}`), never rendered. */
  id: string;
  to: string;
  /** i18n key (common namespace) for the displayed label. */
  labelKey: string;
  icon: LucideIcon;
  children?: Array<{
    to: string;
    labelKey: string;
    ownerOnly?: boolean;
  }>;
}

export const appNavItems: AppNavItem[] = [
  { id: "dashboard", to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { id: "checklists", to: "/checklists", labelKey: "nav.checklists", icon: ClipboardList },
  { id: "reporting", to: "/reporting", labelKey: "nav.reporting", icon: BarChart3 },
  { id: "infohub", to: "/infohub", labelKey: "nav.infohub", icon: BookOpen },
  { id: "admin", to: "/admin", labelKey: "nav.admin", icon: ShieldCheck },
];
