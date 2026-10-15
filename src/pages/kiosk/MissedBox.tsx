import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { KioskChecklist } from "./types";
import { getKioskOperatingDate } from "./utils";

export const MISSED_REASONS = ["short_staffed", "equipment_issue", "forgot", "other"] as const;
export type MissedReason = (typeof MISSED_REASONS)[number];

interface MissedNote {
  checklist_id: string;
  reason: MissedReason | null;
  note: string | null;
  note_by: string | null;
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

/**
 * Read-only reminder of checklists that were missed today (late completion
 * off). Staff can't complete them, only explain why. Visually muted so it
 * never reads as a second Overdue tab. It clears itself at the location's day
 * end because the kiosk stops treating the checklist as missed then.
 */
export function MissedBox({
  checklists, locationId, dayEndTime, departmentIds, staffName, now,
}: {
  checklists: KioskChecklist[];
  locationId: string;
  dayEndTime: string | null;
  departmentIds: string[];
  staffName: string;
  now: Date;
}) {
  const { t } = useTranslation("kiosk");
  const operatingDate = getKioskOperatingDate(now, dayEndTime);
  const [notes, setNotes] = useState<Record<string, MissedNote>>({});
  const [editing, setEditing] = useState<KioskChecklist | null>(null);

  const idsKey = checklists.map(c => c.id).join(",");
  const loadNotes = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_kiosk_missed_notes", {
      p_location_id: locationId,
      p_operating_date: operatingDate,
    });
    if (error) return;
    const next: Record<string, MissedNote> = {};
    for (const row of (data ?? []) as MissedNote[]) next[row.checklist_id] = row;
    setNotes(next);
  }, [locationId, operatingDate]);

  useEffect(() => {
    if (!idsKey) return;
    void loadNotes();
  }, [idsKey, loadNotes]);

  if (checklists.length === 0) return null;

  return (
    <section data-testid="kiosk-missed-box" className="rounded-2xl border border-border bg-muted/50 px-4 py-3 space-y-2">
      <div>
        <p className="section-label">{t("missed.title")}</p>
        <p className="text-xs text-muted-foreground">{t("missed.hint")}</p>
      </div>
      <ul className="divide-y divide-border">
        {checklists.map(cl => {
          const note = notes[cl.id];
          return (
            <li key={cl.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug">{cl.title}</p>
                {cl.visibility_from && cl.visibility_until && (
                  <p className="text-xs text-muted-foreground">
                    {t("grid.visibleRange", { from: formatTime(cl.visibility_from), until: formatTime(cl.visibility_until) })}
                  </p>
                )}
                {note && (note.reason || note.note) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {note.reason && <span className="font-semibold">{t(`missed.reasons.${note.reason}`)}</span>}
                    {note.reason && note.note ? ": " : ""}
                    {note.note}
                    {note.note_by ? ` (${note.note_by})` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                data-testid={`missed-note-btn-${cl.id}`}
                onClick={() => setEditing(cl)}
                className="shrink-0 text-xs font-semibold text-muted-foreground border border-border bg-background/70 rounded-full px-3 py-1.5 hover:bg-muted transition-colors"
              >
                {note ? t("missed.editNote") : t("missed.addNote")}
              </button>
            </li>
          );
        })}
      </ul>
      {editing && (
        <MissedNoteDialog
          checklist={editing}
          initial={notes[editing.id]}
          locationId={locationId}
          operatingDate={operatingDate}
          departmentIds={departmentIds}
          staffName={staffName}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void loadNotes(); }}
        />
      )}
    </section>
  );
}

function MissedNoteDialog({
  checklist, initial, locationId, operatingDate, departmentIds, staffName, onClose, onSaved,
}: {
  checklist: KioskChecklist;
  initial?: MissedNote;
  locationId: string;
  operatingDate: string;
  departmentIds: string[];
  staffName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("kiosk");
  const [reason, setReason] = useState<MissedReason | null>(initial?.reason ?? null);
  const [text, setText] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("add_kiosk_missed_note", {
      p_location_id: locationId,
      p_checklist_id: checklist.id,
      p_operating_date: operatingDate,
      p_reason: reason,
      p_note: text,
      p_by: staffName,
      p_department_ids: departmentIds,
    });
    setSaving(false);
    if (rpcError) {
      setError(t("missed.saveFailed"));
      return;
    }
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-sm mx-4 rounded-2xl p-6 space-y-4 shadow-lg" role="dialog" aria-label={t("missed.noteTitle")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-foreground">{t("missed.noteTitle")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{checklist.title}</p>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label={t("inputs.close")}>
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {MISSED_REASONS.map(r => (
            <button
              key={r}
              type="button"
              data-testid={`missed-reason-${r}`}
              aria-pressed={reason === r}
              onClick={() => setReason(reason === r ? null : r)}
              className={cn(
                "px-3 py-2 rounded-full border text-xs font-semibold transition-colors",
                reason === r ? "bg-sage text-white border-sage" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {t(`missed.reasons.${r}`)}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value.slice(0, 500))}
          placeholder={t("missed.notePlaceholder")}
          rows={3}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sage"
        />
        {error && <p className="text-xs text-status-error">{error}</p>}
        <button
          type="button"
          data-testid="missed-note-save"
          disabled={saving || (!reason && !text.trim())}
          onClick={() => void save()}
          className={cn(
            "w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]",
            saving || (!reason && !text.trim())
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-sage text-white hover:bg-sage-deep shadow-card",
          )}
        >
          {t("missed.save")}
        </button>
      </div>
    </div>
  );
}
