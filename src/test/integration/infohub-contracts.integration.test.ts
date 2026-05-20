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

// ── infohub_folders contracts ─────────────────────────────────────────────────

describe.sequential("infohub_folders contracts", () => {
  it("manager can create and read an org-scoped folder", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error: insertError } = await client.from("infohub_folders").insert({
      organization_id: seeded.organizationId,
      section: "library",
      name: "Operations",
      parent_id: null,
      access_scope: "org",
      created_by: seeded.userId,
    });
    expect(insertError).toBeNull();

    const { data, error } = await client
      .from("infohub_folders")
      .select("name, section, access_scope")
      .eq("organization_id", seeded.organizationId);

    expect(error).toBeNull();
    expect(data?.map((f) => f.name)).toContain("Operations");
  });

  it("manager cannot read another org's folders", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    await service.from("infohub_folders").insert({
      organization_id: seededB.organizationId,
      section: "library",
      name: "Org B Folder",
      access_scope: "org",
      created_by: seededB.userId,
    });

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data } = await clientA.from("infohub_folders").select("name");
    expect(data?.map((f) => f.name)).not.toContain("Org B Folder");
  });

  it("manager can update a folder name", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seeded.organizationId,
      section: "library",
      name: "Old Name",
      access_scope: "org",
      created_by: seeded.userId,
    });

    const { error } = await client
      .from("infohub_folders")
      .update({ name: "New Name" })
      .eq("id", folderId);
    expect(error).toBeNull();

    const { data } = await client.from("infohub_folders").select("name").eq("id", folderId);
    expect(data?.[0]?.name).toBe("New Name");
  });

  it("manager can delete a folder and its documents are cascade-deleted", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seeded.organizationId,
      section: "library",
      name: "Temp Folder",
      access_scope: "org",
      created_by: seeded.userId,
    });
    const docId = randomUUID();
    await service.from("infohub_documents").insert({
      id: docId,
      organization_id: seeded.organizationId,
      section: "library",
      folder_id: folderId,
      title: "Temp Doc",
      access_scope: "org",
      created_by: seeded.userId,
    });

    const { error } = await client.from("infohub_folders").delete().eq("id", folderId);
    expect(error).toBeNull();

    // Both folder and its document should be gone
    const { data: folders } = await service.from("infohub_folders").select("id").eq("id", folderId);
    const { data: docs } = await service.from("infohub_documents").select("id").eq("id", docId);
    expect(folders).toHaveLength(0);
    expect(docs).toHaveLength(0);
  });

  it("folders are ordered by sort_order ascending", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    await service.from("infohub_folders").insert([
      { organization_id: seeded.organizationId, section: "library", name: "Z Last", sort_order: 3, access_scope: "org", created_by: seeded.userId },
      { organization_id: seeded.organizationId, section: "library", name: "A First", sort_order: 1, access_scope: "org", created_by: seeded.userId },
      { organization_id: seeded.organizationId, section: "library", name: "M Middle", sort_order: 2, access_scope: "org", created_by: seeded.userId },
    ]);

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data, error } = await client
      .from("infohub_folders")
      .select("name, sort_order")
      .eq("organization_id", seeded.organizationId)
      .order("sort_order", { ascending: true });

    expect(error).toBeNull();
    const names = data?.map((f) => f.name) ?? [];
    expect(names.indexOf("A First")).toBeLessThan(names.indexOf("M Middle"));
    expect(names.indexOf("M Middle")).toBeLessThan(names.indexOf("Z Last"));
  });

  it("restricted folder is visible to an Owner but not to a non-allowed non-Owner in the same org", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    // Create a second auth user with role Manager (non-Owner, no allowed lists)
    const { data: secondAuth, error: secondAuthError } = await service.auth.admin.createUser({
      email: `non-owner-${randomUUID().slice(0, 8)}@olia.test`,
      password: "Password123!",
      email_confirm: true,
    });
    if (secondAuthError) throw secondAuthError;
    const nonOwnerId = secondAuth.user.id;
    createdAuthUsers.push(nonOwnerId);

    await service.from("team_members").insert({
      id: nonOwnerId,
      organization_id: seeded.organizationId,
      name: "Regular Manager",
      email: secondAuth.user.email!,
      role: "Manager",
      location_ids: [seeded.locationId],
      permissions: {
        create_edit_checklists: false,
        assign_checklists: false,
        manage_staff_profiles: false,
        view_reporting: true,
        edit_location_details: false,
        manage_alerts: false,
        export_data: false,
        override_inactivity_threshold: false,
      },
    });

    // Insert a restricted folder allowing no one (only Owners can see it)
    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seeded.organizationId,
      section: "library",
      name: "Restricted Folder",
      access_scope: "restricted",
      allowed_team_member_ids: [],
      allowed_roles: [],
      allowed_location_ids: [],
      created_by: seeded.userId,
    });

    // Owner (seeded.userId) should see it
    const ownerClient = await signInAsManager(seeded.email, seeded.password);
    const { data: ownerData } = await ownerClient
      .from("infohub_folders")
      .select("name")
      .eq("id", folderId);
    expect(ownerData?.map((f) => f.name)).toContain("Restricted Folder");

    // Non-owner (no allowed list entry) should NOT see it
    const nonOwnerClient = createAnonClient();
    const { error: signInError } = await nonOwnerClient.auth.signInWithPassword({
      email: secondAuth.user.email!,
      password: "Password123!",
    });
    if (signInError) throw signInError;

    const { data: nonOwnerData } = await nonOwnerClient
      .from("infohub_folders")
      .select("name")
      .eq("id", folderId);
    expect(nonOwnerData?.map((f) => f.name)).not.toContain("Restricted Folder");
  });
});

