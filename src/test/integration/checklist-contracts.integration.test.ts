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

// ── save_checklist RPC ────────────────────────────────────────────────────────

describe.sequential("save_checklist RPC contracts", () => {
  it("authenticated manager can create a new checklist and the returned id is a UUID", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data, error } = await client.rpc("save_checklist", {
      p_id:              null,
      p_title:           "Morning Opening",
      p_folder_id:       null,
      p_location_id:     null,
      p_location_ids:    null,
      p_start_date:      null,
      p_schedule:        null,
      p_sections:        [{ id: randomUUID(), title: "Setup", questions: [] }],
      p_time_of_day:     "anytime",
      p_due_time:        "09:00",
      p_visibility_from: null,
      p_visibility_until: null,
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it("created checklist is visible when reading the checklists table", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data: created } = await client.rpc("save_checklist", {
      p_id: null, p_title: "Evening Close", p_folder_id: null,
      p_location_id: null, p_location_ids: null, p_start_date: null,
      p_schedule: null, p_sections: [], p_time_of_day: "anytime",
      p_due_time: "22:00", p_visibility_from: null, p_visibility_until: null,
    });

    const { data: rows, error: readError } = await client
      .from("checklists")
      .select("id, title, due_time, organization_id")
      .eq("id", (created as any).id);

    expect(readError).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      title: "Evening Close",
      due_time: "22:00",
      organization_id: seeded.organizationId,
    });
  });

  it("authenticated manager can update an existing checklist", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data: created } = await client.rpc("save_checklist", {
      p_id: null, p_title: "Original Title", p_folder_id: null,
      p_location_id: null, p_location_ids: null, p_start_date: null,
      p_schedule: null, p_sections: [], p_time_of_day: "anytime",
      p_due_time: null, p_visibility_from: null, p_visibility_until: null,
    });
    const checklistId = (created as any).id;

    const { error: updateError } = await client.rpc("save_checklist", {
      p_id: checklistId, p_title: "Updated Title", p_folder_id: null,
      p_location_id: null, p_location_ids: null, p_start_date: null,
      p_schedule: null, p_sections: [{ id: randomUUID(), title: "New Section", questions: [] }],
      p_time_of_day: "anytime", p_due_time: "14:00",
      p_visibility_from: null, p_visibility_until: null,
    });

    expect(updateError).toBeNull();

    const { data: rows } = await client.from("checklists").select("title, due_time").eq("id", checklistId);
    expect(rows?.[0]).toMatchObject({ title: "Updated Title", due_time: "14:00" });
  });

  it("save_checklist UPDATE rejects a checklist from a different organization", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    // Insert a checklist under org B directly via service role
    const foreignChecklistId = randomUUID();
    await service.from("checklists").insert({
      id: foreignChecklistId,
      organization_id: seededB.organizationId,
      title: "Org B Checklist",
      sections: [],
      time_of_day: "anytime",
    });

    // Try to update it as org A's manager
    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { error } = await clientA.rpc("save_checklist", {
      p_id: foreignChecklistId, p_title: "Hijacked", p_folder_id: null,
      p_location_id: null, p_location_ids: null, p_start_date: null,
      p_schedule: null, p_sections: [], p_time_of_day: "anytime",
      p_due_time: null, p_visibility_from: null, p_visibility_until: null,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not found|does not belong/i);
  });

  it("save_checklist INSERT is blocked once the starter plan checklist limit is reached", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    // Downgrade to starter (limit = 10)
    await service.from("organizations").update({ plan: "starter" }).eq("id", seeded.organizationId);

    // Fill up to the limit via service role
    await service.from("checklists").insert(
      Array.from({ length: 10 }, (_, i) => ({
        organization_id: seeded.organizationId,
        title: `Auto Checklist ${i + 1}`,
        sections: [],
        time_of_day: "anytime",
      })),
    );

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error } = await client.rpc("save_checklist", {
      p_id: null, p_title: "One Too Many", p_folder_id: null,
      p_location_id: null, p_location_ids: null, p_start_date: null,
      p_schedule: null, p_sections: [], p_time_of_day: "anytime",
      p_due_time: null, p_visibility_from: null, p_visibility_until: null,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/limit|plan/i);
  });

  it("unauthenticated caller cannot invoke save_checklist", async () => {
    const { createAnonClient } = await import("./local-supabase");
    const anon = createAnonClient();

    const { error } = await anon.rpc("save_checklist", {
      p_id: null, p_title: "Sneaky", p_folder_id: null,
      p_location_id: null, p_location_ids: null, p_start_date: null,
      p_schedule: null, p_sections: [], p_time_of_day: "anytime",
      p_due_time: null, p_visibility_from: null, p_visibility_until: null,
    });

    expect(error).not.toBeNull();
  });
});

