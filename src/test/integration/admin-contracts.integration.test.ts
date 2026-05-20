import { afterEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
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
    if (id) await deleteOrganization(service, id).catch(() => {/* already deleted by delete_my_account */});
  }
  while (createdAuthUsers.length > 0) {
    const id = createdAuthUsers.pop();
    if (id) await deleteAuthUser(service, id).catch(() => {/* already deleted */});
  }
});

// ── Location contracts ────────────────────────────────────────────────────────

describe.sequential("location contracts", () => {
  it("manager can update their own location", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error } = await client
      .from("locations")
      .update({ name: "Renamed Location", address: "Updated Street 1" })
      .eq("id", seeded.locationId)
      .select("id");

    expect(error).toBeNull();

    const { data } = await client.from("locations").select("name").eq("id", seeded.locationId);
    expect(data?.[0]?.name).toBe("Renamed Location");
  });

  it("manager cannot update a location from another organization", async () => {
    const own = await seedManagerScenario(service);
    const other = await seedManagerScenario(service);
    createdOrganizations.push(own.organizationId, other.organizationId);
    createdAuthUsers.push(own.userId, other.userId);
    const client = await signInAsManager(own.email, own.password);

    const { data: updated } = await client
      .from("locations")
      .update({ name: "Stolen Name" })
      .eq("id", other.locationId)
      .select("id");

    // RLS silently blocks the update — 0 rows returned, no error
    expect(updated).toHaveLength(0);

    const { data: check } = await service.from("locations").select("name").eq("id", other.locationId);
    expect(check?.[0]?.name).not.toBe("Stolen Name");
  });

  it("manager can delete their own location", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data: deleted, error } = await client
      .from("locations")
      .delete()
      .eq("id", seeded.locationId)
      .select("id");

    expect(error).toBeNull();
    expect(deleted).toHaveLength(1);

    const { data: remaining } = await client.from("locations").select("id").eq("id", seeded.locationId);
    expect(remaining).toHaveLength(0);
  });

  it("INSERT is blocked once the starter plan location limit (1) is reached", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    await service.from("organizations").update({ plan: "starter" }).eq("id", seeded.organizationId);
    const client = await signInAsManager(seeded.email, seeded.password);

    // seeded already has 1 location — starter allows 1
    const { error } = await client.from("locations").insert({
      organization_id: seeded.organizationId,
      name: "Second Location",
      address: "Overflow St",
      contact_email: "x@example.com",
      contact_phone: "+34 600 000 099",
      trading_hours: "{}",
      archive_threshold_days: 90,
    });

    expect(error).not.toBeNull();
  });
});

// ── Staff profile contracts ───────────────────────────────────────────────────

