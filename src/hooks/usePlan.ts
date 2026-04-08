import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { PLAN_FEATURES, type Plan, type PlanFeatures, type PlanStatus } from "@/lib/plan-features";

interface OrgRecord {
  id: string;
  name: string;
  plan: Plan;
  plan_status: PlanStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  location_grace_period_ends_at: string | null;
  active_location_ids: string[] | null;
}

export function usePlan() {
  const { teamMember, user, loading: authLoading } = useAuth();

  const { data: fallbackOrganizationId, isLoading: fallbackOrgLoading } = useQuery({
    queryKey: ["team-member-organization", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("team_members")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return (data?.organization_id as string | null) ?? null;
    },
    enabled: !!user?.id && !authLoading && !teamMember?.organization_id,
  });

  const organizationId = teamMember?.organization_id ?? fallbackOrganizationId ?? null;

  const { data: org, isLoading: orgLoading, error: orgError } = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select(
          "id, name, plan, plan_status, stripe_customer_id, stripe_subscription_id, trial_ends_at, location_grace_period_ends_at, active_location_ids"
        )
        .eq("id", organizationId)
        .single();
      if (error) throw error;
      return data as OrgRecord;
    },
    enabled: !!organizationId,
  });

  const isLoading = authLoading || fallbackOrgLoading || (!!organizationId && orgLoading);
  const resolvedPlan = (org?.plan as Plan) ?? null;
  const billingUnavailable =
    !!user &&
    !isLoading &&
    (!!organizationId || !teamMember) &&
    (!resolvedPlan || !!orgError);

  const plan: Plan = resolvedPlan ?? "starter";
  const planStatus: PlanStatus = (org?.plan_status as PlanStatus) ?? "active";
  const features: PlanFeatures = PLAN_FEATURES[plan] ?? PLAN_FEATURES["starter"];
  const isActive =
    planStatus === "active" || planStatus === "trialing";

  /** Returns true if the current plan includes a given feature. */
  function can(feature: keyof PlanFeatures): boolean {
    if (!isActive) {
      // Even canceled accounts retain starter-level access
      return !!PLAN_FEATURES["starter"][feature];
    }
    return !!features[feature];
  }

  /** Returns true if usage (count) is within the plan's limit for a numeric feature. */
  function withinLimit(
    feature: "maxLocations" | "maxStaff" | "maxChecklists",
    count: number
  ): boolean {
    const limit = features[feature] as number;
    return limit === -1 || count < limit;
  }

  return {
    plan,
    resolvedPlan,
    planStatus,
    features,
    org,
    isLoading,
    organizationId,
    billingUnavailable,
    isActive,
    can,
    withinLimit,
    hasStripeSubscription: !!org?.stripe_subscription_id,
  };
}

export function useSaveActiveLocationsSelection() {
  const qc = useQueryClient();
  const { organizationId } = usePlan();

  return useMutation({
    mutationFn: async (locationIds: string[]) => {
      if (!organizationId) {
        throw new Error("Your billing organization could not be resolved.");
      }
      const { error } = await supabase
        .from("organizations")
        .update({ active_location_ids: locationIds })
        .eq("id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization", organizationId] });
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}
