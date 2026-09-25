import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface TrainingProgressRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  team_member_id: string;
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
  /** Explicit complete/incomplete toggle; otherwise derived from the steps. */
  isCompleted?: boolean;
}

function normalizeStepIndices(indices: number[]) {
  return Array.from(new Set(indices.filter(Number.isInteger))).sort((a, b) => a - b);
}

function resolveIsCompleted(input: SaveTrainingProgressInput, completedStepIndices: number[]) {
  if (input.isCompleted !== undefined) return input.isCompleted;
  return input.totalSteps > 0 && completedStepIndices.length >= input.totalSteps;
}

export function useTrainingProgress() {
  const qc = useQueryClient();
  // Progress belongs to the team member (not the login) so it's shared with
  // the kiosk, where PIN-only members complete training too (#905).
  const { user, teamMember } = useAuth();
  const organizationId = teamMember?.organization_id ?? null;
  const teamMemberId = teamMember?.id ?? null;
  const userId = user?.id ?? null;
  const queryKey = ["training-progress", organizationId, teamMemberId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!organizationId && !!teamMemberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_progress")
        .select("id, organization_id, user_id, team_member_id, module_id, completed_step_indices, is_completed, completed_at, created_at, updated_at")
        .eq("organization_id", organizationId)
        .eq("team_member_id", teamMemberId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrainingProgressRow[];
    },
  });

  const saveProgress = useMutation({
    mutationFn: async (input: SaveTrainingProgressInput) => {
      if (!organizationId || !teamMemberId) throw new Error("Missing training progress context");

      const completedStepIndices = normalizeStepIndices(input.completedStepIndices);
      const isCompleted = resolveIsCompleted(input, completedStepIndices);
      const now = new Date().toISOString();

      const { error } = await supabase.from("training_progress").upsert({
        organization_id: organizationId,
        user_id: userId,
        team_member_id: teamMemberId,
        module_id: input.moduleId,
        completed_step_indices: completedStepIndices,
        is_completed: isCompleted,
        completed_at: isCompleted ? now : null,
        updated_at: now,
      }, { onConflict: "organization_id,team_member_id,module_id" });

      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<TrainingProgressRow[]>(queryKey) ?? [];
      const completedStepIndices = normalizeStepIndices(input.completedStepIndices);
      const isCompleted = resolveIsCompleted(input, completedStepIndices);
      const now = new Date().toISOString();
      const nextRow: TrainingProgressRow = {
        id: `${organizationId}-${teamMemberId}-${input.moduleId}`,
        organization_id: organizationId ?? "",
        user_id: userId,
        team_member_id: teamMemberId ?? "",
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
