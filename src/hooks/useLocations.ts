import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Location } from "@/lib/admin-repository";

export function useLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select(
          "id, name, address, contact_email, contact_phone, trading_hours, archive_threshold_days, lat, lng, place_id",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as Location[];
    },
  });
}

export function useSaveLocation() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (loc: Location) => {
      if (!teamMember) {
        throw new Error("Your account setup is not complete. Please refresh the page and try again.");
      }
      if (loc.id) {
        // Explicit UPDATE — do NOT include organization_id in the payload.
        //
        // The locations_update RLS policy uses only USING (no WITH CHECK), so
        // PostgreSQL promotes USING as the WITH CHECK expression. That means
        // it validates new_row.organization_id = current_org_id() after the
        // update. If we include organization_id in the payload and it differs
        // even slightly from what current_org_id() returns at query-time, the
        // WITH CHECK silently rejects the row (0 rows updated, no error).
        // Omitting organization_id from the UPDATE leaves the column unchanged,
        // so it always satisfies the promoted WITH CHECK.
        const updatePayload = {
          name: loc.name,
          address: loc.address ?? null,
          contact_email: loc.contact_email ?? null,
          contact_phone: loc.contact_phone ?? null,
          trading_hours: loc.trading_hours ?? null,
          archive_threshold_days: loc.archive_threshold_days ?? 90,
          lat: loc.lat ?? null,
          lng: loc.lng ?? null,
          place_id: loc.place_id ?? null,
        };
        // .select("id") makes PostgREST return the updated rows; an empty
        // array means 0 rows matched (RLS blocked or wrong id).
        const { data: updated, error } = await supabase
          .from("locations")
          .update(updatePayload)
          .eq("id", loc.id)
          .select("id");
        if (error) throw error;
        if (!updated || updated.length === 0) {
          throw new Error("Location update failed. Your session may have expired — please refresh the page and try again.");
        }
      } else {
        // INSERT — organization_id is required for the plan-limit RLS policy.
        const insertPayload = {
          organization_id: teamMember.organization_id,
          name: loc.name,
          address: loc.address ?? null,
          contact_email: loc.contact_email ?? null,
          contact_phone: loc.contact_phone ?? null,
          trading_hours: loc.trading_hours ?? null,
          archive_threshold_days: loc.archive_threshold_days ?? 90,
          lat: loc.lat ?? null,
          lng: loc.lng ?? null,
          place_id: loc.place_id ?? null,
        };
        const { error } = await supabase
          .from("locations")
          .insert(insertPayload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!teamMember) {
        throw new Error("Not authenticated. Please refresh and try again.");
      }
      // Use .select("id") so PostgREST returns the deleted row(s) as data.
      // An empty array = 0 rows deleted (either gone already or RLS silently blocked).
      // This is more reliable than { count: "exact" } which relies on Content-Range
      // header parsing and can return null in some PostgREST configurations.
      const { data: deleted, error } = await supabase
        .from("locations")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        throw new Error("Could not delete this location. It may have already been removed, or your session has expired — please refresh and try again.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}
