import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LocationDepartment } from "@/lib/admin-repository";

/** Departments for a single location — departments vary by venue size, so they're scoped per-location, not org-wide. */
export function useDepartments(locationId: string | null | undefined) {
  return useQuery({
    queryKey: ["departments", locationId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, location_id, name")
        .eq("location_id", locationId as string)
        .order("name");
      if (error) throw error;
      return (data ?? []) as LocationDepartment[];
    },
    enabled: !!locationId,
  });
}

/** Departments across several locations at once — for pickers where a team member spans multiple locations. */
export function useDepartmentsForLocations(locationIds: string[]) {
  const sortedIds = [...locationIds].sort();
  return useQuery({
    queryKey: ["departments", "multi", sortedIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, location_id, name")
        .in("location_id", sortedIds)
        .order("name");
      if (error) throw error;
      return (data ?? []) as LocationDepartment[];
    },
    enabled: sortedIds.length > 0,
  });
}

export function useSaveDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dep: { id?: string; location_id: string; name: string }) => {
      if (dep.id) {
        const { error } = await supabase
          .from("departments")
          .update({ name: dep.name })
          .eq("id", dep.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("departments")
          .insert({ location_id: dep.location_id, name: dep.name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Broad "departments" prefix so both the single-location cache and the
      // multi-location picker's cache (queryKey ["departments", "multi", ...])
      // get refreshed — a location-scoped key wouldn't match the multi one.
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; location_id: string }) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}
