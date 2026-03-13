import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { StaffProfile } from "@/lib/admin-repository";

/** Hash a raw PIN using SHA-256 via the Web Crypto API. */
export async function hashPin(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useStaffProfiles() {
  return useQuery({
    queryKey: ["staff_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        // pin is intentionally excluded — managers must not see raw/hashed PINs after creation
        .select("id, location_id, first_name, last_name, role, status, last_used_at, archived_at, created_at")
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as StaffProfile[];
    },
  });
}

export function useSaveStaffProfile() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (sp: Partial<StaffProfile> & { id?: string; rawPin?: string }) => {
      // Hash the PIN if a new one was provided; otherwise leave it unchanged (upsert won't
      // touch the column if we omit it, but Supabase upsert sends all fields, so we must
      // only include pin when it's being explicitly set).
      const payload: Record<string, any> = {
        id: sp.id || undefined,
        organization_id: teamMember!.organization_id,
        location_id: sp.location_id ?? null,
        first_name: sp.first_name,
        last_name: sp.last_name,
        role: sp.role,
        status: sp.status ?? "active",
      };

      if (sp.rawPin) {
        payload.pin = await hashPin(sp.rawPin);
      } else if (!sp.id) {
        // New staff member requires a PIN
        throw new Error("PIN is required for new staff members.");
      }

      const { error } = await supabase.from("staff_profiles").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_profiles"] }),
  });
}

export function useArchiveStaffProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("staff_profiles")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_profiles"] }),
  });
}

export function useRestoreStaffProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("staff_profiles")
        .update({ status: "active", archived_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_profiles"] }),
  });
}

export function useDeleteStaffProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_profiles"] }),
  });
}
