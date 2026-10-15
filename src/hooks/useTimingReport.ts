import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { MissReason, TimingLog, TimingMiss } from "@/pages/reporting/timing-report";

const PAGE = 1000;

/** PostgREST caps a response (1000 rows by default), so read in pages. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * Stamped completions and recorded misses in a range. `fromIso`/`toIso` bound
 * completions by time; `fromDate`/`toDate` (yyyy-MM-dd) bound misses by the
 * location's operating day.
 */
export function useTimingReportData(range: { fromIso: string; toIso: string; fromDate: string; toDate: string }) {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["timing_report", teamMember?.organization_id ?? null, range],
    queryFn: async () => {
      const [logs, misses] = await Promise.all([
        fetchAll<TimingLog>((from, to) =>
          supabase
            .from("checklist_logs")
            .select("id, checklist_id, location_id, timing_status, created_at")
            .not("timing_status", "is", null)
            .gte("created_at", range.fromIso)
            .lte("created_at", range.toIso)
            .order("created_at", { ascending: false })
            .range(from, to),
        ),
        fetchAll<TimingMiss>((from, to) =>
          supabase
            .from("checklist_misses")
            .select("id, checklist_id, checklist_title, location_id, operating_date, route, window_from, window_until, reason, note, note_by, note_at")
            .gte("operating_date", range.fromDate)
            .lte("operating_date", range.toDate)
            .order("operating_date", { ascending: false })
            .range(from, to),
        ),
      ]);
      return { logs, misses };
    },
    enabled: !!teamMember?.organization_id,
  });
}

export function useSetMissedNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { missId: string; reason: MissReason | null; note: string }) => {
      const { error } = await supabase.rpc("set_missed_note", {
        p_miss_id: v.missId,
        p_reason: v.reason,
        p_note: v.note,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timing_report"] }),
  });
}
