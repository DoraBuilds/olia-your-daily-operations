// ─── MyLocationTab ────────────────────────────────────────────────────────────

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MapPin, Mail, Phone, Plus, Pencil, Trash2, Archive, RotateCcw,
  ChevronDown, Search, Tablet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Location, type StaffProfile, type ManagerPermissions,
  type StaffDepartment,
  getRoleDepartment, getInitials, daysAgo, daysAgoTooltip, staffDisplayName,
} from "@/lib/admin-repository";
import { type ChecklistItem } from "@/hooks/useChecklists";
import { clearKioskDeviceState } from "@/lib/kiosk-guard";
import {
  ROLE_COLOR_MAP,
} from "./shared";

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export interface MyLocationTabProps {
  locations: Location[];
  staffProfiles: StaffProfile[];
  checklists: ChecklistItem[];
  roles: string[];
  currentLocationId: string;
  setCurrentLocationId: (id: string) => void;
  isOwner: boolean;
  permissions: ManagerPermissions | null;
  onAddLocation: () => void;
  onEditLocation: (loc: Location) => void;
  onUpdateLocation: (loc: Location) => void;
  onAddStaff: () => void;
  onEditStaff: (sp: StaffProfile) => void;
  onArchiveStaff: (sp: StaffProfile) => void;
  onRestoreStaff: (id: string) => void;
  onDeleteStaff: (sp: StaffProfile) => void;
  onLaunchKiosk: () => void;
}

