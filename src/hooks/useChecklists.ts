import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  location_id: string | null;
  sort_order: number;
}

export interface ChecklistItem {
  id: string;
  organization_id?: string;
  title: string;
  folder_id: string | null;
  location_id: string | null;
  location_ids?: string[] | null;
  start_date: string | null;
  schedule: any;
  sections: any[];
  time_of_day: "morning" | "afternoon" | "evening" | "anytime";
  due_time: string | null;   // HH:MM — when checklist is due (drives kiosk visibility)
  visibility_from: string | null;
  visibility_until: string | null;
  created_at: string;
  updated_at: string;
}

export function useFolders() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["folders", teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("id, name, parent_id, location_id, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FolderItem[];
    },
    enabled: !!teamMember?.organization_id,
  });
}

export function useSaveFolder() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (folder: Partial<FolderItem> & { id?: string }) => {
      const { error } = await supabase.from("folders").upsert({
        id: folder.id || undefined,
        organization_id: teamMember!.organization_id,
        name: folder.name,
        parent_id: folder.parent_id ?? null,
        location_id: folder.location_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }),
  });
}

export function useReorderFolders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{ id: string; sort_order: number }>) => {
      await Promise.all(
        items.map(({ id, sort_order }) =>
          supabase.from("folders").update({ sort_order }).eq("id", id)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
  });
}

export function useChecklists() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["checklists", teamMember?.id ?? null, teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklists")
        .select("id, organization_id, title, folder_id, location_id, location_ids, start_date, schedule, sections, time_of_day, due_time, visibility_from, visibility_until, created_at, updated_at")
        .order("title");
      if (error) throw error;
      return ((data ?? []) as ChecklistItem[]).filter(
        (checklist) => checklist.organization_id === teamMember?.organization_id,
      );
    },
    enabled: !!teamMember?.organization_id,
  });
}

export function useSaveChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (checklist: Partial<ChecklistItem> & { id?: string }) => {
      const { data, error } = await supabase.rpc("save_checklist", {
        p_id:              checklist.id || null,
        p_title:           checklist.title ?? "",
        p_folder_id:       checklist.folder_id ?? null,
        p_location_id:     checklist.location_id ?? null,
        p_location_ids:    checklist.location_ids ?? null,
        p_start_date:      checklist.start_date ?? null,
        p_schedule:        checklist.schedule ?? null,
        p_sections:        checklist.sections ?? [],
        p_time_of_day:     "anytime",
        p_due_time:        checklist.due_time ?? null,
        p_visibility_from: checklist.visibility_from ?? null,
        p_visibility_until: checklist.visibility_until ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });
}

export function useDeleteChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });
}