// ── infohub_documents contracts ───────────────────────────────────────────────

describe.sequential("infohub_documents contracts", () => {
  it("manager can create and read a document", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seeded.organizationId,
      section: "library",
      name: "Procedures",
      access_scope: "org",
      created_by: seeded.userId,
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error: insertError } = await client.from("infohub_documents").insert({
      organization_id: seeded.organizationId,
      section: "library",
      folder_id: folderId,
      title: "Opening Procedure",
      body: "Unlock doors, turn on lights.",
      access_scope: "org",
      created_by: seeded.userId,
    });
    expect(insertError).toBeNull();

    const { data, error } = await client
      .from("infohub_documents")
      .select("title, body, section")
      .eq("folder_id", folderId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      title: "Opening Procedure",
      body: "Unlock doors, turn on lights.",
      section: "library",
    });
  });

  it("manager cannot read another org's documents", async () => {
    const seededA = await seedManagerScenario(service);
    const seededB = await seedManagerScenario(service);
    createdOrganizations.push(seededA.organizationId, seededB.organizationId);
    createdAuthUsers.push(seededA.userId, seededB.userId);

    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seededB.organizationId,
      section: "library",
      name: "Org B Folder",
      access_scope: "org",
      created_by: seededB.userId,
    });
    await service.from("infohub_documents").insert({
      organization_id: seededB.organizationId,
      section: "library",
      folder_id: folderId,
      title: "Org B Secret Doc",
      access_scope: "org",
      created_by: seededB.userId,
    });

    const clientA = await signInAsManager(seededA.email, seededA.password);
    const { data } = await clientA.from("infohub_documents").select("title");
    expect(data?.map((d) => d.title)).not.toContain("Org B Secret Doc");
  });

  it("manager can update a document's title and body", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seeded.organizationId,
      section: "library",
      name: "Editable Folder",
      access_scope: "org",
      created_by: seeded.userId,
    });
    const docId = randomUUID();
    await service.from("infohub_documents").insert({
      id: docId,
      organization_id: seeded.organizationId,
      section: "library",
      folder_id: folderId,
      title: "Draft",
      body: "Work in progress",
      access_scope: "org",
      created_by: seeded.userId,
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error } = await client
      .from("infohub_documents")
      .update({ title: "Published", body: "Final content." })
      .eq("id", docId);
    expect(error).toBeNull();

    const { data } = await client
      .from("infohub_documents")
      .select("title, body")
      .eq("id", docId);
    expect(data?.[0]).toMatchObject({ title: "Published", body: "Final content." });
  });

  it("manager can archive a document by setting archived_at", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seeded.organizationId,
      section: "library",
      name: "Archive Folder",
      access_scope: "org",
      created_by: seeded.userId,
    });
    const docId = randomUUID();
    await service.from("infohub_documents").insert({
      id: docId,
      organization_id: seeded.organizationId,
      section: "library",
      folder_id: folderId,
      title: "Old Policy",
      access_scope: "org",
      created_by: seeded.userId,
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const archivedAt = new Date().toISOString();
    const { error } = await client
      .from("infohub_documents")
      .update({ archived_at: archivedAt })
      .eq("id", docId);
    expect(error).toBeNull();

    const { data } = await client
      .from("infohub_documents")
      .select("archived_at")
      .eq("id", docId);
    expect(data?.[0]?.archived_at).not.toBeNull();
  });

  it("manager can delete a document", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seeded.organizationId,
      section: "library",
      name: "Delete Folder",
      access_scope: "org",
      created_by: seeded.userId,
    });
    const docId = randomUUID();
    await service.from("infohub_documents").insert({
      id: docId,
      organization_id: seeded.organizationId,
      section: "library",
      folder_id: folderId,
      title: "Deletable Doc",
      access_scope: "org",
      created_by: seeded.userId,
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error } = await client.from("infohub_documents").delete().eq("id", docId);
    expect(error).toBeNull();

    const { data } = await client.from("infohub_documents").select("id").eq("id", docId);
    expect(data).toHaveLength(0);
  });

  it("document metadata is stored and retrieved correctly", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const folderId = randomUUID();
    await service.from("infohub_folders").insert({
      id: folderId,
      organization_id: seeded.organizationId,
      section: "training",
      name: "Training Module Folder",
      access_scope: "org",
      created_by: seeded.userId,
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error } = await client.from("infohub_documents").insert({
      organization_id: seeded.organizationId,
      section: "training",
      folder_id: folderId,
      title: "Fire Safety",
      metadata: { duration: "15 min", steps: ["Watch video", "Complete quiz"] },
      access_scope: "org",
      created_by: seeded.userId,
    });
    expect(error).toBeNull();

    const { data } = await client
      .from("infohub_documents")
      .select("title, metadata")
      .eq("folder_id", folderId);

    expect(data?.[0]?.metadata).toMatchObject({
      duration: "15 min",
      steps: ["Watch video", "Complete quiz"],
    });
  });
});

