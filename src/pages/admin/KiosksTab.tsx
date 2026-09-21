// ─── KiosksTab ──────────────────────────────────────────────────────────────
// Fleet view of every kiosk device across every concept/location (#818).
// Kiosk launch itself still happens from a location's detail page in the
// Concepts tab — this tab is purely for visibility ("what's running, and
// where") and remote deactivation of a lost/misbehaving tablet.

import { useTranslation } from "react-i18next";
import { Tablet, Building2, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Location, type Concept } from "@/lib/admin-repository";
import { useKioskDevices, useRevokeKioskDevice, type KioskDevice } from "@/hooks/useKioskDevices";
import { toast } from "@/components/ui/sonner";
import { ConfirmModal, type ConfirmState } from "./SharedUI";
import { useState } from "react";
import { clearKioskDeviceState } from "@/lib/kiosk-guard";

export interface KiosksTabProps {
  concepts: Concept[];
  locations: Location[];
}

function kioskStatus(device: KioskDevice, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (!device.last_seen_at) return { label: t("kiosksTab.neverCheckedIn"), online: false };
  const diffMs = Date.now() - new Date(device.last_seen_at).getTime();
  if (diffMs < 3 * 60 * 1000) return { label: t("kiosksTab.activeNow"), online: true };
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return { label: t("kiosksTab.lastSeenMinutes", { count: minutes }), online: false };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { label: t("kiosksTab.lastSeenHours", { count: hours }), online: false };
  const days = Math.round(hours / 24);
  return { label: t("kiosksTab.lastSeenDays", { count: days }), online: false };
}

export function KiosksTab({ concepts, locations }: KiosksTabProps) {
  const { t } = useTranslation("admin");
  const { data: devices = [], isLoading } = useKioskDevices();
  const revokeMut = useRevokeKioskDevice();
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);

  const groups = concepts
    .map(concept => ({
      concept,
      locationGroups: locations
        .filter(l => l.concept_id === concept.id)
        .map(location => ({
          location,
          devices: devices.filter(d => d.location_id === location.id),
        }))
        .filter(g => g.devices.length > 0),
    }))
    .filter(g => g.locationGroups.length > 0);

  const confirmDeactivate = (device: KioskDevice, locationName: string) => {
    setConfirmModal({
      title: t("kiosksTab.deactivateConfirmTitle"),
      message: t("kiosksTab.deactivateConfirmMessage", { label: device.label, location: locationName }),
      actionLabel: t("kiosksTab.deactivateConfirmCta"),
      onConfirm: () => {
        revokeMut.mutate(device.id, {
          onSuccess: () => {
            toast.success(t("kiosksTab.deactivated"));
            // You got into Admin -> Kiosks on some browser; if that browser
            // happens to be the very device you just deactivated (you PIN'd
            // in from the kiosk itself), its local "this browser is a
            // kiosk" state would otherwise keep showing stale until its next
            // heartbeat, up to 60s away (#824). Never touches the admin
            // session itself, only the device/location bits.
            if (localStorage.getItem("kiosk_device_id") === device.id) {
              clearKioskDeviceState();
            }
          },
          onError: (err: Error) => toast.error(t("kiosksTab.deactivateFailed", { error: err.message })),
        });
        setConfirmModal(null);
      },
    });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{t("kiosksTab.loading")}</p>;
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center">
          <Tablet size={28} className="text-sage" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl text-foreground">{t("kiosksTab.emptyHeading")}</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{t("kiosksTab.emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-lg text-foreground">{t("kiosksTab.heading")}</h2>
        <p className="text-xs text-muted-foreground">{t("kiosksTab.subtitle")}</p>
      </div>

      {groups.map(({ concept, locationGroups }) => (
        <div key={concept.id} className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Building2 size={12} />
            {concept.name}
          </div>

          {locationGroups.map(({ location, devices: locationDevices }) => (
            <div key={location.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
                <UtensilsCrossed size={14} className="text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{location.name}</p>
              </div>
              <div className="divide-y divide-border">
                {locationDevices.map(device => {
                  const status = kioskStatus(device, t);
                  return (
                    <div key={device.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Tablet size={15} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{device.label}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                                status.online ? "bg-status-ok" : "bg-muted-foreground/40",
                              )}
                            />
                            {status.label}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => confirmDeactivate(device, location.name)}
                        className="text-xs font-semibold text-status-error hover:underline shrink-0"
                      >
                        {t("kiosksTab.deactivate")}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          actionLabel={confirmModal.actionLabel}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
        />
      )}
    </div>
  );
}
