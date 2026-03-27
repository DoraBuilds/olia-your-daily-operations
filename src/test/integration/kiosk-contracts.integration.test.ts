import { afterEach, describe, expect, it } from "vitest";
import {
  createAnonClient,
  createServiceRoleClient,
  deleteOrganization,
  seedKioskScenario,
} from "./local-supabase";

const service = createServiceRoleClient();
const anon = createAnonClient();
const createdOrganizations: string[] = [];

afterEach(async () => {
  while (createdOrganizations.length > 0) {
    const organizationId = createdOrganizations.pop();
    if (organizationId) {
      await deleteOrganization(service, organizationId);
    }
  }
});

describe.sequential("local Supabase kiosk contracts", () => {
  it("anon can read seeded locations for kiosk setup", async () => {
    const seeded = await seedKioskScenario(service);
    createdOrganizations.push(seeded.organizationId);

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
});
