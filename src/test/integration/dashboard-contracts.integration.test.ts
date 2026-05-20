import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createServiceRoleClient,
  deleteAuthUser,
  deleteOrganization,
  seedManagerScenario,
  signInAsManager,
} from "./local-supabase";

const service = createServiceRoleClient();
const createdOrganizations: string[] = [];
const createdAuthUsers: string[] = [];

afterEach(async () => {
  while (createdOrganizations.length > 0) {
    const id = createdOrganizations.pop();
    if (id) await deleteOrganization(service, id);
  }
  while (createdAuthUsers.length > 0) {
    const id = createdAuthUsers.pop();
    if (id) await deleteAuthUser(service, id);
  }
});

// ── organizations RLS ─────────────────────────────────────────────────────────

describe.sequential("organizations RLS contracts", () => {
  it("manager can read their own org's plan and billing fields", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data, error } = await client
      .from("organizations")
      .select("id, name, plan, plan_status, stripe_customer_id, stripe_subscription_id, trial_ends_at, location_grace_period_ends_at, active_location_ids, departments")
      .eq("id", seeded.organizationId)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: seeded.organizationId,
      plan: "growth",
      plan_status: "trialing",
    });
  });

  it("manager cannot read another org's record", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data, error } = await clientA
      .from("organizations")
      .select("id")
      .eq("id", seededB.organizationId)
      .maybeSingle();

    // RLS silently returns null — no row, no error
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("manager can update active_location_ids on their own org", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data, error } = await client
      .from("organizations")
      .update({ active_location_ids: [seeded.locationId] })
      .eq("id", seeded.organizationId)
      .select("id, active_location_ids");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.active_location_ids).toContain(seeded.locationId);
  });

  it("manager cannot update another org's active_location_ids (RLS blocks silently)", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data, error } = await clientA
      .from("organizations")
      .update({ active_location_ids: [] })
      .eq("id", seededB.organizationId)
      .select("id");

    // RLS silently returns 0 rows updated — no error, just empty result
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("departments field can be read and updated", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const departments = [{ name: "Kitchen" }, { name: "Front of House" }];
    await service
      .from("organizations")
      .update({ departments })
      .eq("id", seeded.organizationId);

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("organizations")
      .select("departments")
      .eq("id", seeded.organizationId)
      .single();

    expect(error).toBeNull();
    expect(data?.departments).toEqual(departments);
  });
});

// ── locations READ contracts ───────────────────────────────────────────────────

describe.sequential("locations read contracts", () => {
  it("manager can read all locations with full column set", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data, error } = await client
      .from("locations")
      .select("id, organization_id, name, address, contact_email, contact_phone, trading_hours, archive_threshold_days, created_at, lat, lng, place_id")
      .eq("organization_id", seeded.organizationId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      id: seeded.locationId,
      name: expect.stringContaining("Manager Location"),
      address: "Calle Mayor 1",
      contact_email: "manager@example.com",
    });
    // Confirm nullable geo fields are present in the response shape
    expect(Object.keys(data?.[0] ?? {})).toContain("lat");
    expect(Object.keys(data?.[0] ?? {})).toContain("lng");
    expect(Object.keys(data?.[0] ?? {})).toContain("place_id");
  });

  it("manager cannot read locations from another org", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data, error } = await clientA
      .from("locations")
      .select("id, name");

    expect(error).toBeNull();
    const ids = data?.map((l) => l.id) ?? [];
    expect(ids).toContain(seededA.locationId);
    expect(ids).not.toContain(seededB.locationId);
  });

  it("locations are returned ordered by name", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    await service.from("locations").insert([
      {
        organization_id: seeded.organizationId,
        name: "Zebra Location",
        address: "Z Street",
        contact_email: "z@example.com",
        contact_phone: "+34 600 000 010",
        trading_hours: "{\"mon\":{\"open\":true,\"start\":\"09:00\",\"end\":\"21:00\"}}",
        archive_threshold_days: 60,
      },
      {
        organization_id: seeded.organizationId,
        name: "Alpha Location",
        address: "A Street",
        contact_email: "a@example.com",
        contact_phone: "+34 600 000 011",
        trading_hours: "{\"mon\":{\"open\":true,\"start\":\"09:00\",\"end\":\"21:00\"}}",
        archive_threshold_days: 60,
      },
    ]);

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("locations")
      .select("name")
      .eq("organization_id", seeded.organizationId)
      .order("name");

    expect(error).toBeNull();
    const names = data?.map((l) => l.name) ?? [];
    expect(names.indexOf("Alpha Location")).toBeLessThan(names.indexOf("Zebra Location"));
  });
});

