import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface KioskDevice {
  id: string;
  organization_id: string;
  location_id: string;
  label: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
  /** One-time code a tablet pairs with (Login -> Kiosk, #861). Kept after use so it can still be shown as "used". Null for devices set up before codes existed. */
  pairing_code: string | null;
  /** Null = created but no tablet has used the code yet. */
  paired_at: string | null;
}

// Revoked devices are terminal (no un-revoke UI) so the fleet view only
// ever needs the active set — filtering them out here keeps every caller
// from having to re-derive "active" from revoked_at.
export function useKioskDevices() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["kiosk_devices", teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kiosk_devices")
        .select("id, organization_id, location_id, label, last_seen_at, revoked_at, created_at, pairing_code, paired_at")
        .is("revoked_at", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as KioskDevice[];
    },
    enabled: !!teamMember?.organization_id,
    // The app-wide default staleTime is 5 minutes (query-client.ts), which is
    // wrong for this query specifically: an owner's most common path is
    // "pair a tablet, then check here that it shows as paired." Without
    // staleTime: 0, a cached "Waiting for device" would keep showing for up
    // to 5 minutes on remount, looking like pairing silently failed.
    staleTime: 0,
    // Keeps "last seen" fresh while an owner has the Kiosks tab open,
    // without needing a realtime subscription for what's a low-stakes,
    // glanceable status.
    refetchInterval: 30000,
  });
}

export function useRevokeKioskDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const { error } = await supabase.rpc("revoke_kiosk_device", { p_device_id: deviceId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kiosk_devices"] }),
  });
}

// Owner-only (#861): creates a kiosk for a location with a fresh one-time
// pairing code. Nothing is paired yet — that happens on the tablet itself.
export function useCreateKioskDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId, label }: { locationId: string; label: string }) => {
      const { data, error } = await supabase.rpc("create_kiosk_device", { p_location_id: locationId, p_label: label });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) throw new Error("No device returned");
      return row as { device_id: string; label: string; pairing_code: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kiosk_devices"] }),
  });
}

// Owner-only (#861): issues a new code and disconnects whichever tablet is
// currently paired (its device token is rotated server-side).
export function useRegenerateKioskCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const { data, error } = await supabase.rpc("regenerate_kiosk_pairing_code", { p_device_id: deviceId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kiosk_devices"] }),
  });
}
