import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { captureEvent } from "@/lib/posthog";

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
  description?: string | null;
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
  is_published: boolean;     // Draft checklists are hidden from the kiosk until published
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
      if (!teamMember) {
        throw new Error("Your account setup is not complete. Please refresh the page and try again.");
      }
      const { error } = await supabase.from("folders").upsert({
        id: folder.id || undefined,
        organization_id: teamMember.organization_id,
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
        .select("id, organization_id, title, description, folder_id, location_id, location_ids, start_date, schedule, sections, time_of_day, due_time, visibility_from, visibility_until, is_published, created_at, updated_at")
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
        p_id:               checklist.id || null,
        p_title:            checklist.title ?? "",
        p_description:      checklist.description ?? null,
        p_folder_id:        checklist.folder_id ?? null,
        p_location_id:      checklist.location_id ?? null,
        p_location_ids:     checklist.location_ids ?? null,
        p_start_date:       checklist.start_date ?? null,
        p_schedule:         checklist.schedule ?? null,
        p_sections:         checklist.sections ?? [],
        p_time_of_day:      "anytime",
        p_due_time:         checklist.due_time ?? null,
        p_visibility_from:  checklist.visibility_from ?? null,
        p_visibility_until: checklist.visibility_until ?? null,
        // New checklists default to draft (hidden from kiosk) unless the caller says otherwise.
        p_is_published:     checklist.is_published ?? false,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // Immediately patch the cache so the list reflects the new field values
      // (e.g. location_ids) before the background refetch completes.
      // Without this, opening the edit modal immediately after saving reads
      // stale cache data and shows "All locations" even though the save succeeded.
      if (variables.id) {
        qc.setQueriesData<ChecklistItem[]>(
          { queryKey: ["checklists"] },
          (old) => old?.map((c) => c.id === variables.id ? { ...c, ...variables } : c),
        );
      } else {
        captureEvent("checklist_created", { checklist_id: data as string | undefined });
      }
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
  });
}

export function useDeleteChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_checklist", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });
}
