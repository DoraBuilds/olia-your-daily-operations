import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getLinkableInfohubResource } from "@/lib/infohub-catalog";
import { ensureKioskToken } from "./PinEntryModal";
import { DocDetail, type KioskDoc } from "./KioskLibrary";

// The Info Hub document a checklist instruction links to, shown over the
// runner. Loaded through get_kiosk_library so it is the real document and
// respects what this team member may see.
export function LinkedResourceModal({
  resourceId, locationId, memberId, onClose,
}: {
  resourceId: string;
  locationId?: string;
  memberId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("kiosk");
  const [doc, setDoc] = useState<KioskDoc | null>(null);
  const [loading, setLoading] = useState(!!locationId);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    ensureKioskToken(locationId).then(token => {
      if (cancelled) return;
      supabase
        .rpc("get_kiosk_library", { p_location_id: locationId, p_team_member_id: memberId, p_kiosk_token: token })
        .then(({ data }) => {
          if (cancelled) return;
          const docs = ((data as { documents?: KioskDoc[] } | null)?.documents ?? []);
          setDoc(docs.find(d => d.id === resourceId) ?? null);
          setLoading(false);
        });
    });
    return () => { cancelled = true; };
  }, [resourceId, locationId, memberId]);

  // Older checklists may link to a built-in sample document.
  const legacy = !doc && !loading ? getLinkableInfohubResource(resourceId) : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/30 backdrop-blur-sm px-4 py-8"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{doc?.section ?? legacy?.section}</p>
            <h3 className="text-base font-semibold text-foreground mt-1">{doc?.title ?? legacy?.title ?? (loading ? "" : t("runner.linkedUnavailable"))}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors shrink-0"
            aria-label={t("runner.closeLinkedResource")}
          >
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>
        <div className="px-5 py-5 overflow-y-auto flex-1">
          {doc && locationId ? (
            <DocDetail doc={doc} locationId={locationId} memberId={memberId} completion={null} />
          ) : legacy ? (
            <div className="whitespace-pre-line text-sm text-foreground leading-relaxed">{legacy.body}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
