import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  CompanyDepartment, Department, DepartmentAssignment, LocationDepartment,
} from "@/lib/admin-repository";

// Departments are company-wide (#838): one row per department, plus
// assignments to whole concepts or specific locations. Location-scoped
// pickers read the location_departments view, which resolves those
// assignments into (location, department) pairs.

/** Departments that apply to a single location. */
export function useDepartments(locationId: string | null | undefined) {
  return useQuery({
    queryKey: ["departments", locationId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_departments")
        .select("id, location_id, name")
        .eq("location_id", locationId as string)
        .order("name");
      if (error) throw error;
      return (data ?? []) as LocationDepartment[];
    },
    enabled: !!locationId,
  });
}

/** Departments that apply to any of several locations — one entry per department. */
export function useDepartmentsForLocations(locationIds: string[]) {
  const sortedIds = [...locationIds].sort();
  return useQuery({
    queryKey: ["departments", "multi", sortedIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_departments")
        .select("id, location_id, name")
        .in("location_id", sortedIds)
        .order("name");
      if (error) throw error;
      const byId = new Map<string, Department>();
      for (const row of (data ?? []) as LocationDepartment[]) {
        if (!byId.has(row.id)) byId.set(row.id, { id: row.id, name: row.name });
      }
      return [...byId.values()];
    },
    enabled: sortedIds.length > 0,
  });
}

/** Every department in the company with its assignments — for the Admin → Departments tab. */
export function useCompanyDepartments() {
  return useQuery({
    queryKey: ["departments", "company"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, department_assignments(concept_id, location_id)")
        .order("name");
      if (error) throw error;
      return ((data ?? []) as Array<Department & { department_assignments: DepartmentAssignment[] | null }>)
        .map(({ department_assignments, ...dep }): CompanyDepartment => ({
          ...dep,
          assignments: department_assignments ?? [],
        }));
    },
  });
}

/**
 * Create or update a department's name and assignments. Assignments are
 * replaced wholesale in one RPC, which also clears the department from
 * team members / checklists at locations it no longer applies to.
 */
export function useSaveDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dep: { id?: string; name: string; assignments: DepartmentAssignment[] }) => {
      let id = dep.id;
      if (id) {
        const { error } = await supabase.from("departments").update({ name: dep.name }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("departments")
          .insert({ name: dep.name })
          .select("id")
          .single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }
      const { error } = await supabase.rpc("set_department_assignments", {
        p_department_id: id,
        p_assignments: dep.assignments,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Broad prefix: refreshes the company list and every location-scoped
      // picker cache. Team members / checklists may have been pruned too.
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.rpc("delete_department", { p_department_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
  });
}
