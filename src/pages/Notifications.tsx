import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AlertCircle, ArrowLeft, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlerts, useDismissAlert, useClearAlerts } from "@/hooks/useAlerts";

export default function Notifications() {
  const navigate = useNavigate();
  const { data: alerts = [] } = useAlerts();
  const dismissMut = useDismissAlert();
  const clearMut = useClearAlerts();

  const clearAll = () => clearMut.mutate(alerts.map(a => a.id));
  const clearOne = (id: string) => dismissMut.mutate(id);

  return (
    <Layout
      title="Notifications"
      subtitle="Active operational alerts"
      headerLeft={
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 rounded-full hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} className="text-muted-foreground" />
        </button>
      }
    >
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">{alerts.length} alert{alerts.length !== 1 ? "s" : ""}</p>
          {alerts.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 text-xs text-status-error font-medium hover:opacity-80 transition-opacity"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="card-surface p-10 flex flex-col items-center gap-5 text-center">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="opacity-40">
              <circle cx="40" cy="40" r="36" stroke="hsl(var(--sage))" strokeWidth="2" />
              <path d="M26 40l10 10 18-20" stroke="hsl(var(--sage))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="text-sm font-medium text-foreground">All clear</p>
              <p className="text-xs text-muted-foreground mt-1">No outstanding alerts at this time.</p>
            </div>
          </div>
        ) : (
          <div className="card-surface divide-y divide-border overflow-hidden">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 p-4",
                  alert.type === "error" ? "border-l-2 border-l-status-error" : "border-l-2 border-l-status-warn"
                )}
              >
                <AlertCircle
                  size={16}
                  className={cn("mt-0.5 shrink-0", alert.type === "error" ? "text-status-error" : "text-status-warn")}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{alert.area}</span>
                    {alert.time && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">{alert.time}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => clearOne(alert.id)}
                  className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
                  aria-label="Dismiss alert"
                >
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
