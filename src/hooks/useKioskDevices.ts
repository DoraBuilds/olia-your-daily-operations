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
        .select("id, organization_id, location_id, label, last_seen_at, revoked_at, created_at")
        .is("revoked_at", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as KioskDevice[];
    },
    enabled: !!teamMember?.organization_id,
    // The app-wide default staleTime is 5 minutes (query-client.ts), which is
    // wrong for this query specifically: an owner's most common path is
    // "launch a kiosk, then immediately flip to this tab to confirm it
    // worked." Without staleTime: 0, a Kiosks tab visited even once earlier
    // in the session (e.g. before any device existed) would keep serving
    // that cached empty result for up to 5 minutes on remount, looking like
    // the launch silently failed.
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
