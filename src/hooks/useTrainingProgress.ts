import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface TrainingProgressRow {
  id: string;
  organization_id: string;
  user_id: string;
  module_id: string;
  completed_step_indices: number[];
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveTrainingProgressInput {
  moduleId: string;
  completedStepIndices: number[];
  totalSteps: number;
}

function normalizeStepIndices(indices: number[]) {
  return Array.from(new Set(indices.filter(Number.isInteger))).sort((a, b) => a - b);
}

export function useTrainingProgress() {
  const qc = useQueryClient();
  const { user, teamMember } = useAuth();
  const organizationId = teamMember?.organization_id ?? null;
  const userId = user?.id ?? null;
  const queryKey = ["training-progress", organizationId, userId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!organizationId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_progress")
        .select("id, organization_id, user_id, module_id, completed_step_indices, is_completed, completed_at, created_at, updated_at")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrainingProgressRow[];
    },
  });

  const saveProgress = useMutation({
    mutationFn: async (input: SaveTrainingProgressInput) => {
      if (!organizationId || !userId) throw new Error("Missing training progress context");

      const completedStepIndices = normalizeStepIndices(input.completedStepIndices);
      const isCompleted = input.totalSteps > 0 && completedStepIndices.length >= input.totalSteps;
      const now = new Date().toISOString();

      const { error } = await supabase.from("training_progress").upsert({
        organization_id: organizationId,
        user_id: userId,
        module_id: input.moduleId,
        completed_step_indices: completedStepIndices,
        is_completed: isCompleted,
        completed_at: isCompleted ? now : null,
        updated_at: now,
      }, { onConflict: "organization_id,user_id,module_id" });

      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<TrainingProgressRow[]>(queryKey) ?? [];
      const completedStepIndices = normalizeStepIndices(input.completedStepIndices);
      const isCompleted = input.totalSteps > 0 && completedStepIndices.length >= input.totalSteps;
      const now = new Date().toISOString();
      const nextRow: TrainingProgressRow = {
        id: `${organizationId}-${userId}-${input.moduleId}`,
        organization_id: organizationId ?? "",
        user_id: userId ?? "",
        module_id: input.moduleId,
        completed_step_indices: completedStepIndices,
        is_completed: isCompleted,
        completed_at: isCompleted ? now : null,
        created_at: now,
        updated_at: now,
      };

      qc.setQueryData<TrainingProgressRow[]>(queryKey, current => {
        const rows = current ?? previous;
        const filtered = rows.filter(row => row.module_id !== input.moduleId);
        return [nextRow, ...filtered];
      });

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  return {
    ...query,
    saveProgress,
  };
}
