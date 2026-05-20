import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createAnonClient,
  createServiceRoleClient,
  deleteAuthUser,
  deleteOrganization,
  seedManagerScenario,
  signInAsManager,
} from "./local-supabase";

const service = createServiceRoleClient();
const anon = createAnonClient();
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

// ── checklist_logs RLS ────────────────────────────────────────────────────────

describe.sequential("checklist_logs RLS contracts", () => {
  it("manager can read their own org's checklist logs", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    // Seed a log via service role
    const checklistId = randomUUID();
    await service.from("checklists").insert({
      id: checklistId,
      organization_id: seeded.organizationId,
      title: "Morning Open",
      sections: [],
      time_of_day: "anytime",
    });
    await service.from("checklist_logs").insert({
      organization_id: seeded.organizationId,
      checklist_id: checklistId,
      checklist_title: "Morning Open",
      completed_by: "Staff Member",
      location_id: seeded.locationId,
      score: 90,
      answers: [],
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("checklist_logs")
      .select("checklist_title, score, organization_id")
      .eq("organization_id", seeded.organizationId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      checklist_title: "Morning Open",
      score: 90,
      organization_id: seeded.organizationId,
    });
  });

  it("manager cannot read another org's checklist logs", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    const checklistId = randomUUID();
    await service.from("checklists").insert({
      id: checklistId,
      organization_id: seededB.organizationId,
      title: "Org B Log",
      sections: [],
      time_of_day: "anytime",
    });
    await service.from("checklist_logs").insert({
      organization_id: seededB.organizationId,
      checklist_id: checklistId,
      checklist_title: "Org B Log",
      completed_by: "Org B Staff",
      score: 80,
      answers: [],
    });

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data, error } = await clientA
      .from("checklist_logs")
      .select("checklist_title");

    expect(error).toBeNull();
    const titles = data?.map((r) => r.checklist_title) ?? [];
    expect(titles).not.toContain("Org B Log");
  });

  it("logs can be filtered by location_id", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const otherLocationId = randomUUID();
    await service.from("locations").insert({
      id: otherLocationId,
      organization_id: seeded.organizationId,
      name: "Second Location",
      address: "Calle Dos",
      contact_email: "b@example.com",
      contact_phone: "+34 600 000 002",
      trading_hours: "{\"mon\":{\"open\":true,\"start\":\"09:00\",\"end\":\"21:00\"}}",
      archive_threshold_days: 60,
    });

    const checklistId = randomUUID();
    await service.from("checklists").insert({
      id: checklistId,
      organization_id: seeded.organizationId,
      title: "Shared CL",
      sections: [],
      time_of_day: "anytime",
    });

    await service.from("checklist_logs").insert([
      {
        organization_id: seeded.organizationId,
        checklist_id: checklistId,
        checklist_title: "Log at Location 1",
        completed_by: "A",
        location_id: seeded.locationId,
        score: 100,
        answers: [],
      },
      {
        organization_id: seeded.organizationId,
        checklist_id: checklistId,
        checklist_title: "Log at Location 2",
        completed_by: "B",
        location_id: otherLocationId,
        score: 70,
        answers: [],
      },
    ]);

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("checklist_logs")
      .select("checklist_title")
      .eq("location_id", seeded.locationId);

    expect(error).toBeNull();
    const titles = data?.map((r) => r.checklist_title) ?? [];
    expect(titles).toContain("Log at Location 1");
    expect(titles).not.toContain("Log at Location 2");
  });

  it("logs can be filtered by date range", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const checklistId = randomUUID();
    await service.from("checklists").insert({
      id: checklistId,
      organization_id: seeded.organizationId,
      title: "Date Range CL",
      sections: [],
      time_of_day: "anytime",
    });
    await service.from("checklist_logs").insert({
      organization_id: seeded.organizationId,
      checklist_id: checklistId,
      checklist_title: "Recent Log",
      completed_by: "Staff",
      score: 85,
      answers: [],
    });

    const client = await signInAsManager(seeded.email, seeded.password);

    // Filter from now – a future upper bound should include the just-inserted log
    const from = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    const to = new Date(Date.now() + 60_000).toISOString();   // 1 min ahead

    const { data, error } = await client
      .from("checklist_logs")
      .select("checklist_title")
      .gte("created_at", from)
      .lte("created_at", to);

    expect(error).toBeNull();
    const titles = data?.map((r) => r.checklist_title) ?? [];
    expect(titles).toContain("Recent Log");
  });

  it("manager can delete their own org's checklist log", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const checklistId = randomUUID();
    await service.from("checklists").insert({
      id: checklistId,
      organization_id: seeded.organizationId,
      title: "Delete CL",
      sections: [],
      time_of_day: "anytime",
    });
    const logId = randomUUID();
    await service.from("checklist_logs").insert({
      id: logId,
      organization_id: seeded.organizationId,
      checklist_id: checklistId,
      checklist_title: "Delete CL",
      completed_by: "Staff",
      score: 75,
      answers: [],
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error } = await client.from("checklist_logs").delete().eq("id", logId);
    expect(error).toBeNull();

    const { data: remaining } = await client.from("checklist_logs").select("id").eq("id", logId);
    expect(remaining).toHaveLength(0);
  });
});

// ── actions RLS ───────────────────────────────────────────────────────────────

