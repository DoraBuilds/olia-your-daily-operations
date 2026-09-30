import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { captureEvent } from "@/lib/posthog";

export interface ChecklistLog {
  id: string;
  checklist_id: string | null;
  checklist_title: string;
  completed_by: string;
  staff_profile_id: string | null;
  score: number | null;
  type: string | null;
  /** Absent on summary reads (`withAnswers: false`). */
  answers?: any[];
  created_at: string;
  location_id: string | null;  // added by migration 20260312000001
  started_at: string | null;   // added by migration 20260326000001_checklist_logs_started_at
}

export interface CreateLogPayload {
  checklist_id?: string;
  checklist_title: string;
  completed_by: string;
  staff_profile_id?: string;
  score?: number;
  type?: string;
  answers?: any[];
  organization_id: string;
}

const LOG_SUMMARY_COLUMNS =
  "id, checklist_id, checklist_title, completed_by, staff_profile_id, score, type, created_at, location_id, started_at";

/**
 * `withAnswers: false` skips the per-question answers — by far the largest
 * part of a log. Use it wherever only scores/dates/who are shown.
 */
export function useChecklistLogs(
  filters?: { from?: string; to?: string; location_id?: string },
  options: { withAnswers?: boolean } = {},
) {
  const withAnswers = options.withAnswers ?? true;
  return useQuery({
    queryKey: withAnswers ? ["checklist_logs", filters] : ["checklist_logs", "summary", filters],
    queryFn: async () => {
      let q = supabase
        .from("checklist_logs")
        .select(withAnswers ? `${LOG_SUMMARY_COLUMNS}, answers` : LOG_SUMMARY_COLUMNS)
        .order("created_at", { ascending: false });
      if (filters?.from) q = q.gte("created_at", filters.from);
      if (filters?.to) q = q.lte("created_at", filters.to);
      if (filters?.location_id) q = q.eq("location_id", filters.location_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChecklistLog[];
    },
  });
}

export function useCreateChecklistLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateLogPayload) => {
      const { error } = await supabase.from("checklist_logs").insert({
        organization_id: payload.organization_id,
        checklist_id: payload.checklist_id ?? null,
        checklist_title: payload.checklist_title,
        completed_by: payload.completed_by,
        staff_profile_id: payload.staff_profile_id ?? null,
        score: payload.score ?? null,
        type: payload.type ?? null,
        answers: payload.answers ?? [],
      });
      if (error) throw error;
    },
    onSuccess: (_, payload) => {
      captureEvent("checklist_completed", {
        checklist_id: payload.checklist_id,
        staff_profile_id: payload.staff_profile_id,
      });
      qc.invalidateQueries({ queryKey: ["checklist_logs"] });
    },
  });
}
