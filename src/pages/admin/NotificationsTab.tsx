import { useState, useEffect } from "react";
import { Bell, Mail, Clock, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  useChecklistNotificationRules,
  useSaveChecklistNotificationRules,
} from "@/hooks/useChecklistNotificationRules";

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  const period = i < 12 ? "am" : "pm";
  return { value: i, label: `${h}:00 ${period}` };
});

export function NotificationsTab() {
  const { data: rules, isLoading } = useChecklistNotificationRules();
  const saveMut = useSaveChecklistNotificationRules();

  const [enabled, setEnabled] = useState(false);
  const [notifyUnstarted, setNotifyUnstarted] = useState(true);
  const [notifyUnfinished, setNotifyUnfinished] = useState(true);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [notifyHour, setNotifyHour] = useState(20);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!rules) return;
    setEnabled(rules.enabled);
    setNotifyUnstarted(rules.notify_unstarted);
    setNotifyUnfinished(rules.notify_unfinished);
    setRecipientEmail(rules.recipient_email);
    setNotifyHour(rules.notify_hour);
  }, [rules]);

  const isDirty = rules
    ? enabled !== rules.enabled ||
      notifyUnstarted !== rules.notify_unstarted ||
      notifyUnfinished !== rules.notify_unfinished ||
      recipientEmail !== rules.recipient_email ||
      notifyHour !== rules.notify_hour
    : enabled || recipientEmail.length > 0;

  const handleSave = () => {
    if (enabled && !recipientEmail.trim()) {
      toast.error("Enter an email address to receive notifications.");
      return;
    }
    saveMut.mutate(
      { enabled, notify_unstarted: notifyUnstarted, notify_unfinished: notifyUnfinished, recipient_email: recipientEmail.trim(), notify_hour: notifyHour },
      {
        onSuccess: () => toast.success("Notification settings saved"),
        onError: (err: Error) => toast.error(`Failed to save: ${err.message}`),
      }
    );
  };

  const handleTest = async () => {
    if (!recipientEmail.trim()) {
      toast.error("Enter an email address first.");
      return;
    }
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("check-checklist-alerts", {
        body: { recipient_email: recipientEmail.trim(), test: true },
      });
      if (error) throw error;
      toast.success(`Test notification sent to ${recipientEmail.trim()}`);
    } catch (err: any) {
      toast.error(`Could not send test: ${err.message ?? "Unknown error"}`);
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main toggle card */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bell size={16} className="text-sage" />
            <div>
              <p className="text-sm font-semibold text-foreground">Daily checklist summary</p>
              <p className="text-xs text-muted-foreground mt-0.5">Email a daily summary of incomplete checklists</p>
            </div>
          </div>
          <Switch
            data-testid="notifications-enabled-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <div className="space-y-4 pt-1 border-t border-border">
            {/* What to notify */}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Alert me about</p>
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-status-warn" />
                  <span className="text-sm text-foreground">Unstarted checklists</span>
                </div>
                <Switch
                  data-testid="notifications-unstarted-toggle"
                  checked={notifyUnstarted}
                  onCheckedChange={setNotifyUnstarted}
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-status-error" />
                  <span className="text-sm text-foreground">Unfinished checklists</span>
                </div>
                <Switch
                  data-testid="notifications-unfinished-toggle"
                  checked={notifyUnfinished}
                  onCheckedChange={setNotifyUnfinished}
                />
              </label>
            </div>

            {/* Recipient email */}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Mail size={12} />
                Send to
              </label>
              <input
                data-testid="notifications-email-input"
                type="email"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                placeholder="manager@yourplace.com"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Notify time */}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Clock size={12} />
                Send at
              </label>
              <select
                data-testid="notifications-hour-select"
                value={notifyHour}
                onChange={e => setNotifyHour(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {HOURS.map(h => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                A daily summary email will be sent at this time if any checklists are incomplete.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2">
        <button
          data-testid="notifications-save-btn"
          onClick={handleSave}
          disabled={saveMut.isPending || !isDirty}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors",
            isDirty
              ? "bg-sage text-white hover:bg-sage/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {saveMut.isPending ? "Saving…" : "Save settings"}
        </button>
        {enabled && (
          <button
            data-testid="notifications-test-btn"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:border-sage/40 transition-colors disabled:opacity-50"
          >
            <Send size={13} />
            {testing ? "Sending…" : "Test"}
          </button>
        )}
      </div>

      {/* Status note when enabled and saved */}
      {!isDirty && rules?.enabled && (
        <div className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-2xl">
          <CheckCircle2 size={14} className="text-status-ok shrink-0" />
          <p className="text-xs text-muted-foreground">
            Daily summary active — emails sent at {HOURS[rules.notify_hour]?.label} to {rules.recipient_email}.
          </p>
        </div>
      )}
    </div>
  );
}