function sha256(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

describe.sequential("staff profile contracts", () => {
  it("manager can create a staff profile and it is readable", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error } = await client.from("staff_profiles").insert({
      organization_id: seeded.organizationId,
      location_id: seeded.locationId,
      first_name: "Jane",
      last_name: "Doe",
      role: "Waiter",
      status: "active",
      pin: sha256("9999"),
    });

    expect(error).toBeNull();

    const { data } = await client.from("staff_profiles").select("first_name, last_name").eq("organization_id", seeded.organizationId);
    expect(data?.map((p) => p.first_name)).toContain("Jane");
  });

  it("manager cannot read staff profiles from another organization", async () => {
    const own = await seedManagerScenario(service);
    const other = await seedManagerScenario(service);
    createdOrganizations.push(own.organizationId, other.organizationId);
    createdAuthUsers.push(own.userId, other.userId);

    await service.from("staff_profiles").insert({
      organization_id: other.organizationId,
      first_name: "Secret",
      last_name: "Staff",
      role: "Chef",
      status: "active",
      pin: sha256("0000"),
    });

    const client = await signInAsManager(own.email, own.password);
    const { data } = await client.from("staff_profiles").select("first_name");
    expect(data?.map((p) => p.first_name)).not.toContain("Secret");
  });

  it("manager can archive a staff profile", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const staffId = randomUUID();
    await service.from("staff_profiles").insert({
      id: staffId,
      organization_id: seeded.organizationId,
      first_name: "To",
      last_name: "Archive",
      role: "Chef",
      status: "active",
      pin: sha256("1111"),
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { data: updated, error } = await client
      .from("staff_profiles")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", staffId)
      .select("id");

    expect(error).toBeNull();
    expect(updated).toHaveLength(1);

    const { data } = await client.from("staff_profiles").select("status").eq("id", staffId);
    expect(data?.[0]?.status).toBe("archived");
  });

  it("manager can delete a staff profile", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const staffId = randomUUID();
    await service.from("staff_profiles").insert({
      id: staffId,
      organization_id: seeded.organizationId,
      first_name: "To",
      last_name: "Delete",
      role: "Waiter",
      status: "active",
      pin: sha256("2222"),
    });

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error } = await client.from("staff_profiles").delete().eq("id", staffId);
    expect(error).toBeNull();

    const { data: remaining } = await client.from("staff_profiles").select("id").eq("id", staffId);
    expect(remaining).toHaveLength(0);
  });

  it("INSERT is blocked once the starter plan staff limit (15) is reached", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    await service.from("organizations").update({ plan: "starter" }).eq("id", seeded.organizationId);

    await service.from("staff_profiles").insert(
      Array.from({ length: 15 }, (_, i) => ({
        organization_id: seeded.organizationId,
        first_name: `Staff${i}`,
        last_name: "Auto",
        role: "Waiter",
        status: "active",
        pin: sha256(`${1000 + i}`),
      })),
    );

    const client = await signInAsManager(seeded.email, seeded.password);
    const { error } = await client.from("staff_profiles").insert({
      organization_id: seeded.organizationId,
      first_name: "One Too Many",
      last_name: "Staff",
      role: "Waiter",
      status: "active",
      pin: sha256("9876"),
    });

    expect(error).not.toBeNull();
  });
});

// ── Team member contracts ─────────────────────────────────────────────────────

describe.sequential("team member contracts", () => {
  it("manager can read their own team_members row", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { data, error } = await client
      .from("team_members")
      .select("id, name, role")
      .eq("id", seeded.userId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ id: seeded.userId, role: "Owner" });
  });

  it("manager cannot read team_members from another organization", async () => {
    const own = await seedManagerScenario(service);
    const other = await seedManagerScenario(service);
    createdOrganizations.push(own.organizationId, other.organizationId);
    createdAuthUsers.push(own.userId, other.userId);
    const client = await signInAsManager(own.email, own.password);

    const { data } = await client.from("team_members").select("id");
    const ids = data?.map((m) => m.id) ?? [];
    expect(ids).toContain(own.userId);
    expect(ids).not.toContain(other.userId);
  });

  it("manager can update their own team_member name", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error } = await client
      .from("team_members")
      .update({ name: "Updated Name" })
      .eq("id", seeded.userId);

    expect(error).toBeNull();

    const { data } = await client.from("team_members").select("name").eq("id", seeded.userId);
    expect(data?.[0]?.name).toBe("Updated Name");
  });

  it("hash_team_member_pin trigger bcrypt-hashes a raw PIN on update", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error } = await client
      .from("team_members")
      .update({ pin: "7890", pin_reset_required: false })
      .eq("id", seeded.userId);

    expect(error).toBeNull();

    // The trigger should have replaced "7890" with a bcrypt hash
    const { data } = await service.from("team_members").select("pin").eq("id", seeded.userId);
    const storedPin = data?.[0]?.pin;
    expect(storedPin).toMatch(/^\$2[abxy]\$/);  // bcrypt prefix
    expect(storedPin).not.toBe("7890");
  });

  it("hash_team_member_pin trigger preserves an already-bcrypt-hashed PIN unchanged", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    // Insert a bcrypt hash directly via service role
    const bcryptHash = "$2b$04$fakehashhashhashhashhashhashhashhashhashhash12";
    await service.from("team_members").update({ pin: bcryptHash }).eq("id", seeded.userId);

    // Re-read via service role — the trigger should NOT re-hash a bcrypt string
    const { data } = await service.from("team_members").select("pin").eq("id", seeded.userId);
    expect(data?.[0]?.pin).toBe(bcryptHash);
  });
});

