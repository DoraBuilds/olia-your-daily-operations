import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";

export interface AppNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  children?: Array<{
    to: string;
    label: string;
    ownerOnly?: boolean;
  }>;
}

export const appNavItems: AppNavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/checklists", label: "Checklists", icon: ClipboardList },
  { to: "/reporting", label: "Reporting", icon: BarChart3 },
  {
    to: "/infohub",
    label: "Infohub",
    icon: BookOpen,
    children: [
      { to: "/infohub/library", label: "Library" },
      { to: "/infohub/training", label: "Training" },
    ],
  },
  {
    to: "/admin",
    label: "Admin",
    icon: ShieldCheck,
    children: [
      { to: "/admin/location", label: "Locations" },
      { to: "/admin/users", label: "Users", ownerOnly: true },
      { to: "/admin/account", label: "Account", ownerOnly: true },
      { to: "/admin/billing", label: "Billing", ownerOnly: true },
    ],
  },
];
