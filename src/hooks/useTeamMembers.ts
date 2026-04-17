import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { TeamMember, ManagerPermissions } from "@/lib/admin-repository";
import { DEFAULT_PERMISSIONS, getInitials } from "@/lib/admin-repository";

export function useTeamMembers() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["team_members", teamMember?.id ?? null, teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, organization_id, name, email, role, location_ids, permissions, pin, pin_reset_required")
        .order("name");
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((member) => member.organization_id === teamMember?.organization_id)
        .map((m) => ({
          ...m,
          initials: getInitials(m.name),
          permissions: (m.permissions ?? DEFAULT_PERMISSIONS) as ManagerPermissions,
          location_ids: m.location_ids ?? [],
          pin_reset_required: m.pin_reset_required ?? false,
        })) as TeamMember[];
    },
    enabled: !!teamMember?.organization_id,
  });
}

export function useSaveTeamMember() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (tm: Partial<TeamMember> & { id?: string; rawPin?: string }) => {
      if (!teamMember) {
        throw new Error("Your account setup is not complete. Please refresh the page and try again.");
      }

      if (tm.id) {
        const updatePayload: Record<string, unknown> = {
          name: tm.name,
          email: tm.email,
          role: tm.role ?? "Manager",
          location_ids: tm.location_ids ?? [],
          permissions: tm.permissions ?? DEFAULT_PERMISSIONS,
        };
        if (tm.rawPin) {
          updatePayload.pin = tm.rawPin;
          updatePayload.pin_reset_required = false;
        } else if (tm.pin_reset_required !== undefined) {
          updatePayload.pin_reset_required = tm.pin_reset_required;
        }

        const { data: updated, error } = await supabase
          .from("team_members")
          .update(updatePayload)
          .eq("id", tm.id)
          .select("id");
        if (error) throw error;
        if (!updated || updated.length === 0) {
          throw new Error("Account update failed. Please refresh the page and try again.");
        }
        return;
      }

      const insertPayload: Record<string, unknown> = {
        organization_id: teamMember.organization_id,
        name: tm.name,
        email: tm.email,
        role: tm.role ?? "Manager",
        location_ids: tm.location_ids ?? [],
        permissions: tm.permissions ?? DEFAULT_PERMISSIONS,
      };
      if (tm.rawPin) {
        insertPayload.pin = tm.rawPin;
      }
      insertPayload.pin_reset_required = tm.pin_reset_required ?? (tm.role === "Owner");

      const { error } = await supabase.from("team_members").insert(insertPayload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

/**
 * Dedicated PIN-only update hook.
 * Sends only `pin` + `pin_reset_required` so unrelated fields (email, role, etc.)
 * are never touched — avoids false unique-index conflicts and makes error messages
 * actionable by surfacing the actual Supabase error text.
 */
export function useSaveAdminPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, rawPin }: { memberId: string; rawPin: string }) => {
      const { error } = await supabase
        .from("team_members")
        .update({ pin: rawPin, pin_reset_required: false })
        .eq("id", memberId);
      if (error) {
        // Surface the real Supabase message (e.g. RLS violation details)
        throw new Error(error.message ?? "Could not update admin PIN");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}
