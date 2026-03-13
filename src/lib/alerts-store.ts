// Shared operational alerts store used by Checklists (create action) and Dashboard/Notifications

export interface OperationalAlert {
  id: string;
  type: "error" | "warn";
  message: string;
  area: string;
  time?: string;
  source?: "system" | "action"; // "action" = created by checklist logic trigger
}

// DEFAULT_ALERTS deliberately left empty — the real alerts source is the
// `alerts` Supabase table (via useAlerts hook). This store is kept for
// backward-compatibility with existing tests and for manual addAlert() calls.
const DEFAULT_ALERTS: OperationalAlert[] = [];

type Listener = () => void;

let alerts: OperationalAlert[] = [...DEFAULT_ALERTS];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(fn => fn());
}

export function getAlerts(): OperationalAlert[] {
  return alerts;
}

export function addAlert(alert: OperationalAlert) {
  alerts = [alert, ...alerts];
  notify();
}

export function removeAlert(id: string) {
  alerts = alerts.filter(a => a.id !== id);
  notify();
}

export function clearAllAlerts() {
  alerts = [];
  notify();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
