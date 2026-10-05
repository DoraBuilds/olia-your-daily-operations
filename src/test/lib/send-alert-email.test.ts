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

  it("builds the structured warning email for kiosk answer alerts", () => {
    const email = buildAlertEmail({
      id: "alert-2",
      type: "warn",
      message: "Temperatura del congelador de servicio: recorded 0 - outside the allowed range (min -25, max -10)",
      area: "TEST",
      time: null,
      source: "kiosk",
      created_at: "2026-10-05T09:36:00.000Z",
      organization_id: "org-1",
      recipient_email: "owner@test.com",
      question_text: "Temperatura del congelador de servicio",
      response_text: "0",
      location_name: "Little Fern Bakery",
      staff_name: "Maria Lopez",
    });

    expect(email.subject).toBe("⚠️ Warning: Temperatura del congelador de servicio: recorded 0 - Little Fern Bakery");
    expect(email.textBody).toContain("Location: Little Fern Bakery");
    expect(email.textBody).toContain("Checklist: TEST");
    expect(email.textBody).toContain("Staff: Maria Lopez");
    expect(email.textBody).toContain("Date/time:");
    expect(email.textBody).not.toContain("Source");
    expect(email.htmlBody).toContain("Maria Lopez");
    expect(email.htmlBody).toContain("Open Olia");
  });

  it("shows the kiosk's local time and falls back to UTC", () => {
    expect(formatAlertWhen("2026-10-05T09:36:00.000Z", null, "Europe/Madrid")).toContain("11:36");
    expect(formatAlertWhen("2026-10-05T09:36:00.000Z", null, null)).toContain("09:36");
    expect(formatAlertWhen("2026-10-05T09:36:00.000Z", null, "Not/AZone")).toContain("09:36");
  });

  it("links Open Olia to the alert in Notifications", () => {
    const base = {
      id: "abc-123", type: "warn", message: "m", area: null, time: null, source: null,
      created_at: "2026-10-05T09:36:00.000Z", organization_id: "o", recipient_email: "a@b.c",
    };
    expect(buildAlertEmail(base).htmlBody).toContain("https://oliahq.com/notifications?alert=abc-123");
    expect(buildAlertEmail({ ...base, question_text: "Q", response_text: "1" }).htmlBody)
      .toContain("https://oliahq.com/notifications?alert=abc-123");
  });
});
