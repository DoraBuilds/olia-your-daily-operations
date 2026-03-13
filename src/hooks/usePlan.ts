import { useQuery } from "@tanstack/react-query";
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
}

export function usePlan() {
  const { teamMember } = useAuth();

  const { data: org, isLoading } = useQuery({
    queryKey: ["organization", teamMember?.organization_id],
    queryFn: async () => {
      if (!teamMember?.organization_id) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select(
          "id, name, plan, plan_status, stripe_customer_id, stripe_subscription_id, trial_ends_at"
        )
        .eq("id", teamMember.organization_id)
        .single();
      if (error) return null;
      return data as OrgRecord;
    },
    enabled: !!teamMember?.organization_id,
  });

  const plan: Plan = (org?.plan as Plan) ?? "starter";
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
    planStatus,
    features,
    org,
    isLoading,
    isActive,
    can,
    withinLimit,
    hasStripeSubscription: !!org?.stripe_subscription_id,
  };
}
