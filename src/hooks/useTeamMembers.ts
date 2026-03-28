import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { TeamMember, ManagerPermissions } from "@/lib/admin-repository";
import { DEFAULT_PERMISSIONS, getInitials } from "@/lib/admin-repository";
import { hashPin } from "@/hooks/useStaffProfiles";

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team_members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, name, email, role, location_ids, permissions")
        .order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).map((m) => ({
        ...m,
        initials: getInitials(m.name),
        permissions: (m.permissions ?? DEFAULT_PERMISSIONS) as ManagerPermissions,
        location_ids: m.location_ids ?? [],
      })) as TeamMember[];
    },
  });
}

export function useSaveTeamMember() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (tm: Partial<TeamMember> & { id?: string; rawPin?: string }) => {
      const { error } = await supabase.from("team_members").upsert({
        id: tm.id || undefined,
        organization_id: teamMember!.organization_id,
        name: tm.name,
        email: tm.email,
        role: tm.role ?? "Manager",
        location_ids: tm.location_ids ?? [],
        permissions: tm.permissions ?? DEFAULT_PERMISSIONS,
        ...(tm.rawPin ? { pin: await hashPin(tm.rawPin) } : {}),
      });
      if (error) throw error;
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
