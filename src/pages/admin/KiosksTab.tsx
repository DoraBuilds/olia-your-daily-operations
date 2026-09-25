// ─── KiosksTab ──────────────────────────────────────────────────────────────
// Fleet view of every kiosk device across every concept/location (#818).
// Kiosks are created per location (here or in the Concepts tab) and paired on
// the tablet with a one-time code (Login -> Kiosk, #861); this tab is for
// visibility ("what's running, and where"), codes, and remote deactivation.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Tablet, Building2, UtensilsCrossed, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Location, type Concept } from "@/lib/admin-repository";
import {
  useKioskDevices, useRevokeKioskDevice, useCreateKioskDevice, useRegenerateKioskCode, type KioskDevice,
} from "@/hooks/useKioskDevices";
import { formatPairingCode } from "@/lib/kiosk-pairing";
import { toast } from "@/components/ui/sonner";
import { AddLink, BottomSheet, ModalHeader, FormField, SaveButton, ConfirmModal, inputCls, type ConfirmState } from "./SharedUI";
import { clearKioskDeviceState } from "@/lib/kiosk-guard";

export interface KiosksTabProps {
  concepts: Concept[];
  locations: Location[];
  isOwner?: boolean;
}

export function kioskStatus(device: KioskDevice, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (!device.paired_at) return { label: t("kiosksTab.waitingForDevice"), online: false, waiting: true };
  if (!device.last_seen_at) return { label: t("kiosksTab.neverCheckedIn"), online: false, waiting: false };
  const diffMs = Date.now() - new Date(device.last_seen_at).getTime();
  if (diffMs < 3 * 60 * 1000) return { label: t("kiosksTab.activeNow"), online: true, waiting: false };
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return { label: t("kiosksTab.lastSeenMinutes", { count: minutes }), online: false, waiting: false };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { label: t("kiosksTab.lastSeenHours", { count: hours }), online: false, waiting: false };
  const days = Math.round(hours / 24);
  return { label: t("kiosksTab.lastSeenDays", { count: days }), online: false, waiting: false };
}