// ── Checklist read & delete ───────────────────────────────────────────────────

describe.sequential("checklist read and delete contracts", () => {
  it("authenticated manager can read their own org's checklists but not another org's", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    // Seed one checklist per org
    await service.from("checklists").insert([
      { organization_id: seededA.organizationId, title: "Org A CL", sections: [], time_of_day: "anytime" },
      { organization_id: seededB.organizationId, title: "Org B CL", sections: [], time_of_day: "anytime" },
    ]);

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data, error } = await clientA.from("checklists").select("title, organization_id");

    expect(error).toBeNull();
    const titles = data?.map((r) => r.title) ?? [];
    expect(titles).toContain("Org A CL");
    expect(titles).not.toContain("Org B CL");
  });

  it("authenticated manager can delete their own checklist", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data: created } = await client.rpc("save_checklist", {
      p_id: null, p_title: "To Be Deleted", p_folder_id: null,
      p_location_id: null, p_location_ids: null, p_start_date: null,
      p_schedule: null, p_sections: [], p_time_of_day: "anytime",
      p_due_time: null, p_visibility_from: null, p_visibility_until: null,
    });
    const checklistId = (created as any).id;

    const { error: deleteError } = await client.from("checklists").delete().eq("id", checklistId);
    expect(deleteError).toBeNull();

    const { data: remaining } = await client.from("checklists").select("id").eq("id", checklistId);
    expect(remaining).toHaveLength(0);
  });
});

// ── Folder contracts ──────────────────────────────────────────────────────────

describe.sequential("folder contracts", () => {
  it("authenticated manager can create and read a folder", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error: insertError } = await client.from("folders").upsert({
      organization_id: seeded.organizationId,
      name: "Operations",
      parent_id: null,
      location_id: null,
    });
    expect(insertError).toBeNull();

    const { data, error: readError } = await client.from("folders").select("name").eq("organization_id", seeded.organizationId);
    expect(readError).toBeNull();
    expect(data?.map((f) => f.name)).toContain("Operations");
  });

  it("authenticated manager cannot read folders from another org", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    await service.from("folders").insert({
      organization_id: seededB.organizationId,
      name: "Secret Folder",
      parent_id: null,
      location_id: null,
    });

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data } = await clientA.from("folders").select("name");
    expect(data?.map((f) => f.name)).not.toContain("Secret Folder");
  });

  it("deleting a folder also removes its checklists from the folder (folder_id set to null or row deleted)", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    // Create folder
    const folderId = randomUUID();
    await client.from("folders").upsert({
      id: folderId,
      organization_id: seeded.organizationId,
      name: "Temp Folder",
      parent_id: null,
      location_id: null,
    });

    // Create a checklist in that folder
    const { data: created } = await client.rpc("save_checklist", {
      p_id: null, p_title: "Folder Checklist", p_folder_id: folderId,
      p_location_id: null, p_location_ids: null, p_start_date: null,
      p_schedule: null, p_sections: [], p_time_of_day: "anytime",
      p_due_time: null, p_visibility_from: null, p_visibility_until: null,
    });
    const checklistId = (created as any).id;

    // Delete the folder
    const { error: deleteError } = await client.from("folders").delete().eq("id", folderId);
    expect(deleteError).toBeNull();

    // Checklist still exists but folder_id is now null (ON DELETE SET NULL)
    const { data: cl } = await client.from("checklists").select("folder_id").eq("id", checklistId);
    expect(cl?.[0]?.folder_id).toBeNull();
  });
});
