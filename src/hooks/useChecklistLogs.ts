import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface ChecklistLog {
  id: string;
  checklist_id: string | null;
  checklist_title: string;
  completed_by: string;
  staff_profile_id: string | null;
  score: number | null;
  type: string | null;
  answers: any[];
  created_at: string;
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

export function useChecklistLogs(filters?: { from?: string; to?: string; location_id?: string }) {
  return useQuery({
    queryKey: ["checklist_logs", filters],
    queryFn: async () => {
      let q = supabase
        .from("checklist_logs")
        .select("id, checklist_id, checklist_title, completed_by, staff_profile_id, score, type, answers, created_at")
        .order("created_at", { ascending: false });
      if (filters?.from) q = q.gte("created_at", filters.from);
      if (filters?.to) q = q.lte("created_at", filters.to);
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist_logs"] }),
  });
}
