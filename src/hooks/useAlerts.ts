import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface AlertRecord {
  id: string;
  type: "error" | "warn";
  message: string;
  area: string | null;
  time: string | null;
  source: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, type, message, area, time, source, dismissed_at, created_at")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AlertRecord[];
    },
    refetchInterval: 30000,
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (alert: Omit<AlertRecord, "id" | "dismissed_at" | "created_at">) => {
      const { error } = await supabase.from("alerts").insert({
        organization_id: teamMember!.organization_id,
        type: alert.type,
        message: alert.message,
        area: alert.area ?? null,
        time: alert.time ?? null,
        source: alert.source ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useClearAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("alerts")
        .update({ dismissed_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}
