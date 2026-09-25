import { useState } from "react";
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

  return (
    <Layout>
      {canViewTraining && (
        <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-muted max-w-xs mb-3">
          {(["checklists", "training"] as const).map(v => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              data-testid={`reporting-view-${v}`}
              onClick={() => selectView(v)}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`reporting.views.${v}`)}
            </button>
          ))}
        </div>
      )}
      {view === "training"
        ? <TrainingReportTab />
        : <ReportingTab initialLocationId={initialLocationId} initialStatus={initialStatus} />}
    </Layout>
  );
}
