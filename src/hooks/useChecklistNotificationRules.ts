import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface ChecklistNotificationRules {
  id: string;
  organization_id: string;
  enabled: boolean;
  recipient_email: string;
  notify_unstarted: boolean;
  notify_unfinished: boolean;
  notify_hour: number;
}

export function useChecklistNotificationRules() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["checklist_notification_rules", teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_notification_rules")
        .select("id, organization_id, enabled, recipient_email, notify_unstarted, notify_unfinished, notify_hour")
        .maybeSingle();
      if (error) throw error;
      return data as ChecklistNotificationRules | null;
    },
    enabled: !!teamMember?.organization_id,
  });
}

export function useSaveChecklistNotificationRules() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (rules: Omit<ChecklistNotificationRules, "id" | "organization_id">) => {
      if (!teamMember) {
        throw new Error("Your account setup is not complete. Please refresh the page and try again.");
      }
      const { error } = await supabase
        .from("checklist_notification_rules")
        .upsert({
          organization_id: teamMember.organization_id,
          enabled: rules.enabled,
          recipient_email: rules.recipient_email,
          notify_unstarted: rules.notify_unstarted,
          notify_unfinished: rules.notify_unfinished,
          notify_hour: rules.notify_hour,
        }, { onConflict: "organization_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist_notification_rules"] }),
  });
}
