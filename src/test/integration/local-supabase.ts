import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type IntegrationEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

type SeededKioskScenario = {
  organizationId: string;
  locationId: string;
  allLocationsChecklistId: string;
  locationChecklistId: string;
  locationSpecificStaffId: string;
  allLocationsStaffId: string;
};

type ManagerPermissions = {
  create_edit_checklists: boolean;
  assign_checklists: boolean;
  manage_staff_profiles: boolean;
  view_reporting: boolean;
  edit_location_details: boolean;
  manage_alerts: boolean;
  export_data: boolean;
  override_inactivity_threshold: boolean;
};

type SeededManagerScenario = {
  organizationId: string;
  locationId: string;
  userId: string;
  email: string;
  password: string;
};

let cachedEnv: IntegrationEnv | null = null;

function requiredEnv(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required integration test env: ${name}`);
  }
  return value;
}

export function getIntegrationEnv(): IntegrationEnv {
  if (!cachedEnv) {
    cachedEnv = {
      apiUrl: requiredEnv("VITE_SUPABASE_URL"),
      anonKey: requiredEnv("VITE_SUPABASE_ANON_KEY"),
      serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    };
  }
  return cachedEnv;
}

function createTestClient(apiUrl: string, key: string): SupabaseClient {
  return createClient(apiUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createAnonClient(): SupabaseClient {
  const env = getIntegrationEnv();
  return createTestClient(env.apiUrl, env.anonKey);
}

export function createServiceRoleClient(): SupabaseClient {
  const env = getIntegrationEnv();
  return createTestClient(env.apiUrl, env.serviceRoleKey);
}

export function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

export async function deleteOrganization(service: SupabaseClient, organizationId: string) {
  const { error } = await service.from("organizations").delete().eq("id", organizationId);
  if (error) throw error;
}

function defaultManagerPermissions(): ManagerPermissions {
  return {
    create_edit_checklists: true,
    assign_checklists: true,
    manage_staff_profiles: true,
    view_reporting: true,
    edit_location_details: true,
    manage_alerts: true,
    export_data: true,
    override_inactivity_threshold: true,
  };
}

export async function seedKioskScenario(service: SupabaseClient): Promise<SeededKioskScenario> {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const allLocationsChecklistId = randomUUID();
  const locationChecklistId = randomUUID();
  const locationSpecificStaffId = randomUUID();
  const allLocationsStaffId = randomUUID();

  const { error: organizationError } = await service.from("organizations").insert({
    id: organizationId,
    name: `Integration Org ${organizationId.slice(0, 8)}`,
    plan: "growth",
    plan_status: "trialing",
  });
  if (organizationError) throw organizationError;

  const { error: locationError } = await service.from("locations").insert({
    id: locationId,
    organization_id: organizationId,
    name: `Integration Location ${locationId.slice(0, 8)}`,
    address: "14 Rue de la Paix",
    contact_email: "ops@example.com",
    contact_phone: "+34 600 000 000",
    trading_hours: "{\"mon\":{\"open\":true,\"start\":\"08:00\",\"end\":\"22:00\"}}",
    archive_threshold_days: 90,
  });
  if (locationError) throw locationError;

  const sections = [
    {
      id: randomUUID(),
      title: "Opening",
      questions: [
        {
          id: randomUUID(),
          type: "text",
          label: "Notes",
          required: false,
        },
      ],
    },
  ];

  const { error: checklistError } = await service.from("checklists").insert([
    {
      id: allLocationsChecklistId,
      organization_id: organizationId,
      location_id: null,
      title: "All Locations Checklist",
      schedule: null,
      sections,
      time_of_day: "anytime",
      due_time: "10:00",
    },
    {
      id: locationChecklistId,
      organization_id: organizationId,
      location_id: locationId,
      title: "Location Checklist",
      schedule: null,
      sections,
      time_of_day: "anytime",
      due_time: "09:00",
    },
  ]);
  if (checklistError) throw checklistError;

  const sharedPinHash = hashPin("2468");
  const { error: staffError } = await service.from("staff_profiles").insert([
    {
      id: allLocationsStaffId,
      organization_id: organizationId,
      location_id: null,
      first_name: "Global",
      last_name: "Staff",
      role: "Waiter",
      status: "active",
      pin: sharedPinHash,
    },
    {
      id: locationSpecificStaffId,
      organization_id: organizationId,
      location_id: locationId,
      first_name: "Local",
      last_name: "Staff",
      role: "Manager",
      status: "active",
      pin: sharedPinHash,
    },
  ]);
  if (staffError) throw staffError;

  return {
    organizationId,
    locationId,
    allLocationsChecklistId,
    locationChecklistId,
    locationSpecificStaffId,
    allLocationsStaffId,
  };
}

export async function seedManagerScenario(service: SupabaseClient): Promise<SeededManagerScenario> {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const email = `integration-${organizationId.slice(0, 8)}@olia.test`;
  const password = "Password123!";
  const userId = randomUUID();

  const { error: organizationError } = await service.from("organizations").insert({
    id: organizationId,
    name: `Manager Org ${organizationId.slice(0, 8)}`,
    plan: "growth",
    plan_status: "trialing",
  });
  if (organizationError) throw organizationError;

  const { error: locationError } = await service.from("locations").insert({
    id: locationId,
    organization_id: organizationId,
    name: `Manager Location ${locationId.slice(0, 8)}`,
    address: "Calle Mayor 1",
    contact_email: "manager@example.com",
    contact_phone: "+34 600 000 001",
    trading_hours: "{\"mon\":{\"open\":true,\"start\":\"09:00\",\"end\":\"21:00\"}}",
    archive_threshold_days: 60,
  });
  if (locationError) throw locationError;

  const authClient = createAnonClient();
  const { data: authData, error: authError } = await authClient.auth.signUp({
    email,
    password,
    options: {
      data: { name: "Integration Manager" },
    },
  });
  if (authError) throw authError;
  const createdUserId = authData.user?.id;
  if (!createdUserId) {
    throw new Error("Supabase signUp did not return a user id for the integration manager.");
  }

  const { error: teamMemberError } = await service.from("team_members").insert({
    id: createdUserId,
    organization_id: organizationId,
    name: "Integration Manager",
    email,
    role: "Owner",
    location_ids: [locationId],
    permissions: defaultManagerPermissions(),
  });
  if (teamMemberError) throw teamMemberError;

  return {
    organizationId,
    locationId,
    userId: createdUserId,
    email,
    password,
  };
}

export async function signInAsManager(email: string, password: string): Promise<SupabaseClient> {
  const client = createAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}
