import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

/** The signed-in owner/manager's own opt-in to "a checklist was Missed" emails. */
export function useMyMissedNotifications() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["my_notify_missed", teamMember?.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("notify_missed")
        .eq("id", teamMember!.id)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.notify_missed);
    },
    enabled: !!teamMember?.id,
  });
}

export function useSetMyMissedNotifications() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("team_members")
        .update({ notify_missed: enabled })
        .eq("id", teamMember!.id);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => qc.setQueryData(["my_notify_missed", teamMember?.id ?? null], enabled),
  });
}
