import { test, expect } from "@playwright/test";
import {
  createServiceRoleClient,
  deleteOrganization,
  seedKioskScenario,
} from "../src/test/integration/local-supabase";

let organizationId: string | null = null;
let locationId: string | null = null;
let locationName: string | null = null;
let locationChecklistTitle: string | null = null;
let allLocationsChecklistTitle: string | null = null;

test.beforeEach(async () => {
  const service = createServiceRoleClient();
  const seeded = await seedKioskScenario(service);
  organizationId = seeded.organizationId;
  locationId = seeded.locationId;
  locationName = `Integration Location ${seeded.locationId.slice(0, 8)}`;
  locationChecklistTitle = "Location Checklist";
  allLocationsChecklistTitle = "All Locations Checklist";
});

test.afterEach(async () => {
  if (!organizationId) return;
  const service = createServiceRoleClient();
  await deleteOrganization(service, organizationId);
  organizationId = null;
  locationId = null;
});

test.describe("Kiosk live smoke", () => {
  test("loads a real local-Supabase location on the setup screen", async ({ page }) => {
    await page.goto("/kiosk");
    await expect(page.getByText("Olia Kiosk")).toBeVisible();
    await expect(page.locator("#location-select")).toContainText(locationName!);
  });

  test("shows real local-Supabase checklists on the kiosk grid", async ({ page }) => {
    await page.addInitScript(
      ({ id, name }) => {
        localStorage.setItem("kiosk_location_id", id);
        localStorage.setItem("kiosk_location_name", name);
      },
      { id: locationId!, name: locationName! },
    );

    await page.goto("/kiosk");

    await expect(page.getByText(/what's on the agenda/i)).toBeVisible();
    await expect(page.getByTestId("kiosk-tab-due")).toBeVisible();
    await expect(page.getByText(locationChecklistTitle!)).toBeVisible();
    await expect(page.getByText(allLocationsChecklistTitle!)).toBeVisible();
  });
});
