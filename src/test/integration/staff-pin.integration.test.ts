import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { supabase } from "@/lib/supabase";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const STAFF_ID = "33333333-3333-4333-8333-333333333333";
const CHECKLIST_ID = "44444444-4444-4444-8444-444444444444";
const LOG_ID = "55555555-5555-4555-8555-555555555555";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing local Supabase integration env. Use scripts/run-local-supabase-integration.mjs.");
}

const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe("local Supabase integration", () => {
  it("validates the kiosk staff PIN through the real RPC", async () => {
    const { data, error } = await supabase.rpc("validate_staff_pin", {
      p_pin: "1234",
      p_location_id: LOCATION_ID,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
      role: "Chef",
    });
  });

  it("returns kiosk checklists for the seeded location through the real RPC", async () => {
    const { data, error } = await supabase.rpc("get_kiosk_checklists", {
      p_location_id: LOCATION_ID,
    });

    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CHECKLIST_ID,
          title: "Integration Kitchen Checklist",
          location_id: LOCATION_ID,
        }),
      ])
    );
  });

  it("persists a checklist log through the local anon insert policy", async () => {
    const payload = {
      id: LOG_ID,
      organization_id: "11111111-1111-4111-8111-111111111111",
      checklist_id: CHECKLIST_ID,
      checklist_title: "Integration Kitchen Checklist",
      completed_by: "Ada Lovelace",
      staff_profile_id: STAFF_ID,
      score: 100,
      type: "opening",
      answers: [],
      location_id: LOCATION_ID,
    };

    const { error: insertError } = await supabase.from("checklist_logs").insert(payload);
    expect(insertError).toBeNull();

    const { data, error } = await serviceSupabase
      .from("checklist_logs")
      .select("id, organization_id, checklist_id, checklist_title, completed_by, staff_profile_id, score, type, location_id")
      .eq("id", LOG_ID)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: LOG_ID,
      organization_id: payload.organization_id,
      checklist_id: CHECKLIST_ID,
      checklist_title: "Integration Kitchen Checklist",
      completed_by: "Ada Lovelace",
      staff_profile_id: STAFF_ID,
      score: 100,
      type: "opening",
      location_id: LOCATION_ID,
    });
  });

  it("rejects an incorrect PIN", async () => {
    const { data, error } = await supabase.rpc("validate_staff_pin", {
      p_pin: "9999",
      p_location_id: LOCATION_ID,
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
