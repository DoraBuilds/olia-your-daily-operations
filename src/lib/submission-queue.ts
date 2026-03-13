/**
 * submission-queue.ts
 *
 * Offline-resilient retry queue for checklist log submissions.
 * When the kiosk is offline (or Supabase is temporarily unavailable),
 * failed inserts are stored in localStorage. On next kiosk load the
 * queue is drained automatically before displaying the grid.
 *
 * Usage:
 *   import { enqueueLog, drainQueue, pendingCount } from "@/lib/submission-queue";
 */

const QUEUE_KEY = "olia_pending_logs";
const MAX_ATTEMPTS = 10;
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export interface PendingLog {
  id: string;
  payload: Record<string, any>;
  enqueuedAt: number;
  attempts: number;
}

function loadQueue(): PendingLog[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as PendingLog[];
    const now = Date.now();
    const valid: PendingLog[] = [];
    for (const item of all) {
      if (item.attempts >= MAX_ATTEMPTS) {
        console.warn(`submission-queue: dropping log ${item.id} — exceeded ${MAX_ATTEMPTS} attempts`);
        continue;
      }
      if (now - item.enqueuedAt > TTL_MS) {
        console.warn(`submission-queue: dropping log ${item.id} — older than ${TTL_DAYS} days`);
        continue;
      }
      valid.push(item);
    }
    if (valid.length !== all.length) saveQueue(valid);
    return valid;
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingLog[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage quota exceeded — silently ignore, the log will be lost
    console.warn("submission-queue: localStorage write failed (quota?)");
  }
}

/** Add a failed log payload to the retry queue. */
export function enqueueLog(payload: Record<string, any>): void {
  const queue = loadQueue();
  queue.push({
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()),
    payload,
    enqueuedAt: Date.now(),
    attempts: 0,
  });
  saveQueue(queue);
}

/** Number of items currently waiting in the queue. */
export function pendingCount(): number {
  return loadQueue().length;
}

/**
 * Try to submit all queued logs using the provided insert function.
 * Successfully submitted items are removed; failed items are kept
 * and their attempt counter is incremented.
 *
 * @returns The number of items successfully submitted.
 */
export async function drainQueue(
  insertFn: (payload: Record<string, any>) => Promise<void>
): Promise<number> {
  const queue = loadQueue();
  if (!queue.length) return 0;

  let succeeded = 0;
  const remaining: PendingLog[] = [];

  for (const item of queue) {
    try {
      await insertFn(item.payload);
      succeeded++;
    } catch {
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }

  saveQueue(remaining);
  return succeeded;
}
