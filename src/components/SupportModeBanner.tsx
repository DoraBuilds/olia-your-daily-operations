import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Pinned above every authenticated page while a platform admin is inside a
// customer org, so support mode can never be mistaken for the admin's own
// account. English-only on purpose: only Olia staff ever see it.
export function SupportModeBanner() {
  const navigate = useNavigate();
  const { platformAdmin, exitOrg } = useAuth();
  const [exiting, setExiting] = useState(false);
  const viewing = platformAdmin?.viewingOrg;
  if (!viewing) return null;

  const handleExit = async () => {
    setExiting(true);
    try {
      await exitOrg();
      navigate("/super-admin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not exit support mode");
    } finally {
      setExiting(false);
    }
  };

  return (
    <div
      role="status"
      className="relative z-50 shrink-0 bg-status-error/50 text-foreground safe-area-pt"
    >
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-2 px-3 py-1.5 sm:px-6 text-xs">
        <ShieldCheck size={14} className="shrink-0" />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-semibold">Support mode</span> — viewing {viewing.name}
        </p>
        <button
          type="button"
          onClick={() => navigate("/super-admin")}
          className="shrink-0 rounded-md px-2 py-1 font-semibold hover:bg-black/10"
        >
          Switch
        </button>
        <button
          type="button"
          onClick={handleExit}
          disabled={exiting}
          className="shrink-0 rounded-md bg-white/50 px-2 py-1 font-semibold hover:bg-white/70 disabled:opacity-60"
        >
          {exiting ? "Exiting…" : "Exit"}
        </button>
      </div>
    </div>
  );
}
