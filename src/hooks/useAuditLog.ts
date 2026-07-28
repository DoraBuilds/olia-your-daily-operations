import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
  actor_name: string | null;
}

export function useAuditLog() {
  const { teamMember } = useAuth();
  return useQuery({
    queryKey: ["audit_log", teamMember?.organization_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, entity_type, entity_id, details, created_at, performed_by:team_members(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        id: row.id as string,
        action: row.action as string,
        entity_type: (row.entity_type ?? null) as string | null,
        entity_id: (row.entity_id ?? null) as string | null,
        details: (row.details ?? null) as Record<string, any> | null,
        created_at: row.created_at as string,
        actor_name: (row.performed_by?.name ?? null) as string | null,
      })) as AuditLogRow[];
    },
    enabled: !!teamMember?.organization_id,
  });
}

/** Fire-and-forget audit write. Never throws — failures are silent by design. */
export function writeAuditLog(
  entry: { action: string; entity_type: string; entity_id?: string | null; details?: Record<string, any> },
  member: { id: string; organization_id: string },
) {
  try {
    void supabase.from("audit_log").insert({
      organization_id: member.organization_id,
      performed_by: member.id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      details: entry.details ?? null,
    });
  } catch { /* audit writes are non-critical and must not break any caller */ }
}
