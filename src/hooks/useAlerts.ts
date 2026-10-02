import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "@/lib/i18n";

export interface AlertRecord {
  id: string;
  type: "error" | "warn" | "info";
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
      if (!teamMember) {
        throw new Error(i18n.t("errors.accountSetup", { ns: "common" }));
      }
      const { error } = await supabase.from("alerts").insert({
        organization_id: teamMember.organization_id,
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

async function dismissAlerts(ids: string[]) {
  if (!ids.length) return;
  const { data, error } = await supabase.rpc("dismiss_alerts", { p_ids: ids });
  if (error) throw error;
  if (typeof data === "number" && data === 0) {
    throw new Error(i18n.t("clearFailed", { ns: "notifications" }));
  }
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissAlerts([id]),
    onSettled: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useClearAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => dismissAlerts(ids),
    onSettled: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}
