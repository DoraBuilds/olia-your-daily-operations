/**
 * plan-features.ts
 * Single source of truth for what each plan can access.
 * Edit this file to change tier limits — nothing else needs changing.
 *
 * Stripe Price IDs are optional env vars read by src/lib/runtime-config.ts.
 * Set them in .env.local (see .env.example for all required keys):
 *   VITE_STRIPE_PRICE_STARTER_MONTHLY
 *   VITE_STRIPE_PRICE_STARTER_ANNUAL
 *   VITE_STRIPE_PRICE_GROWTH_MONTHLY
 *   VITE_STRIPE_PRICE_GROWTH_ANNUAL
 *
 * Enterprise is sales-led — no Stripe checkout, no price ID needed.
 * Server-side secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) must be
 * set in Supabase Edge Function secrets, not in .env files.
 */

export type Plan = "starter" | "growth" | "enterprise";
export type PlanStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

export interface PlanFeatures {
  maxLocations: number;   // -1 = unlimited
  maxStaff: number;       // -1 = unlimited
  maxChecklists: number;  // -1 = unlimited
  aiBuilder: boolean;
  fileConvert: boolean;
  advancedReporting: boolean;
  exportPdf: boolean;
  exportCsv: boolean;
  multiLocation: boolean;
  prioritySupport: boolean;
}

// ─── Feature limits per plan ────────────────────────────────────────────────
// Matches the check_plan_limit() DB function in 20260312000002_server_permissions.sql

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  starter: {
    maxLocations: 1,
    maxStaff: 15,
    maxChecklists: 10,
    aiBuilder: false,
    fileConvert: false,
    advancedReporting: false,
    exportPdf: true,
    exportCsv: false,
    multiLocation: false,
    prioritySupport: false,
  },
  growth: {
    maxLocations: 10,
    maxStaff: 200,
    maxChecklists: -1,
    aiBuilder: true,
    fileConvert: true,
    advancedReporting: true,
    exportPdf: true,
    exportCsv: true,
    multiLocation: true,
    prioritySupport: false,
  },
  enterprise: {
    maxLocations: -1,
    maxStaff: -1,
    maxChecklists: -1,
    aiBuilder: true,
    fileConvert: true,
    advancedReporting: true,
    exportPdf: true,
    exportCsv: true,
    multiLocation: true,
    prioritySupport: true,
  },
};

// ─── Display labels ──────────────────────────────────────────────────────────

export const PLAN_LABELS: Record<Plan, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

export const PLAN_PRICES: Record<Plan, { monthly: number; annual: number; currency: string }> = {
  starter:    { monthly: 49,  annual: 470,  currency: "€" },
  growth:     { monthly: 99,  annual: 950,  currency: "€" },
  enterprise: { monthly: 199, annual: 1910, currency: "€" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function limitLabel(val: number): string {
  return val === -1 ? "Unlimited" : String(val);
}