export function KiosksTab({ concepts, locations, isOwner = true }: KiosksTabProps) {
  const { t } = useTranslation("admin");
  const { data: devices = [], isLoading } = useKioskDevices();
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);
  const [codeDevice, setCodeDevice] = useState<{ id: string; locationName: string } | null>(null);
  const confirmDeactivate = useConfirmDeactivateKiosk(setConfirmModal);
  const [adding, setAdding] = useState(false);

  // "Manage" on a location's Devices card links here with ?device=<id>.
  const [searchParams] = useSearchParams();
  const focusDeviceId = searchParams.get("device");

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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{t("kiosksTab.loading")}</p>;
  }

  const header = isOwner && locations.length > 0 && (
    <div className="flex justify-end">
      <AddLink onClick={() => setAdding(true)} ariaLabel={t("kiosksTab.addKiosk")} />
    </div>
  );

  const modals = (
    <>
      {adding && (
        <AddKioskModal
          locationOptions={locations}
          concepts={concepts}
          onClose={() => setAdding(false)}
          onCreated={(deviceId, locationName) => { setAdding(false); setCodeDevice({ id: deviceId, locationName }); }}
        />
      )}

      {codeDevice && (
        <KioskCodeModal deviceId={codeDevice.id} locationName={codeDevice.locationName} onClose={() => setCodeDevice(null)} />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          actionLabel={confirmModal.actionLabel}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
        />
      )}
    </>
  );

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
      {header}
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center">
          <Tablet size={28} className="text-sage" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl text-foreground">{t("kiosksTab.emptyHeading")}</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{t("kiosksTab.emptyBody")}</p>
        </div>
      </div>
      {modals}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

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
                {locationDevices.map(device => (
                  <KioskDeviceRow
                    key={device.id}
                    device={device}
                    highlighted={device.id === focusDeviceId}
                    onShowCode={isOwner ? () => setCodeDevice({ id: device.id, locationName: location.name }) : undefined}
                    onDeactivate={isOwner ? () => confirmDeactivate(device, location.name) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {modals}
    </div>
  );
}

/**
 * Opens the "deactivate this kiosk" confirm in the caller's own
 * ConfirmModal slot.
 */
export function useConfirmDeactivateKiosk(setConfirmModal: (state: ConfirmState) => void) {
  const { t } = useTranslation("admin");
  const revokeMut = useRevokeKioskDevice();
  return (device: KioskDevice, locationName: string) => {
    setConfirmModal({
      title: t("kiosksTab.deactivateConfirmTitle"),
      message: t("kiosksTab.deactivateConfirmMessage", { label: device.label, location: locationName }),
      actionLabel: t("kiosksTab.deactivateConfirmCta"),
      onConfirm: () => {
        revokeMut.mutate(device.id, {
          onSuccess: () => {
            toast.success(t("kiosksTab.deactivated"));
            // You got into Admin -> Devices on some browser; if that browser
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
}

const rowActionCls = "text-xs font-semibold hover:underline shrink-0";

export function KioskDeviceRow({
  device, onShowCode, onManage, onDeactivate, highlighted,
}: {
  device: KioskDevice;
  onShowCode?: () => void;
  onManage?: () => void;
  onDeactivate?: () => void;
  highlighted?: boolean;
}) {
  const { t } = useTranslation("admin");
  const status = kioskStatus(device, t);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [highlighted]);

  return (
    <div
      ref={ref}
      className={cn("flex items-center justify-between gap-3 px-4 py-3 transition-colors", highlighted && "bg-sage/5")}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Tablet size={15} className="text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{device.label}</p>
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5">
            <span
              className={cn(
                "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                status.online ? "bg-status-ok" : status.waiting ? "bg-status-warn" : "bg-muted-foreground/40",
              )}
            />
            <span className="whitespace-nowrap">{status.label}</span>
            {status.waiting && device.pairing_code && (
              <span className="whitespace-nowrap font-semibold tracking-wider tabular-nums text-foreground">· {formatPairingCode(device.pairing_code)}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {onShowCode && (
          <button onClick={onShowCode} className={cn(rowActionCls, "text-sage")}>
            {t("kiosksTab.code")}
          </button>
        )}
        {onManage && (
          <button onClick={onManage} className={cn(rowActionCls, "text-sage")}>
            {t("kiosksTab.manage")}
          </button>
        )}
        {onDeactivate && (
          <button onClick={onDeactivate} className={cn(rowActionCls, "text-status-error")}>
            {t("kiosksTab.deactivate")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── AddKioskModal ────────────────────────────────────────────────────────────
// Creates a kiosk for one location; the caller then shows its code. Given a
// fixed location (Concepts tab) or locationOptions to pick from (Devices tab).

type AddKioskModalProps = {
  onClose: () => void;
  onCreated: (deviceId: string, locationName: string) => void;
} & (
  | { locationId: string; locationName: string; locationOptions?: never; concepts?: never }
  | { locationOptions: Location[]; concepts: Concept[]; locationId?: never; locationName?: never }
);

export function AddKioskModal({ onClose, onCreated, ...props }: AddKioskModalProps) {
  const { t } = useTranslation("admin");
  const { data: devices = [] } = useKioskDevices();
  const [locationId, setLocationId] = useState(() => props.locationId ?? props.locationOptions?.[0]?.id ?? "");
  const locationName = props.locationName ?? props.locationOptions?.find(l => l.id === locationId)?.name ?? "";
  const defaultLabel = t("kiosksTab.defaultName", {
    number: devices.filter(d => d.location_id === locationId).length + 1,
  });
  // Follows the picked location's count until the user types their own name.
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const label = customLabel ?? defaultLabel;
  const createMut = useCreateKioskDevice();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId || !label.trim() || createMut.isPending) return;
    createMut.mutate({ locationId, label: label.trim() }, {
      onSuccess: row => onCreated(row.device_id, locationName),
      onError: (err: Error) => toast.error(t("kiosksTab.createFailed", { error: err.message })),
    });
  };

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader
        title={props.locationOptions ? t("kiosksTab.addKiosk") : t("kiosksTab.addTitle", { location: locationName })}
        onClose={onClose}
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        {props.locationOptions && (
          <FormField label={t("kiosksTab.locationLabel")}>
            <select value={locationId} onChange={e => setLocationId(e.target.value)} className={inputCls}>
              {props.concepts.map(concept => {
                const conceptLocations = props.locationOptions.filter(l => l.concept_id === concept.id);
                return conceptLocations.length > 0 && (
                  <optgroup key={concept.id} label={concept.name}>
                    {conceptLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </FormField>
        )}
        <FormField label={t("kiosksTab.nameLabel")}>
          <input
            autoFocus={!props.locationOptions}
            type="text"
            value={label}
            maxLength={60}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder={t("kiosksTab.namePlaceholder")}
            className={inputCls}
          />
        </FormField>
        <p className="text-xs text-muted-foreground">{t("kiosksTab.addHint")}</p>
        <SaveButton disabled={!locationId || !label.trim() || createMut.isPending} label={t("kiosksTab.addCta")} />
      </form>
    </BottomSheet>
  );
}

// ─── KioskCodeModal ───────────────────────────────────────────────────────────
// Unpaired: shows the code + how to use it. Paired: says so, and offers a new
// code, which disconnects the tablet that's paired now.

export function KioskCodeModal({
  deviceId, locationName, onClose,
}: {
  deviceId: string;
  locationName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin");
  const { data: devices = [] } = useKioskDevices();
  const device = devices.find(d => d.id === deviceId);
  const regenerateMut = useRegenerateKioskCode();
  const [confirmingNew, setConfirmingNew] = useState(false);

  // Deactivated elsewhere, or not in the refetched list yet.
  if (!device) return null;

  const code = device.pairing_code ? formatPairingCode(device.pairing_code) : null;
  const paired = Boolean(device.paired_at);

  const newCode = () => {
    regenerateMut.mutate(device.id, {
      onSuccess: () => setConfirmingNew(false),
      onError: (err: Error) => toast.error(t("kiosksTab.newCodeFailed", { error: err.message })),
    });
  };

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={device.label} onClose={onClose} />
      <p className="text-xs text-muted-foreground -mt-2">{locationName}</p>

      {!paired && code ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted py-5 text-center">
            <p className="text-3xl font-semibold tracking-[0.2em] tabular-nums text-foreground select-all">{code}</p>
          </div>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(
                () => toast.success(t("kiosksTab.codeCopied")),
                () => undefined,
              );
            }}
            className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-sage hover:underline"
          >
            <Copy size={12} /> {t("kiosksTab.copyCode")}
          </button>
          <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
            <li>{t("kiosksTab.pairStep1")}</li>
            <li>{t("kiosksTab.pairStep2")}</li>
            <li>{t("kiosksTab.pairStep3")}</li>
          </ol>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("kiosksTab.pairedMessage", { status: kioskStatus(device, t).label.toLowerCase() })}</p>
          <p>
            {code ? (
              <>{t("kiosksTab.codeUsedPrefix")} <span className="font-semibold tracking-wider text-foreground line-through">{code}</span> {t("kiosksTab.codeUsedSuffix")}</>
            ) : t("kiosksTab.pairedBeforeCodes")}
          </p>
        </div>
      )}

      {confirmingNew ? (
        <div className="rounded-xl border border-status-error/30 bg-status-error/5 p-3 space-y-3">
          <p className="text-sm text-foreground">
            {paired ? t("kiosksTab.newCodeWarningPaired") : t("kiosksTab.newCodeWarningUnpaired")}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmingNew(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
            >
              {t("sharedUI.cancel")}
            </button>
            <button
              disabled={regenerateMut.isPending}
              onClick={newCode}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-status-error text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-40"
            >
              {t("kiosksTab.newCode")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmingNew(true)}
            className="flex-1 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
          >
            {t("kiosksTab.newCode")}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
          >
            {t("kiosksTab.done")}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
