/**
 * Pure helpers extracted from Dashboard.tsx for the overdue computation.
 * Keeping these as standalone functions enables unit-testing without React.
 */

export interface ScheduledChecklist {
  id: string;
  title: string;
  due_time: string | null;
}

export interface ActionWithDue {
  id: string;
  status: string;
  due: string | null;
}

/**
 * Returns checklists whose due_time has already passed today and have no
 * completion log today.
 */
export function computeMissedChecklists<T extends ScheduledChecklist>(
  checklists: T[],
  completedTodayIds: Set<string>,
  nowMinutes: number
): T[] {
  return checklists.filter((checklist) => {
    if (!checklist.due_time) return false;
    const [hours, minutes] = checklist.due_time.split(":").map(Number);
    return (hours * 60 + minutes) < nowMinutes && !completedTodayIds.has(checklist.id);
  });
}

/**
 * Returns unresolved actions whose due date is strictly before todayStartMs.
 */
export function computeOverdueActions<T extends ActionWithDue>(
  actions: T[],
  todayStartMs: number
): T[] {
  return actions.filter(
    (action) =>
      action.status !== "resolved" &&
      action.due != null &&
      new Date(action.due).getTime() < todayStartMs
  );
}