export function MyLocationTab({
  locations, staffProfiles, checklists, roles, currentLocationId, setCurrentLocationId,
  isOwner, permissions,
  onAddLocation, onEditLocation, onUpdateLocation, onAddStaff, onEditStaff, onArchiveStaff, onRestoreStaff, onDeleteStaff,
  onLaunchKiosk,
}: MyLocationTabProps) {
  const { t } = useTranslation("admin");
  const [staffSearch, setStaffSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  // Local state for archive threshold — string so the user can clear the field
  // freely while typing. null = not editing (show saved value).
  // Save is only enabled when the draft is a valid integer >= 1 AND differs from saved.
  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);

  // Whether *this browser* is currently registered as a kiosk device — a
  // device-level fact independent of currentLocationId/the picker above.
  // Read once at mount; clearKioskDeviceState() below flips it off directly
  // rather than re-reading localStorage (#633).
  const [kioskDeviceActive, setKioskDeviceActive] = useState(
    () => Boolean(localStorage.getItem("kiosk_location_id")),
  );
  const [kioskDeviceName] = useState(() => localStorage.getItem("kiosk_location_name") ?? "");
  const [confirmingKioskExit, setConfirmingKioskExit] = useState(false);

  const currentLocation = locations.find(l => l.id === currentLocationId) ?? locations[0];

  const canEditLocation = !permissions || permissions.edit_location_details;
  const canEditThreshold = !permissions || permissions.override_inactivity_threshold;
  const canManageStaff = !permissions || permissions.manage_staff_profiles;

  const filteredStaff = staffProfiles.filter(sp => {
    if (sp.location_id !== (currentLocation?.id ?? "")) return false;
    const statusMatch = showArchived ? sp.status === "archived" : sp.status === "active";
    if (!statusMatch) return false;
    if (!staffSearch.trim()) return true;
    return staffDisplayName(sp).toLowerCase().includes(staffSearch.toLowerCase());
  });

  // ── No locations yet → onboarding empty state ─────────────────────────────
  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center">
          <MapPin size={28} className="text-sage" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl text-foreground">{t("myLocationTab.onboarding.heading")}</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            {t("myLocationTab.onboarding.body")}
          </p>
        </div>
        <button
          onClick={onAddLocation}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors"
        >
          <Plus size={15} />
          {t("myLocationTab.onboarding.cta")}
        </button>
      </div>
    );
  }

  if (!currentLocation) return null;

  return (
    <div className="space-y-4">
      {/* Kiosk-device banner — surfaces the previously-invisible fact that
          this browser is registered as a kiosk, and gives a one-click,
          PIN-gated-by-already-being-in-Admin way to un-register it. Without
          this, the kiosk-escape guard (#631) permanently bounces this
          browser back to /kiosk with no in-product way out (#633). */}
      {kioskDeviceActive && (
        <div className="rounded-2xl border border-status-warn/40 bg-status-warn/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Tablet size={15} className="text-status-warn shrink-0" />
            <p className="text-xs text-status-warn font-medium">
              {t("myLocationTab.kioskDeviceActive", {
                name: kioskDeviceName || t("myLocationTab.kioskDeviceActiveFallbackName"),
              })}
            </p>
          </div>
          {confirmingKioskExit ? (
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground">{t("myLocationTab.exitKioskConfirm")}</span>
              <button
                onClick={() => setConfirmingKioskExit(false)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {t("sharedUI.cancel")}
              </button>
              <button
                onClick={() => {
                  clearKioskDeviceState();
                  setKioskDeviceActive(false);
                  setConfirmingKioskExit(false);
                  window.location.href = "/";
                }}
                className="text-xs font-semibold text-status-error hover:underline"
              >
                {t("myLocationTab.exitKioskConfirmCta")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingKioskExit(true)}
              className="text-xs font-semibold text-status-warn hover:underline shrink-0"
            >
              {t("myLocationTab.exitKiosk")}
            </button>
          )}
        </div>
      )}

      {/* Location picker */}
      {isOwner ? (
        <div>
          <p className="section-label mb-2">{t("myLocationTab.locationLabel")}</p>
          <div className="relative">
            <select
              value={currentLocationId}
              onChange={e => setCurrentLocationId(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 pr-10 text-sm bg-muted appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1">
          <MapPin size={14} className="text-sage" />
          <p className="text-sm font-medium text-foreground">{currentLocation.name}</p>
        </div>
      )}

      {/* Location details card + map + kiosk CTA */}
      <div className="flex gap-3 items-stretch">

        {/* Left — location details */}
        <div className="card-surface p-4 flex-1 space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <p className="section-label">{t("myLocationTab.locationDetails")}</p>
            {canEditLocation && (
              <button
                onClick={() => onEditLocation(currentLocation)}
                className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
              >
                <Pencil size={12} /> {t("myLocationTab.edit")}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {currentLocation.address && (
              <div className="flex items-start gap-2">
                <MapPin size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{currentLocation.address}</p>
              </div>
            )}
            {currentLocation.contact_email ? (
              <div className="flex items-start gap-2">
                <Mail size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{currentLocation.contact_email}</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-status-warn/40 bg-status-warn/10 px-3 py-2">
                <Mail size={13} className="text-status-warn mt-0.5 shrink-0" />
                <p className="text-xs text-status-warn font-medium">{t("myLocationTab.noAlertEmail")}</p>
              </div>
            )}
            {currentLocation.contact_phone && (
              <div className="flex items-start gap-2">
                <Phone size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{currentLocation.contact_phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right — map thumbnail + kiosk CTA */}
        <div className="flex flex-col justify-between w-[35%] shrink-0 gap-2 h-full">
          {currentLocation.lat != null && currentLocation.lng != null ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${currentLocation.lat},${currentLocation.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl overflow-hidden border border-border shadow-sm hover:opacity-90 transition-opacity block"
              style={{ height: 120 }}
            >
              <iframe
                title={t("myLocationTab.mapTitle")}
                src={
                  `https://www.openstreetmap.org/export/embed.html` +
                  `?bbox=${currentLocation.lng - 0.003},${currentLocation.lat - 0.002},${currentLocation.lng + 0.003},${currentLocation.lat + 0.002}` +
                  `&layer=mapnik&marker=${currentLocation.lat},${currentLocation.lng}`
                }
                className="w-full h-full border-0 pointer-events-none"
                loading="lazy"
              />
            </a>
          ) : (
            <div
              className="rounded-2xl border border-border bg-muted flex items-center justify-center"
              style={{ height: 120 }}
            >
              <MapPin size={18} className="text-muted-foreground" />
            </div>
          )}
          <button
            onClick={onLaunchKiosk}
            className="w-full rounded-2xl text-xs font-bold tracking-wider uppercase bg-sage text-white hover:bg-sage-deep transition-colors flex flex-row items-center justify-center gap-2 shadow-md px-2 py-3"
          >
            <span>{t("myLocationTab.kiosk")}</span>
            <Tablet size={14} />
          </button>
        </div>

      </div>

      {/* Staff Profiles */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">{t("myLocationTab.staffProfiles")}</p>
          {canManageStaff && (
            <button
              onClick={onAddStaff}
              className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
            >
              <Plus size={12} /> {t("myLocationTab.add")}
            </button>
          )}
        </div>

        {/* Search + archive toggle */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={staffSearch} onChange={e => setStaffSearch(e.target.value)}
              placeholder={t("myLocationTab.searchStaff")}
              className="w-full border border-border rounded-xl pl-8 pr-4 py-2 text-xs bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors whitespace-nowrap",
              showArchived
                ? "bg-muted text-foreground border-border"
                : "text-muted-foreground border-border hover:text-foreground hover:bg-muted",
            )}
          >
            {showArchived ? (
              <><RotateCcw size={11} /> {t("myLocationTab.active")}</>
            ) : (
              <><Archive size={11} /> {t("myLocationTab.archived")}</>
            )}
          </button>
        </div>

        <div className="card-surface divide-y divide-border">
          {filteredStaff.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {showArchived ? t("myLocationTab.noArchivedProfiles") : t("myLocationTab.noActiveProfiles")}
              </p>
            </div>
          ) : filteredStaff.map(sp => {
            const displayRole = getRoleDepartment(sp.role);
            const roleColor = ROLE_COLOR_MAP[displayRole] ?? "bg-muted text-muted-foreground";
            return (
              <div key={sp.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-sage-light flex items-center justify-center text-xs font-semibold text-sage-deep shrink-0">
                  {getInitials(staffDisplayName(sp))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{staffDisplayName(sp)}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5"
                     title={daysAgoTooltip(sp.last_used_at)}>{daysAgo(sp.last_used_at)}</p>
                </div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", roleColor)}>
                  {displayRole}
                </span>
                {sp.status === "active" ? (
                  <>
                    {canManageStaff && (
                      <button
                        onClick={() => onEditStaff(sp)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t("myLocationTab.editAria")}
                      >
                        <Pencil size={14} className="text-muted-foreground" />
                      </button>
                    )}
                    {canManageStaff && (
                      <button
                        onClick={() => onArchiveStaff(sp)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t("myLocationTab.archiveAria")}
                      >
                        <Archive size={14} className="text-muted-foreground" />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onRestoreStaff(sp.id)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t("myLocationTab.restoreAria")}
                    >
                      <RotateCcw size={14} className="text-sage" />
                    </button>
                    {canManageStaff && (
                      <button
                        onClick={() => onDeleteStaff(sp)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t("myLocationTab.deletePermanentlyAria")}
                      >
                        <Trash2 size={14} className="text-status-error" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Auto-archive threshold — only shown when viewing archived staff,
            where the setting is contextually relevant. Hidden in active view. */}
        {showArchived && canEditThreshold && (
          <div className="border border-border rounded-2xl px-4 py-3 bg-muted/30 mt-3">
            <p className="section-label mb-1">{t("myLocationTab.autoArchiveThreshold")}</p>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              {t("myLocationTab.autoArchiveDescription")}
            </p>
            {(() => {
              const parsedDraft = thresholdDraft !== null
                ? (thresholdDraft.trim() !== "" && /^\d+$/.test(thresholdDraft.trim())
                    ? parseInt(thresholdDraft.trim(), 10)
                    : null)
                : null;
              const isDraftValid   = parsedDraft !== null && parsedDraft >= 1;
              const isDraftChanged = isDraftValid && parsedDraft !== currentLocation.archive_threshold_days;

              return (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={thresholdDraft ?? String(currentLocation.archive_threshold_days)}
                    onChange={e => setThresholdDraft(e.target.value)}
                    onFocus={() => setThresholdDraft(String(currentLocation.archive_threshold_days))}
                    onBlur={() => {
                      if (thresholdDraft !== null && !isDraftValid) setThresholdDraft(null);
                    }}
                    min={1}
                    className={cn(
                      "w-24 border rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring",
                      thresholdDraft !== null && !isDraftValid ? "border-status-error" : "border-border",
                    )}
                  />
                  <span className="text-sm text-muted-foreground">{t("myLocationTab.days")}</span>
                  {thresholdDraft !== null && (
                    isDraftValid ? (
                      isDraftChanged ? (
                        <button
                          onClick={() => {
                            onUpdateLocation({ ...currentLocation, archive_threshold_days: parsedDraft! });
                            setThresholdDraft(null);
                          }}
                          className="px-3 py-2 rounded-xl text-xs font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
                        >
                          {t("myLocationTab.save")}
                        </button>
                      ) : null
                    ) : (
                      <span className="text-xs text-status-error">{t("myLocationTab.enterNumberAtLeastOne")}</span>
                    )
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* Assigned Checklists */}
      <div className="card-surface p-4">
        {(() => {
          const locationChecklists = checklists.filter(c => c.location_id === currentLocation.id);
          return (
            <>
              <p className="section-label mb-3">
                {locationChecklists.length > 0
                  ? t("myLocationTab.assignedChecklistsWithCount", { count: locationChecklists.length })
                  : t("myLocationTab.assignedChecklists")}
              </p>
              {locationChecklists.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("myLocationTab.noChecklistsAssigned")}
                </p>
              ) : (
                <div className="space-y-2">
                  {locationChecklists.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-2 py-0.5">
                      <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                      <p className="text-sm text-foreground">{c.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </div>

    </div>
  );
}
