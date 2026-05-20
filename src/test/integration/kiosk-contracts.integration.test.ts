import { afterEach, describe, expect, it } from "vitest";
import {
  createAnonClient,
  createServiceRoleClient,
  deleteAuthUser,
  deleteOrganization,
  seedKioskScenario,
} from "./local-supabase";

const service = createServiceRoleClient();
const anon = createAnonClient();
const createdOrganizations: string[] = [];
const createdAuthUsers: string[] = [];

afterEach(async () => {
  while (createdOrganizations.length > 0) {
    const organizationId = createdOrganizations.pop();
    if (organizationId) {
      await deleteOrganization(service, organizationId);
    }
  }
  while (createdAuthUsers.length > 0) {
    const userId = createdAuthUsers.pop();
    if (userId) {
      await deleteAuthUser(service, userId);
    }
  }
});

describe.sequential("local Supabase kiosk contracts", () => {
  it("anon can read seeded locations for kiosk setup", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { data, error } = await anon
      .from("locations")
      .select("id, name")
      .eq("id", seeded.locationId);

    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({
        id: seeded.locationId,
        name: expect.stringContaining("Integration Location"),
      }),
    ]);
  });

  it("get_kiosk_checklists returns location-specific and all-location checklists in due-time order", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { data, error } = await anon.rpc("get_kiosk_checklists", {
      p_location_id: seeded.locationId,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data?.map((row) => row.id)).toEqual([
      seeded.locationChecklistId,
      seeded.allLocationsChecklistId,
    ]);
    expect(data?.map((row) => row.due_time)).toEqual(["09:00", "10:00"]);
  });

  it("validate_staff_pin prefers an exact location match over an all-locations fallback", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { data, error } = await anon.rpc("validate_staff_pin", {
      p_pin: "2468",
      p_location_id: seeded.locationId,
    });

    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({
        id: seeded.locationSpecificStaffId,
        first_name: "Local",
        last_name: "Staff",
      }),
    ]);
  });

  // ── validate_admin_pin ────────────────────────────────────────────────────

  it("validate_admin_pin returns the team member for a correct bcrypt PIN", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { data, error } = await anon.rpc("validate_admin_pin", {
      p_pin: seeded.adminPin,
      p_location_id: seeded.locationId,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      id: seeded.teamMemberId,
      name: "Integration Admin",
      role: "Owner",
    });
  });

  it("validate_admin_pin returns empty for a wrong PIN", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { data, error } = await anon.rpc("validate_admin_pin", {
      p_pin: "0000",
      p_location_id: seeded.locationId,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // ── submit_kiosk_log ─────────────────────────────────────────────────────

  it("submit_kiosk_log succeeds with null staff_profile_id (admin-authenticated submission)", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { error } = await anon.rpc("submit_kiosk_log", {
      p_location_id: seeded.locationId,
      p_checklist_id: seeded.locationChecklistId,
      p_staff_profile_id: null,
      p_score: 100,
      p_answers: [{ label: "Notes", answer: "All good" }],
      p_checklist_title: "Location Checklist",
      p_completed_by: "Integration Admin",
      p_started_at: new Date().toISOString(),
    });

    expect(error).toBeNull();
  });

  it("submit_kiosk_log succeeds with a valid staff_profile_id", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { error } = await anon.rpc("submit_kiosk_log", {
      p_location_id: seeded.locationId,
      p_checklist_id: seeded.locationChecklistId,
      p_staff_profile_id: seeded.locationSpecificStaffId,
      p_score: 80,
      p_answers: [{ label: "Notes", answer: "Done" }],
      p_checklist_title: "Location Checklist",
      p_completed_by: "Local Staff",
      p_started_at: new Date().toISOString(),
    });

    expect(error).toBeNull();
  });

  it("submit_kiosk_log rejects a non-existent staff_profile_id", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { error } = await anon.rpc("submit_kiosk_log", {
      p_location_id: seeded.locationId,
      p_checklist_id: seeded.locationChecklistId,
      p_staff_profile_id: "00000000-0000-4000-8000-000000000000",
      p_score: 90,
      p_answers: [{ label: "Notes", answer: "Done" }],
      p_checklist_title: "Location Checklist",
      p_completed_by: "Ghost",
      p_started_at: new Date().toISOString(),
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("staff_profile_id");
  });

  it("submit_kiosk_log persists the log and it appears in checklist_logs", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.teamMemberId);

    const { error } = await anon.rpc("submit_kiosk_log", {
      p_location_id: seeded.locationId,
      p_checklist_id: seeded.locationChecklistId,
      p_staff_profile_id: null,
      p_score: 75,
      p_answers: [{ label: "Notes", answer: "Verified" }],
      p_checklist_title: "Location Checklist",
      p_completed_by: "Integration Admin",
      p_started_at: new Date().toISOString(),
    });
    expect(error).toBeNull();

    const { data, error: readError } = await service
      .from("checklist_logs")
      .select("score, completed_by, staff_profile_id")
      .eq("checklist_id", seeded.locationChecklistId)
      .order("created_at", { ascending: false })
      .limit(1);

    expect(readError).toBeNull();
    expect(data?.[0]).toMatchObject({
      score: 75,
      completed_by: "Integration Admin",
      staff_profile_id: null,
    });
  });
});
