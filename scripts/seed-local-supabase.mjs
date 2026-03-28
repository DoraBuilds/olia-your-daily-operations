import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.API_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing local Supabase URL. Run this through scripts/run-local-supabase-integration.mjs.");
}

if (!serviceRoleKey) {
  throw new Error("Missing local Supabase service role key. Run this through scripts/run-local-supabase-integration.mjs.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const STAFF_ID = "33333333-3333-4333-8333-333333333333";
const CHECKLIST_ID = "44444444-4444-4444-8444-444444444444";
const PIN = "1234";
const HASHED_PIN = crypto.createHash("sha256").update(PIN).digest("hex");

async function seed() {
  await supabase.from("staff_profiles").delete().eq("id", STAFF_ID);
  await supabase.from("locations").delete().eq("id", LOCATION_ID);
  await supabase.from("organizations").delete().eq("id", ORG_ID);

  const { error: orgError } = await supabase.from("organizations").insert({
    id: ORG_ID,
    name: "Integration Test Organisation",
    plan: "starter",
    plan_status: "active",
  });
  if (orgError) throw orgError;

  const { error: locationError } = await supabase.from("locations").insert({
    id: LOCATION_ID,
    organization_id: ORG_ID,
    name: "Integration Kitchen",
    address: "1 Test Street",
    archive_threshold_days: 90,
  });
  if (locationError) throw locationError;

  const { error: staffError } = await supabase.from("staff_profiles").insert({
    id: STAFF_ID,
    organization_id: ORG_ID,
    location_id: LOCATION_ID,
    first_name: "Ada",
    last_name: "Lovelace",
    role: "Chef",
    status: "active",
    pin: HASHED_PIN,
  });
  if (staffError) throw staffError;

  const { error: checklistError } = await supabase.from("checklists").insert({
    id: CHECKLIST_ID,
    organization_id: ORG_ID,
    location_id: LOCATION_ID,
    location_ids: [LOCATION_ID],
    title: "Integration Kitchen Checklist",
    questions_count: 1,
    time_of_day: "morning",
    due_time: "09:00",
    visibility_from: "08:00",
    visibility_until: "10:00",
    sections: [],
  });
  if (checklistError) throw checklistError;

  console.log("Seeded local Supabase integration data.");
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
