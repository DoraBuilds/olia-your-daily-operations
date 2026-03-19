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
      if (!teamMember) {
        throw new Error("Your account setup is not complete. Please refresh the page and try again.");
      }

      if (sp.id) {
        // ── Editing an existing profile: explicit UPDATE ────────────────────
        // DO NOT use upsert: the INSERT half of ON CONFLICT DO UPDATE requires
        // the NOT NULL `pin` column even when updating, causing a null violation.
        //
        // organization_id is intentionally OMITTED from updatePayload.
        // staff_profiles_update_permitted has only USING (no WITH CHECK), so
        // PostgreSQL promotes USING as the WITH CHECK expression and validates
        // new_row.organization_id = current_org_id(). Including organization_id
        // in the payload risks a WITH CHECK mismatch if teamMember.organization_id
        // (React state) differs from current_org_id() at query-time, causing a
        // silent 0-row update. Omitting it leaves the column unchanged so the
        // promoted check always passes.
        const updatePayload: Record<string, any> = {
          location_id: sp.location_id ?? null,
          first_name: sp.first_name,
          last_name: sp.last_name,
          role: sp.role,
          status: sp.status ?? "active",
        };
        // Only update pin when a new one was explicitly provided; otherwise
        // leave the existing hashed pin untouched.
        if (sp.rawPin) {
          updatePayload.pin = await hashPin(sp.rawPin);
        }
        const { data: updated, error } = await supabase
          .from("staff_profiles")
          .update(updatePayload)
          .eq("id", sp.id)
          .select("id");
        if (error) throw error;
        if (!updated || updated.length === 0) {
          throw new Error("Profile update failed — your session may have expired. Please refresh and try again.");
        }
      } else {
        // ── Creating a new profile: explicit INSERT ─────────────────────────
        if (!sp.rawPin) {
          throw new Error("PIN is required for new staff members.");
        }
        const insertPayload: Record<string, any> = {
          organization_id: teamMember.organization_id,
          location_id: sp.location_id ?? null,
          first_name: sp.first_name,
          last_name: sp.last_name,
          role: sp.role,
          status: sp.status ?? "active",
          pin: await hashPin(sp.rawPin),
        };
        const { error } = await supabase.from("staff_profiles").insert(insertPayload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_profiles"] }),
  });
}

export function useArchiveStaffProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Use .select("id") so we can detect the silent 0-row case (RLS blocked
      // or the profile was already archived / doesn't exist).
      const { data: updated, error } = await supabase
        .from("staff_profiles")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error("Could not archive this profile. Please refresh and try again.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_profiles"] }),
  });
}

export function useRestoreStaffProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: updated, error } = await supabase
        .from("staff_profiles")
        .update({ status: "active", archived_at: null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error("Could not restore this profile. Please refresh and try again.");
      }
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
