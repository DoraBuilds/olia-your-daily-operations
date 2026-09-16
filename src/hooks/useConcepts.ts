import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Concept } from "@/lib/admin-repository";

export function useConcepts() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["concepts", teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concepts")
        .select("id, organization_id, name, created_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Concept[];
    },
    enabled: !!teamMember?.organization_id,
  });
}

export function useSaveConcept() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (concept: { id?: string; name: string }) => {
      if (concept.id) {
        const { error } = await supabase
          .from("concepts")
          .update({ name: concept.name })
          .eq("id", concept.id);
        if (error) throw error;
        return concept.id;
      }
      if (!teamMember?.organization_id) {
        throw new Error("Your account setup is not complete. Please refresh the page and try again.");
      }
      const { data, error } = await supabase
        .from("concepts")
        .insert({ organization_id: teamMember.organization_id, name: concept.name })
        .select("id")
        .single();
      if (error) throw error;
      return data?.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concepts"] }),
  });
}

export function useDeleteConcept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("concepts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["concepts"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}
