import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DEFAULT_STAFF_DEPARTMENTS } from "@/lib/admin-repository";
import type { StaffDepartment } from "@/lib/admin-repository";
import { usePlan } from "./usePlan";

export function useDepartments() {
  const { org, organizationId } = usePlan();
  const qc = useQueryClient();

  const departments: StaffDepartment[] =
    org?.departments && org.departments.length > 0
      ? (org.departments as StaffDepartment[])
      : DEFAULT_STAFF_DEPARTMENTS.map(d => ({ name: d.name }));

  const mutation = useMutation({
    mutationFn: async (next: StaffDepartment[]) => {
      if (!organizationId) throw new Error("Organization not found");
      const { error } = await supabase
        .from("organizations")
        .update({ departments: next })
        .eq("id", organizationId);
      if (error) throw error;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["organization", organizationId] });
      const prev = qc.getQueryData(["organization", organizationId]);
      qc.setQueryData(["organization", organizationId], (old: any) =>
        old ? { ...old, departments: next } : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["organization", organizationId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["organization", organizationId] });
    },
  });

  const setDepartments = (updater: React.SetStateAction<StaffDepartment[]>) => {
    const next = typeof updater === "function" ? updater(departments) : updater;
    mutation.mutate(next);
  };

  return { departments, setDepartments };
}
