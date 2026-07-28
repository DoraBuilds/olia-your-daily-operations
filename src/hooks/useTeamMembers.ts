import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { TeamMember, ManagerPermissions } from "@/lib/admin-repository";
import { DEFAULT_PERMISSIONS, getInitials } from "@/lib/admin-repository";
import { writeAuditLog } from "@/hooks/useAuditLog";

export function useTeamMembers() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["team_members", teamMember?.id ?? null, teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, organization_id, name, email, role, location_ids, permissions, pin_reset_required, last_seen_at")
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
          last_seen_at: m.last_seen_at ?? null,
          pin: undefined,   // never send hashed PIN to the browser
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
        writeAuditLog(
          { action: "update_team_member", entity_type: "team_member", entity_id: tm.id,
            details: { name: tm.name, role: tm.role } },
          teamMember,
        );
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

      const { data: inserted, error } = await supabase
        .from("team_members")
        .insert(insertPayload)
        .select("id")
        .single();
      if (error) throw error;
      const newId = inserted?.id as string | undefined;
      if (newId) {
        writeAuditLog(
          { action: "create_team_member", entity_type: "team_member", entity_id: newId,
            details: { name: tm.name, role: tm.role } },
          teamMember,
        );
      }
      return newId;
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
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: deleted, error } = await supabase.from("team_members").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error("Could not remove this team member. Please refresh and try again.");
      }
      if (teamMember) writeAuditLog({ action: "delete_team_member", entity_type: "team_member", entity_id: id }, teamMember);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

export function useTeamMemberInvites() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["team_member_invites", teamMember?.organization_id ?? null],
    queryFn: async () => {
      // No expires_at filter here — an expired-but-unaccepted invite still
      // needs to show up (as "expired", with a resend option) rather than
      // silently vanishing from the Users tab with no way to tell "expired"
      // from "never invited".
      const { data, error } = await supabase
        .from("team_member_invites")
        .select("id, team_member_id, email, accepted_at, expires_at, created_at")
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; team_member_id: string; email: string; accepted_at: string | null; expires_at: string; created_at: string }[];
    },
    enabled: !!teamMember?.organization_id,
  });
}

export function useSendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (team_member_id: string) => {
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: { team_member_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_member_invites"] }),
  });
}
