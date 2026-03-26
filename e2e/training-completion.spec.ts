/**
 * E2E smoke tests — Training module completion flow
 *
 * These tests verify that training completion state persists correctly
 * through back-navigation within the same session (local state, not DB).
 *
 * Auth: We inject a fake session so the app thinks the user is logged in.
 * All Supabase REST calls are intercepted and return empty arrays.
 *
 * What is covered:
 *  1. Navigating to /infohub shows Training tab
 *  2. Opening a training module shows its steps
 *  3. Completing all steps shows "Module complete." card
 *  4. "Mark as incomplete" resets the module
 *  5. Completing a module → navigating back → re-opening shows completed state
 */
import { test, expect } from "@playwright/test";
import { mockSupabaseEmpty } from "./helpers/mock-supabase";

// ─── Auth setup ──────────────────────────────────────────────────────────────

/**
 * Inject enough localStorage so Supabase client thinks a session exists
 * and AuthContext resolves with a fake team member.
 */
async function injectAuth(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    // Supabase session key format: sb-<anything>-auth-token
    // The React app reads VITE_SUPABASE_URL from env; we inject under a wildcard
    // key that covers the local/dev project ref.
    const fakeSession = {
      access_token:  "fake-e2e-token",
      refresh_token: "fake-e2e-refresh",
      expires_at:    Math.floor(Date.now() / 1000) + 7200,
      token_type:    "bearer",
      user: {
        id:    "00000000-0000-0000-0000-000000000001",
        email: "test@olia.app",
        role:  "authenticated",
      },
    };
    // Store under all plausible key prefixes
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) localStorage.removeItem(k);
    });
    // We'll let the app create the key; here we prime the raw session
    localStorage.setItem("_olia_e2e_fake_session", JSON.stringify(fakeSession));
  });
}

// ─── Helper: navigate into the "How to make a latte" module ──────────────────

async function openLatteModule(page: import("@playwright/test").Page) {
  await page.goto("/infohub");
  // Switch to Training tab
  await page.getByRole("button", { name: /training/i }).click();
  // Open Onboarding folder
  await page.getByText("Onboarding").click();
  // Open the latte module
  await page.getByText("How to make a latte").click();
  // Wait for Step 1 to appear
  await expect(page.getByText("Step 1")).toBeVisible();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Training — module completion flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseEmpty(page);
  });

  test("Training tab is accessible from /infohub", async ({ page }) => {
    await page.goto("/infohub");
    await expect(page.getByRole("button", { name: /training/i })).toBeVisible();
  });

  test("Onboarding folder contains 'How to make a latte' module", async ({ page }) => {
    await page.goto("/infohub");
    await page.getByRole("button", { name: /training/i }).click();
    await page.getByText("Onboarding").click();
    await expect(page.getByText("How to make a latte")).toBeVisible();
  });

  test("opening a module shows Step 1", async ({ page }) => {
    await openLatteModule(page);
    await expect(page.getByText("Step 1")).toBeVisible();
  });

  test("completing all steps shows 'Module complete.' card", async ({ page }) => {
    await openLatteModule(page);
    // Click every "Step N" button until none remain unchecked
    let n = 1;
    while (true) {
      const stepLabel = page.getByText(`Step ${n}`, { exact: true });
      const count = await stepLabel.count();
      if (count === 0) break;
      const stepBtn = stepLabel.locator("xpath=ancestor::button");
      if (await stepBtn.count() === 0) break;
      await stepBtn.first().click();
      n++;
    }
    await expect(page.getByText("Module complete.")).toBeVisible();
  });

  test("'Mark as incomplete' resets the module after full completion", async ({ page }) => {
    await openLatteModule(page);
    let n = 1;
    while (true) {
      const stepLabel = page.getByText(`Step ${n}`, { exact: true });
      if (await stepLabel.count() === 0) break;
      const stepBtn = stepLabel.locator("xpath=ancestor::button");
      if (await stepBtn.count() === 0) break;
      await stepBtn.first().click();
      n++;
    }
    await expect(page.getByText("Module complete.")).toBeVisible();
    await page.getByText("Mark as incomplete").click();
    await expect(page.getByText("Module complete.")).not.toBeVisible();
    await expect(page.getByText("Step 1")).toBeVisible();
  });

  test("completed state persists through back-navigation", async ({ page }) => {
    await openLatteModule(page);

    // Complete all steps
    let n = 1;
    while (true) {
      const stepLabel = page.getByText(`Step ${n}`, { exact: true });
      if (await stepLabel.count() === 0) break;
      const stepBtn = stepLabel.locator("xpath=ancestor::button");
      if (await stepBtn.count() === 0) break;
      await stepBtn.first().click();
      n++;
    }
    await expect(page.getByText("Module complete.")).toBeVisible();

    // Go back (first rounded-full button in the header is Back)
    await page.locator("button.rounded-full").first().click();

    // Re-open the same module
    await page.getByText("How to make a latte").click();
    await expect(page.getByText("Step 1")).toBeVisible();

    // Should immediately show as complete — no re-clicking needed
    await expect(page.getByText("Module complete.")).toBeVisible();
  });
});
