import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  location_id: string | null;
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
        .select("id, name, parent_id, location_id")
        .order("name");
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
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (checklist: Partial<ChecklistItem> & { id?: string }) => {
      const candidateLocationIds = [
        ...(checklist.location_id ? [checklist.location_id] : []),
        ...((checklist.location_ids ?? []).filter(Boolean)),
      ];
      const uniqueLocationIds = [...new Set(candidateLocationIds)];
      if (uniqueLocationIds.length > 0) {
        const { data: accessibleLocations, error: locationError } = await supabase
          .from("locations")
          .select("id");
        if (locationError) throw locationError;
        const accessibleIds = new Set((accessibleLocations ?? []).map((location) => location.id));
        const invalidLocationId = uniqueLocationIds.find((id) => !accessibleIds.has(id));
        if (invalidLocationId) {
          throw new Error(
            "This checklist includes a location that does not belong to your current account. Refresh the page and select locations again.",
          );
        }
      }

      const { error } = await supabase.from("checklists").upsert({
        id: checklist.id || undefined,
        organization_id: teamMember!.organization_id,
        title: checklist.title,
        folder_id: checklist.folder_id ?? null,
        location_id: checklist.location_id ?? null,
        location_ids: checklist.location_ids ?? null,
        start_date: checklist.start_date ?? null,
        schedule: checklist.schedule ?? null,
        sections: checklist.sections ?? [],
        time_of_day: "anytime",              // always anytime — kiosk uses visibility fields instead
        due_time: checklist.due_time ?? null,
        visibility_from: checklist.visibility_from ?? null,
        visibility_until: checklist.visibility_until ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
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