// ── checklists READ contracts ─────────────────────────────────────────────────

describe.sequential("checklists read contracts", () => {
  it("manager can read all checklists with the full dashboard column set", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const checklistId = randomUUID();
    await service.from("checklists").insert({
      id: checklistId,
      organization_id: seeded.organizationId,
      title: "Full Column Checklist",
      location_id: seeded.locationId,
      location_ids: [seeded.locationId],
      start_date: "2026-01-01",
      schedule: { mon: true, tue: false, wed: true, thu: false, fri: true, sat: false, sun: false },
      sections: [{ id: randomUUID(), title: "Setup", questions: [] }],
      time_of_day: "morning",
      due_time: "09:00",
      visibility_from: "08:00",
      visibility_until: "11:00",
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("checklists")
      .select("id, organization_id, title, folder_id, location_id, location_ids, start_date, schedule, sections, time_of_day, due_time, visibility_from, visibility_until, created_at, updated_at")
      .eq("id", checklistId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      id: checklistId,
      title: "Full Column Checklist",
      location_id: seeded.locationId,
      time_of_day: "morning",
      due_time: "09:00",
      visibility_from: "08:00",
      visibility_until: "11:00",
    });
    expect(data?.[0]?.location_ids).toContain(seeded.locationId);
    expect(data?.[0]?.sections).toHaveLength(1);
  });

  it("manager cannot read another org's checklists", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    const checklistId = randomUUID();
    await service.from("checklists").insert({
      id: checklistId,
      organization_id: seededB.organizationId,
      title: "Org B Private Checklist",
      sections: [],
      time_of_day: "anytime",
    });

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data, error } = await clientA
      .from("checklists")
      .select("title");

    expect(error).toBeNull();
    expect(data?.map((c) => c.title)).not.toContain("Org B Private Checklist");
  });

  it("checklists are returned ordered by title", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    await service.from("checklists").insert([
      { organization_id: seeded.organizationId, title: "Zebra Check", sections: [], time_of_day: "anytime" },
      { organization_id: seeded.organizationId, title: "Alpha Check", sections: [], time_of_day: "anytime" },
      { organization_id: seeded.organizationId, title: "Mango Check", sections: [], time_of_day: "anytime" },
    ]);

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("checklists")
      .select("title")
      .eq("organization_id", seeded.organizationId)
      .order("title");

    expect(error).toBeNull();
    const titles = data?.map((c) => c.title) ?? [];
    expect(titles.indexOf("Alpha Check")).toBeLessThan(titles.indexOf("Mango Check"));
    expect(titles.indexOf("Mango Check")).toBeLessThan(titles.indexOf("Zebra Check"));
  });

  it("checklists can be filtered by location_id", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const otherLocationId = randomUUID();
    await service.from("locations").insert({
      id: otherLocationId,
      organization_id: seeded.organizationId,
      name: "Second Location",
      address: "Street 2",
      contact_email: "b@example.com",
      contact_phone: "+34 600 000 020",
      trading_hours: "{\"mon\":{\"open\":true,\"start\":\"09:00\",\"end\":\"21:00\"}}",
      archive_threshold_days: 60,
    });

    await service.from("checklists").insert([
      {
        organization_id: seeded.organizationId,
        title: "Location 1 CL",
        location_id: seeded.locationId,
        sections: [],
        time_of_day: "anytime",
      },
      {
        organization_id: seeded.organizationId,
        title: "All Locations CL",
        location_id: null,
        sections: [],
        time_of_day: "anytime",
      },
    ]);

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("checklists")
      .select("title")
      .eq("location_id", seeded.locationId);

    expect(error).toBeNull();
    const titles = data?.map((c) => c.title) ?? [];
    expect(titles).toContain("Location 1 CL");
    expect(titles).not.toContain("All Locations CL");
  });
});