// ── training_progress contracts ───────────────────────────────────────────────

describe.sequential("training_progress contracts", () => {
  it("manager can insert training progress and read it back", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const moduleId = randomUUID();
    const { error } = await client.from("training_progress").insert({
      organization_id: seeded.organizationId,
      user_id: seeded.userId,
      module_id: moduleId,
      completed_step_indices: [0, 1],
      is_completed: false,
    });
    expect(error).toBeNull();

    const { data, error: readError } = await client
      .from("training_progress")
      .select("module_id, completed_step_indices, is_completed")
      .eq("module_id", moduleId);

    expect(readError).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      module_id: moduleId,
      completed_step_indices: [0, 1],
      is_completed: false,
    });
  });

  it("upsert on same (org, user, module) updates the existing row", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const moduleId = randomUUID();
    await client.from("training_progress").insert({
      organization_id: seeded.organizationId,
      user_id: seeded.userId,
      module_id: moduleId,
      completed_step_indices: [0],
      is_completed: false,
    });

    // Upsert with more progress
    const { error } = await client.from("training_progress").upsert({
      organization_id: seeded.organizationId,
      user_id: seeded.userId,
      module_id: moduleId,
      completed_step_indices: [0, 1, 2],
      is_completed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,user_id,module_id" });
    expect(error).toBeNull();

    const { data } = await client
      .from("training_progress")
      .select("completed_step_indices, is_completed")
      .eq("module_id", moduleId);

    // Should be one row with updated data, not two
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      completed_step_indices: [0, 1, 2],
      is_completed: true,
    });
  });

  it("manager can only read their own progress, not another user's in the same org", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    // Create a second user in the same org via service role
    const { data: secondAuth, error: secondAuthError } = await service.auth.admin.createUser({
      email: `progress-test-${randomUUID().slice(0, 8)}@olia.test`,
      password: "Password123!",
      email_confirm: true,
    });
    if (secondAuthError) throw secondAuthError;
    const secondUserId = secondAuth.user.id;
    createdAuthUsers.push(secondUserId);

    await service.from("team_members").insert({
      id: secondUserId,
      organization_id: seeded.organizationId,
      name: "Second User",
      email: secondAuth.user.email!,
      role: "Manager",
      location_ids: [seeded.locationId],
      permissions: { create_edit_checklists: false, assign_checklists: false, manage_staff_profiles: false, view_reporting: true, edit_location_details: false, manage_alerts: false, export_data: false, override_inactivity_threshold: false },
    });

    // Insert progress for the second user directly via service role
    const moduleId = randomUUID();
    await service.from("training_progress").insert({
      organization_id: seeded.organizationId,
      user_id: secondUserId,
      module_id: moduleId,
      completed_step_indices: [0],
      is_completed: false,
    });

    // First manager should NOT see the second user's progress
    const client = await signInAsManager(seeded.email, seeded.password);
    const { data } = await client
      .from("training_progress")
      .select("user_id")
      .eq("module_id", moduleId);

    const userIds = data?.map((r) => r.user_id) ?? [];
    expect(userIds).not.toContain(secondUserId);
  });

  it("completing a training module marks is_completed and records completed_at", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const moduleId = randomUUID();
    await client.from("training_progress").insert({
      organization_id: seeded.organizationId,
      user_id: seeded.userId,
      module_id: moduleId,
      completed_step_indices: [],
      is_completed: false,
    });

    const completedAt = new Date().toISOString();
    const { error } = await client
      .from("training_progress")
      .update({
        completed_step_indices: [0, 1, 2, 3],
        is_completed: true,
        completed_at: completedAt,
      })
      .eq("module_id", moduleId)
      .eq("user_id", seeded.userId);
    expect(error).toBeNull();

    const { data } = await client
      .from("training_progress")
      .select("is_completed, completed_at, completed_step_indices")
      .eq("module_id", moduleId);

    expect(data?.[0]?.is_completed).toBe(true);
    expect(data?.[0]?.completed_at).not.toBeNull();
    expect(data?.[0]?.completed_step_indices).toEqual([0, 1, 2, 3]);
  });
});