describe.sequential("actions RLS contracts", () => {
  it("manager can create and read their own org's actions", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error: insertError } = await client.from("actions").insert({
      organization_id: seeded.organizationId,
      title: "Fix broken shelf",
      status: "open",
    });
    expect(insertError).toBeNull();

    const { data, error } = await client
      .from("actions")
      .select("title, status, organization_id")
      .eq("organization_id", seeded.organizationId);

    expect(error).toBeNull();
    expect(data?.map((a) => a.title)).toContain("Fix broken shelf");
  });

  it("manager cannot read another org's actions", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    await service.from("actions").insert({
      organization_id: seededB.organizationId,
      title: "Org B Secret Action",
      status: "open",
    });

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data, error } = await clientA.from("actions").select("title");

    expect(error).toBeNull();
    expect(data?.map((a) => a.title)).not.toContain("Org B Secret Action");
  });

  it("manager can update the status of their own action", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const actionId = randomUUID();
    await service.from("actions").insert({
      id: actionId,
      organization_id: seeded.organizationId,
      title: "Restock napkins",
      status: "open",
    });

    const { error } = await client
      .from("actions")
      .update({ status: "resolved" })
      .eq("id", actionId);
    expect(error).toBeNull();

    const { data } = await client.from("actions").select("status").eq("id", actionId);
    expect(data?.[0]?.status).toBe("resolved");
  });

  it("manager can delete their own action", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const actionId = randomUUID();
    await service.from("actions").insert({
      id: actionId,
      organization_id: seeded.organizationId,
      title: "Clean fryer",
      status: "open",
    });

    const { error } = await client.from("actions").delete().eq("id", actionId);
    expect(error).toBeNull();

    const { data } = await client.from("actions").select("id").eq("id", actionId);
    expect(data).toHaveLength(0);
  });
});

// ── alerts RLS ────────────────────────────────────────────────────────────────

describe.sequential("alerts RLS contracts", () => {
  it("manager can read their own org's active alerts", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    await service.from("alerts").insert({
      organization_id: seeded.organizationId,
      type: "warn",
      message: "Temperature alert",
      source: "kiosk",
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("alerts")
      .select("message, type")
      .is("dismissed_at", null);

    expect(error).toBeNull();
    const messages = data?.map((a) => a.message) ?? [];
    expect(messages).toContain("Temperature alert");
  });

  it("manager cannot read another org's alerts", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    await service.from("alerts").insert({
      organization_id: seededB.organizationId,
      type: "error",
      message: "Org B private alert",
      source: "system",
    });

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data } = await clientA.from("alerts").select("message");
    expect(data?.map((a) => a.message)).not.toContain("Org B private alert");
  });

  it("manager can dismiss an alert by setting dismissed_at", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const alertId = randomUUID();
    await service.from("alerts").insert({
      id: alertId,
      organization_id: seeded.organizationId,
      type: "info",
      message: "Routine check done",
      source: "kiosk",
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error } = await client
      .from("alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", alertId);
    expect(error).toBeNull();

    // Dismissed alert should not appear in the active feed
    const { data } = await client
      .from("alerts")
      .select("id")
      .eq("id", alertId)
      .is("dismissed_at", null);
    expect(data).toHaveLength(0);
  });
});

// ── insert_kiosk_alert RPC ────────────────────────────────────────────────────

describe.sequential("insert_kiosk_alert RPC contracts", () => {
  it("anon can insert an alert via a valid location and it appears in the org feed", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const { error } = await anon.rpc("insert_kiosk_alert", {
      p_location_id: seeded.locationId,
      p_message: "Fridge door left open",
      p_type: "warn",
      p_area: "Kitchen",
    });
    expect(error).toBeNull();

    // Verify the alert was stored under the correct org
    const { data } = await service
      .from("alerts")
      .select("message, type, source, organization_id")
      .eq("organization_id", seeded.organizationId)
      .eq("message", "Fridge door left open");

    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      message: "Fridge door left open",
      type: "warn",
      source: "kiosk",
      organization_id: seeded.organizationId,
    });
  });

  it("insert_kiosk_alert rejects an unknown location_id", async () => {
    const { error } = await anon.rpc("insert_kiosk_alert", {
      p_location_id: "00000000-0000-4000-8000-000000000000",
      p_message: "Test alert",
      p_type: "info",
      p_area: null,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not found/i);
  });

  it("insert_kiosk_alert rejects an invalid type", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const { error } = await anon.rpc("insert_kiosk_alert", {
      p_location_id: seeded.locationId,
      p_message: "Test alert",
      p_type: "critical",
      p_area: null,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/invalid type/i);
  });

  it("insert_kiosk_alert rejects an empty message", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const { error } = await anon.rpc("insert_kiosk_alert", {
      p_location_id: seeded.locationId,
      p_message: "   ",
      p_type: "info",
      p_area: null,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/empty/i);
  });

  it("insert_kiosk_alert rejects a message exceeding 500 characters", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const { error } = await anon.rpc("insert_kiosk_alert", {
      p_location_id: seeded.locationId,
      p_message: "x".repeat(501),
      p_type: "error",
      p_area: null,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/500/);
  });

  it("insert_kiosk_alert resolves organization_id from the location (cannot be spoofed)", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    // Insert using org A's location — alert must land in org A, not B
    const { error } = await anon.rpc("insert_kiosk_alert", {
      p_location_id: seededA.locationId,
      p_message: "Org scoping check",
      p_type: "info",
      p_area: null,
    });
    expect(error).toBeNull();

    const { data: orgBAlerts } = await service
      .from("alerts")
      .select("message")
      .eq("organization_id", seededB.organizationId)
      .eq("message", "Org scoping check");

    expect(orgBAlerts).toHaveLength(0);
  });
});
