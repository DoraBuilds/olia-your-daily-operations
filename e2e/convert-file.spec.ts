/**
 * E2E — Convert File modal (inside /checklists → + → Convert file)
 *
 * Covers:
 *  1. Create menu opens when the + button is tapped
 *  2. "Convert file" option is visible in the create menu (growth plan)
 *  3. Clicking "Convert file" opens the ConvertFileModal
 *  4. Drop zone renders with data-testid="convert-drop-zone"
 *  5. Selecting a CSV file enables the "Convert to checklist" button
 *  6. Success path: mocked edge function returns sections → modal closes, builder opens
 *  7. Failure path: edge function returns error → humanized error message shown
 *
 * Requires the org to be on the "growth" plan so can("fileConvert") returns true.
 * mockAllTables() already seeds ORG_GROWTH (plan: "growth").
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { injectAuth }    from "./fixtures/auth";
import { mockAllTables, mockEdgeFunction } from "./fixtures/supabase";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Navigate to /checklists, mock all tables (growth plan), ready to open modal. */
async function gotoChecklists(page: import("@playwright/test").Page) {
  await injectAuth(page);
  await mockAllTables(page);
  await page.goto("/checklists");
}

/** Write a tiny CSV temp file and return its path. */
function makeTempCsv(): string {
  const tmp = path.join(os.tmpdir(), `olia-e2e-${Date.now()}.csv`);
  fs.writeFileSync(tmp, "Task,Done\nClean counter,yes\nCheck temp,no\n");
  return tmp;
}

/** Open the Create menu and click "Convert file". */
async function openConvertModal(page: import("@playwright/test").Page) {
  await page.getByTestId("checklists-create-btn").click();

  // "Convert file" option inside the CreateMenuSheet
  await page.getByText("Convert file").click();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Checklists — create menu", () => {
  test("+ button opens the create menu", async ({ page }) => {
    await gotoChecklists(page);
    await page.getByTestId("checklists-create-btn").click();
    await expect(page.getByText("Build your own checklist")).toBeVisible();
  });

  test("'Convert file' option is visible in the create menu", async ({ page }) => {
    await gotoChecklists(page);
    await page.getByTestId("checklists-create-btn").click();
    await expect(page.getByText("Convert file")).toBeVisible();
  });
});

test.describe("ConvertFileModal — drop zone", () => {
  test("modal opens and shows the drop zone", async ({ page }) => {
    await gotoChecklists(page);
    await openConvertModal(page);
    await expect(page.getByTestId("convert-drop-zone")).toBeVisible();
  });

  test("modal shows 'Convert file to checklist' heading", async ({ page }) => {
    await gotoChecklists(page);
    await openConvertModal(page);
    await expect(page.getByText(/Convert file to checklist/i)).toBeVisible();
  });

  test("'Convert to checklist' button is disabled before a file is selected", async ({ page }) => {
    await gotoChecklists(page);
    await openConvertModal(page);
    const convertBtn = page.getByRole("button", { name: /Convert to checklist/i });
    await expect(convertBtn).toBeDisabled();
  });

  test("selecting a CSV file enables the Convert button", async ({ page }) => {
    await gotoChecklists(page);
    await openConvertModal(page);

    const csvPath = makeTempCsv();
    try {
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByTestId("convert-drop-zone").click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(csvPath);

      const convertBtn = page.getByRole("button", { name: /Convert to checklist/i });
      await expect(convertBtn).toBeEnabled();
    } finally {
      fs.unlinkSync(csvPath);
    }
  });
});

test.describe("ConvertFileModal — success path", () => {
  test("converts CSV and closes modal when edge function returns sections", async ({ page }) => {
    // Mock edge function BEFORE all other mocks (LIFO — but this is a different URL)
    await injectAuth(page);
    await mockAllTables(page);
    await mockEdgeFunction(page, "generate-checklist", {
      sections: [
        {
          id: "sec-001",
          name: "Daily Checks",
          questions: [
            { id: "q-001", text: "Clean counter?", responseType: "checkbox", required: true },
            { id: "q-002", text: "Check temp?",    responseType: "checkbox", required: true },
          ],
        },
      ],
    });
    await page.goto("/checklists");

    const csvPath = makeTempCsv();
    try {
      await openConvertModal(page);

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByTestId("convert-drop-zone").click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(csvPath);

      await page.getByRole("button", { name: /Convert to checklist/i }).click();

      // Modal closes on success — drop zone should be gone
      await expect(page.getByTestId("convert-drop-zone")).toHaveCount(0);
    } finally {
      fs.unlinkSync(csvPath);
    }
  });
});

test.describe("ConvertFileModal — failure path", () => {
  test("shows humanized error when edge function returns a quota error", async ({ page }) => {
    await injectAuth(page);
    await mockAllTables(page);
    await mockEdgeFunction(
      page,
      "generate-checklist",
      { error: "quota exceeded — billing limit reached" },
      200 // Supabase edge functions return 200 with error in body
    );
    await page.goto("/checklists");

    const csvPath = makeTempCsv();
    try {
      await openConvertModal(page);

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByTestId("convert-drop-zone").click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(csvPath);

      await page.getByRole("button", { name: /Convert to checklist/i }).click();

      // humanizeConvertError maps "quota" → "AI service quota reached..."
      await expect(
        page.getByText(/AI service quota reached/i)
      ).toBeVisible();
    } finally {
      fs.unlinkSync(csvPath);
    }
  });

  test("shows humanized error when edge function returns a 500", async ({ page }) => {
    await injectAuth(page);
    await mockAllTables(page);
    // Edge function hard 500
    await page.route("**/functions/v1/generate-checklist*", (route) => {
      route.fulfill({ status: 500, body: "Internal Server Error" });
    });
    await page.goto("/checklists");

    const csvPath = makeTempCsv();
    try {
      await openConvertModal(page);

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByTestId("convert-drop-zone").click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(csvPath);

      await page.getByRole("button", { name: /Convert to checklist/i }).click();

      // humanizeConvertError maps "500" → "AI service is temporarily unavailable"
      await expect(
        page.getByText(/temporarily unavailable/i)
      ).toBeVisible();
    } finally {
      fs.unlinkSync(csvPath);
    }
  });

  test("Convert button re-enables after an error so user can retry", async ({ page }) => {
    await injectAuth(page);
    await mockAllTables(page);
    await mockEdgeFunction(page, "generate-checklist", { error: "network error" });
    await page.goto("/checklists");

    const csvPath = makeTempCsv();
    try {
      await openConvertModal(page);

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByTestId("convert-drop-zone").click();
      const fc = await fileChooserPromise;
      await fc.setFiles(csvPath);

      const convertBtn = page.getByRole("button", { name: /Convert to checklist/i });
      await convertBtn.click();

      // Wait for error to appear (convert cycle finished)
      await expect(page.getByText(/Something went wrong/i)).toBeVisible();

      // Button should be re-enabled so the user can retry
      await expect(convertBtn).toBeEnabled();
    } finally {
      fs.unlinkSync(csvPath);
    }
  });
});
