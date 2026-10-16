import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ActiveStaffCount {
  location_id: string;
  location_name: string;
  active_staff: number;
}

export function useActiveStaffCounts() {
  return useQuery({
    queryKey: ["active-staff-counts"],
    queryFn: async (): Promise<ActiveStaffCount[]> => {
      const { data, error } = await supabase.rpc("get_active_staff_counts", { p_days: 30 });
      if (error) throw error;
      return (data ?? []) as ActiveStaffCount[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