// ── set_admin_pin RPC ─────────────────────────────────────────────────────────

describe.sequential("set_admin_pin RPC contracts", () => {
  it("authenticated manager can set their own PIN via the RPC", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error } = await client.rpc("set_admin_pin", {
      p_member_id: seeded.userId,
      p_raw_pin: "4321",
    });

    expect(error).toBeNull();

    const { data } = await service.from("team_members").select("pin, pin_reset_required").eq("id", seeded.userId);
    expect(data?.[0]?.pin).toMatch(/^\$2[abxy]\$/);
    expect(data?.[0]?.pin_reset_required).toBe(false);
  });

  it("set_admin_pin rejects an attempt to update another member's PIN", async () => {
    const own = await seedManagerScenario(service);
    const other = await seedManagerScenario(service);
    createdOrganizations.push(own.organizationId, other.organizationId);
    createdAuthUsers.push(own.userId, other.userId);
    const client = await signInAsManager(own.email, own.password);

    const { error } = await client.rpc("set_admin_pin", {
      p_member_id: other.userId,
      p_raw_pin: "1111",
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/only update your own/i);
  });

  it("set_admin_pin rejects a PIN shorter than 4 digits", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);
    const client = await signInAsManager(seeded.email, seeded.password);

    const { error } = await client.rpc("set_admin_pin", {
      p_member_id: seeded.userId,
      p_raw_pin: "12",
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/4 digit/i);
  });
});

// ── validate_invite_token RPC ─────────────────────────────────────────────────

describe.sequential("validate_invite_token RPC contracts", () => {
  it("returns valid=true for a fresh token", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await service.from("team_member_invites").insert({
      organization_id: seeded.organizationId,
      team_member_id: seeded.userId,
      email: "invited@example.com",
      token,
      expires_at: expiresAt,
    });

    const anon = createAnonClient();
    const { data, error } = await anon.rpc("validate_invite_token", { p_token: token });

    expect(error).toBeNull();
    expect(data).toMatchObject({ valid: true, email: "invited@example.com" });
  });

  it("returns valid=false for an unknown token", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc("validate_invite_token", {
      p_token: randomUUID(),
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ valid: false });
  });

  it("returns valid=false for an expired token", async () => {
    const seeded = await seedManagerScenario(service);
    createdOrganizations.push(seeded.organizationId);
    createdAuthUsers.push(seeded.userId);

    const token = randomUUID();
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    await service.from("team_member_invites").insert({
      organization_id: seeded.organizationId,
      team_member_id: seeded.userId,
      email: "expired@example.com",
      token,
      expires_at: expiredAt,
    });

    const anon = createAnonClient();
    const { data } = await anon.rpc("validate_invite_token", { p_token: token });
    expect(data).toMatchObject({ valid: false });
  });
});

// ── delete_my_account RPC ─────────────────────────────────────────────────────

describe.sequential("delete_my_account RPC contracts", () => {
  it("deletes the organization, all its data, and the auth user", async () => {
    const seeded = await seedManagerScenario(service);
    // Do NOT push to cleanup arrays — delete_my_account cleans up everything
    const client = await signInAsManager(seeded.email, seeded.password);

    // Add a checklist so we can verify cascade
    const checklistId = randomUUID();
    await service.from("checklists").insert({
      id: checklistId,
      organization_id: seeded.organizationId,
      title: "Will Be Deleted",
      sections: [],
      time_of_day: "anytime",
    });

    const { data, error } = await client.rpc("delete_my_account");

    expect(error).toBeNull();
    expect((data as any)?.success).toBe(true);

    // Org should be gone
    const { data: orgRows } = await service.from("organizations").select("id").eq("id", seeded.organizationId);
    expect(orgRows).toHaveLength(0);

    // Cascaded checklist should be gone
    const { data: clRows } = await service.from("checklists").select("id").eq("id", checklistId);
    expect(clRows).toHaveLength(0);

    // Auth user should be gone
    const { data: authData } = await service.auth.admin.getUserById(seeded.userId);
    expect(authData.user).toBeNull();
  });
});
