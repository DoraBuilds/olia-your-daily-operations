import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface DbAction {
  id: string;
  checklist_id: string | null;
  checklist_title: string | null;
  title: string;
  assigned_to: string | null;
  due: string | null;
  status: "open" | "in-progress" | "resolved";
  created_at: string;
}

export function useActions() {
  return useQuery({
    queryKey: ["actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("actions")
        .select("id, checklist_id, checklist_title, title, assigned_to, due, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DbAction[];
    },
  });
}

export function useUpdateActionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DbAction["status"] }) => {
      const { error } = await supabase
        .from("actions")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });
}

export function useSaveAction() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (action: Partial<DbAction> & { title: string }) => {
      if (action.id) {
        const { error } = await supabase
          .from("actions")
          .update({
            title: action.title,
            checklist_title: action.checklist_title ?? null,
            assigned_to: action.assigned_to ?? null,
            due: action.due ?? null,
            status: action.status ?? "open",
          })
          .eq("id", action.id);
        if (error) throw error;
      } else {
        // organization_id is required — RLS will reject rows without it
        const { error } = await supabase.from("actions").insert({
          organization_id: teamMember!.organization_id,
          title: action.title,
          checklist_id: action.checklist_id ?? null,
          checklist_title: action.checklist_title ?? null,
          assigned_to: action.assigned_to ?? null,
          due: action.due ?? null,
          status: action.status ?? "open",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });
}

export function useDeleteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("actions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });
}
