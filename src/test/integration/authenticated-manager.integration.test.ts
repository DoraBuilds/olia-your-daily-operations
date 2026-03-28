import { afterEach, describe, expect, it } from "vitest";
import {
  createServiceRoleClient,
  deleteOrganization,
  seedManagerScenario,
  signInAsManager,
} from "./local-supabase";

const service = createServiceRoleClient();
const createdOrganizations: string[] = [];

afterEach(async () => {
  while (createdOrganizations.length > 0) {
    const organizationId = createdOrganizations.pop();
    if (organizationId) {
      await deleteOrganization(service, organizationId);
    }
  }
});

describe.sequential("local Supabase authenticated manager contracts", () => {
  it("authenticated managers only read their own organization's locations", async () => {
    const own = await seedManagerScenario(service);
    const other = await seedManagerScenario(service);
    createdOrganizations.push(own.organizationId, other.organizationId);

    const client = await signInAsManager(own.email, own.password);
    const { data, error } = await client.from("locations").select("id, name").order("name");

    expect(error).toBeNull();
    expect(data?.map((row) => row.id)).toContain(own.locationId);
    expect(data?.map((row) => row.id)).not.toContain(other.locationId);
  });

  it("authenticated managers can insert a location inside their own organization", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);

    const client = await signInAsManager(seeded.email, seeded.password);
    const locationName = `Inserted Location ${seeded.organizationId.slice(0, 6)}`;

    const { error: insertError } = await client.from("locations").insert({
      organization_id: seeded.organizationId,
      name: locationName,
      address: "Gran Via 10",
      contact_email: "new-location@example.com",
      contact_phone: "+34 600 000 002",
      trading_hours: "{\"mon\":{\"open\":true,\"start\":\"10:00\",\"end\":\"20:00\"}}",
      archive_threshold_days: 45,
    });

    expect(insertError).toBeNull();

    const { data, error: selectError } = await client
      .from("locations")
      .select("id, name, organization_id")
      .eq("name", locationName)
      .maybeSingle();

    expect(selectError).toBeNull();
    expect(data).toEqual(
      expect.objectContaining({
        name: locationName,
        organization_id: seeded.organizationId,
      }),
    );
  });
});
