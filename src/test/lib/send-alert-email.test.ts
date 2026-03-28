import { describe, expect, it } from "vitest";

import {
  buildAlertEmail,
  DEV_FALLBACK_FROM_EMAIL,
  formatAlertWhen,
  resolveFromEmail,
} from "../../../supabase/functions/send-alert-email/email";

describe("send alert email helpers", () => {
  it("uses a configured sender when present", () => {
    expect(resolveFromEmail("alerts@olia.app")).toEqual({
      fromEmail: "alerts@olia.app",
      usedFallback: false,
    });
  });

  it("falls back to the development sender when no sender is configured", () => {
    expect(resolveFromEmail("")).toEqual({
      fromEmail: DEV_FALLBACK_FROM_EMAIL,
      usedFallback: true,
    });
  });

  it("formats the fallback time when created_at is missing", () => {
    expect(formatAlertWhen("", "09:15")).toBe("09:15");
    expect(formatAlertWhen("", null)).toBe("unknown time");
  });

  it("builds escaped alert email content", () => {
    const email = buildAlertEmail({
      id: "alert-1",
      type: "error",
      message: "Fridge temp < 2C & rising",
      area: "Opening checks",
      time: null,
      source: "Kitchen kiosk",
      created_at: "2026-03-27T09:15:00.000Z",
      organization_id: "org-1",
      recipient_email: "owner@test.com",
    });

    expect(email.subject).toContain("Fridge temp < 2C & rising");
    expect(email.textBody).toContain("Checklist: Opening checks");
    expect(email.textBody).toContain("Source   : Kitchen kiosk");
    expect(email.htmlBody).toContain("Fridge temp &lt; 2C &amp; rising");
    expect(email.htmlBody).toContain("Opening checks");
    expect(email.htmlBody).toContain("Kitchen kiosk");
  });
});
