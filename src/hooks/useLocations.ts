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
      const { error } = await supabase.from("locations").upsert({
        id: loc.id || undefined,
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
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}
