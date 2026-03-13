import { useState } from "react";
import type { ElementType } from "react";
import { ClipboardList, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Layout } from "@/components/Layout";
import { ChecklistsTab } from "./checklists/ChecklistsTab";
import { ReportingTab } from "./checklists/ReportingTab";

type SubTab = "checklists" | "reporting";

const SUB_TABS: { key: SubTab; label: string; icon: ElementType }[] = [
  { key: "checklists", label: "Checklists", icon: ClipboardList },
  { key: "reporting", label: "Reporting", icon: BarChart2 },
];

export default function Checklists() {
  const [tab, setTab] = useState<SubTab>("checklists");

  const subtitleMap: Record<SubTab, string> = {
    checklists: "Manage your checklists & inspections",
    reporting: "Logs & compliance overview",
  };

  return (
    <Layout title="Checklists" subtitle={subtitleMap[tab]}>
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors",
              tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "checklists" && <ChecklistsTab />}
      {tab === "reporting" && <ReportingTab />}
    </Layout>
  );
}
