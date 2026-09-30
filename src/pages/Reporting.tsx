import { useState, type ReactNode } from "react";
import { ClipboardCheck, GraduationCap } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ReportingTab } from "./checklists/ReportingTab";
import { TrainingReportTab } from "./reporting/TrainingReportTab";

const VALID_STATUSES = ["all", "completed", "unfinished", "unstarted"] as const;
type ReportingStatus = typeof VALID_STATUSES[number];
type ReportingView = "checklists" | "training";

export default function Reporting() {
  const { t } = useTranslation("checklists");
  const { teamMember } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLocationId = searchParams.get("location") || undefined;
  const statusParam = searchParams.get("status");
  const initialStatus = VALID_STATUSES.includes(statusParam as ReportingStatus)
    ? (statusParam as ReportingStatus)
    : undefined;

  // Training completion covers everyone's progress, so it's for owners and
  // managers with View reporting — the same rule the database enforces (#915).
  const canViewTraining = !!teamMember && (teamMember.is_owner || (teamMember.is_manager && !!teamMember.permissions?.view_reporting));
  const [selectedView, setSelectedView] = useState<ReportingView>(searchParams.get("view") === "training" ? "training" : "checklists");
  const view: ReportingView = canViewTraining ? selectedView : "checklists";
  const selectView = (next: ReportingView) => {
    setSelectedView(next);
    // Mirrored in the URL so a refresh or shared link keeps the view.
    const params = new URLSearchParams(searchParams);
    if (next === "training") params.set("view", "training"); else params.delete("view");
    setSearchParams(params, { replace: true });
  };

  // Rendered by each tab just below its search/filters row, like Infohub's Library|Training switch.
  const viewSwitcher: ReactNode = canViewTraining ? (
    <div role="tablist" className="flex gap-1 bg-muted rounded-xl p-1">
      {([
        { key: "checklists" as const, icon: ClipboardCheck },
        { key: "training" as const, icon: GraduationCap },
      ]).map(({ key, icon: Icon }) => (
        <button
          key={key}
          role="tab"
          aria-selected={view === key}
          data-testid={`reporting-view-${key}`}
          onClick={() => selectView(key)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors",
            view === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon size={13} />
          {t(`reporting.views.${key}`)}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <Layout>
      {view === "training"
        ? <TrainingReportTab viewSwitcher={viewSwitcher} />
        : <ReportingTab viewSwitcher={viewSwitcher} initialLocationId={initialLocationId} initialStatus={initialStatus} />}
    </Layout>
  );
}
