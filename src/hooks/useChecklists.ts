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
  title: string;
  folder_id: string | null;
  location_id: string | null;
  schedule: any;
  sections: any[];
  time_of_day: "morning" | "afternoon" | "evening" | "anytime";
  created_at: string;
  updated_at: string;
}

export function useFolders() {
  return useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("id, name, parent_id, location_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as FolderItem[];
    },
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
  return useQuery({
    queryKey: ["checklists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklists")
        .select("id, title, folder_id, location_id, schedule, sections, time_of_day, created_at, updated_at")
        .order("title");
      if (error) throw error;
      return (data ?? []) as ChecklistItem[];
    },
  });
}

export function useSaveChecklist() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (checklist: Partial<ChecklistItem> & { id?: string }) => {
      const { error } = await supabase.from("checklists").upsert({
        id: checklist.id || undefined,
        organization_id: teamMember!.organization_id,
        title: checklist.title,
        folder_id: checklist.folder_id ?? null,
        location_id: checklist.location_id ?? null,
        schedule: checklist.schedule ?? null,
        sections: checklist.sections ?? [],
        time_of_day: checklist.time_of_day ?? "anytime",
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
