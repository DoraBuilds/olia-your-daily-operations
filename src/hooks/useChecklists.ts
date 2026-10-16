import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { captureEvent } from "@/lib/posthog";
import i18n from "@/lib/i18n";

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
  department_ids?: string[] | null;
  /** Set only when location_id/location_ids are both null — scopes an "all locations" checklist to one concept instead of the whole org. */
  concept_id?: string | null;
  start_date: string | null;
  schedule: any;
  /** Full question content. NOT loaded by the list (see useChecklists) — use
   *  useLoadChecklist() when a checklist is opened, edited, previewed or exported. */
  sections?: any[];
  /** Top-level question count, kept by a DB trigger so the list can skip `sections`. */
  question_count?: number;
  time_of_day: "morning" | "afternoon" | "evening" | "anytime";
  due_time: string | null;   // HH:MM — when checklist is due (drives kiosk visibility)
  visibility_from: string | null;
  visibility_until: string | null;
  allow_late_completion: boolean;
  sort_order?: number;
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
        throw new Error(i18n.t("errors.accountSetup", { ns: "common" }));
      }
      const { error } = await supabase.rpc("save_folder", {
        p_id: folder.id ?? null,
        p_name: folder.name,
        p_parent_id: folder.parent_id ?? null,
        p_location_id: folder.location_id ?? null,
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

export function useReorderChecklists() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("reorder_checklists", { p_ids: ids });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklists"] }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_folder", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
  });
}

const LIST_COLUMNS =
  "id, organization_id, title, description, folder_id, location_id, location_ids, department_ids, concept_id, start_date, schedule, question_count, time_of_day, due_time, visibility_from, visibility_until, allow_late_completion, is_published, sort_order, created_at, updated_at";
const FULL_COLUMNS = `${LIST_COLUMNS}, sections`;

/** The list of checklists WITHOUT their questions — that content is the bulk
 *  of the payload and the list only needs a count. */
export function useChecklists() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["checklists", teamMember?.id ?? null, teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklists")
        .select(LIST_COLUMNS)
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return ((data ?? []) as ChecklistItem[]).filter(
        (checklist) => checklist.organization_id === teamMember?.organization_id,
      );
    },
    enabled: !!teamMember?.organization_id,
  });
}

async function fetchFullChecklist(id: string): Promise<ChecklistItem> {
  const { data, error } = await supabase.from("checklists").select(FULL_COLUMNS).eq("id", id).single();
  if (error) throw error;
  return data as ChecklistItem;
}

/** Returns a loader for one checklist WITH its sections. Always reads fresh —
 *  an editor must never start from a stale copy of the questions. */
export function useLoadChecklist() {
  const qc = useQueryClient();
  return (id: string) =>
    qc.fetchQuery({ queryKey: ["checklist", id], queryFn: () => fetchFullChecklist(id), staleTime: 0 });
}

export function useSaveChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (checklist: Partial<ChecklistItem> & { id?: string }) => {
      // The list doesn't carry `sections`, and save_checklist replaces them
      // wholesale — so a save built from a list item (rename, move to folder,
      // …) would wipe the checklist's questions. Take the stored ones instead.
      let sections = checklist.sections;
      if (sections === undefined && checklist.id) {
        sections = (await fetchFullChecklist(checklist.id)).sections ?? [];
      }
      const { data, error } = await supabase.rpc("save_checklist", {
        p_id:               checklist.id || null,
        p_title:            checklist.title ?? "",
        p_description:      checklist.description ?? null,
        p_folder_id:        checklist.folder_id ?? null,
        p_location_id:      checklist.location_id ?? null,
        p_location_ids:     checklist.location_ids ?? null,
        p_department_ids:   checklist.department_ids ?? null,
        p_concept_id:       checklist.concept_id ?? null,
        p_start_date:       checklist.start_date ?? null,
        p_schedule:         checklist.schedule ?? null,
        p_sections:         sections ?? [],
        p_time_of_day:      "anytime",
        p_due_time:         checklist.due_time ?? null,
        p_visibility_from:  checklist.visibility_from ?? null,
        p_visibility_until: checklist.visibility_until ?? null,
        p_allow_late_completion: checklist.allow_late_completion ?? true,
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
        // The list holds no `sections`; keep it that way and just refresh the count.
        const { sections, ...listFields } = variables;
        const count = sections ? sections.flatMap((s: any) => s?.questions ?? []).length : undefined;
        qc.setQueriesData<ChecklistItem[]>(
          { queryKey: ["checklists"] },
          (old) => old?.map((c) => c.id === variables.id
            ? { ...c, ...listFields, ...(count !== undefined ? { question_count: count } : {}) }
            : c),
        );
      } else {
        captureEvent("checklist_created", { checklist_id: data as string | undefined });
      }
      qc.invalidateQueries({ queryKey: ["checklists"] });
      qc.invalidateQueries({ queryKey: ["checklist"] });
    },
  });
}

/** The whole builder state, saved as one document while editing a live checklist. */
export interface ChecklistDraftContent {
  title: string;
  description: string;
  sections: any[];
  startDate: string | null;
  schedule: string;
  customRecurrence: any;
  visibilityWindowEnabled: boolean;
  visibilityFrom: string;
  visibilityUntil: string;
  allowLateCompletion: boolean;
  selectedLocationIds: string[];
  allLocationsConceptId: string | null;
  selectedDepartmentIds: string[];
  isPublished: boolean;
}

/** Ids of checklists that have unpublished edits (a draft on top of the live version). */
export function useChecklistDraftIds() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["checklist-drafts", teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.from("checklist_edit_drafts").select("checklist_id");
      if (error) throw error;
      return (data ?? []).map(r => r.checklist_id as string);
    },
    enabled: !!teamMember?.organization_id,
  });
}

/** Returns a loader for one checklist's draft (null when it has none). Always reads fresh. */
export function useLoadChecklistDraft() {
  const qc = useQueryClient();
  return (id: string) =>
    qc.fetchQuery({
      queryKey: ["checklist-draft", id],
      staleTime: 0,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("checklist_edit_drafts").select("content").eq("checklist_id", id).maybeSingle();
        if (error) throw error;
        return (data?.content ?? null) as ChecklistDraftContent | null;
      },
    });
}

export function useSaveChecklistDraft() {
  const qc = useQueryClient();
  return async (id: string, content: ChecklistDraftContent) => {
    const { error } = await supabase.rpc("save_checklist_draft", { p_checklist_id: id, p_content: content });
    if (error) throw error;
    qc.setQueriesData<string[]>({ queryKey: ["checklist-drafts"] }, old => (old && !old.includes(id) ? [...old, id] : old));
  };
}

export function useClearChecklistDraft() {
  const qc = useQueryClient();
  return async (id: string) => {
    const { error } = await supabase.rpc("clear_checklist_draft", { p_checklist_id: id });
    if (error) throw error;
    qc.setQueriesData<string[]>({ queryKey: ["checklist-drafts"] }, old => old?.filter(x => x !== id));
  };
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
