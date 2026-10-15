import { describe, it, expect } from "vitest";
import { buildMissedEmail, isValidPayload } from "../../../supabase/functions/send-missed-notification/email";

const base = {
  recipient_email: "mgr@hotel.com",
  recipient_name: "Dora Angelov",
  location_name: "Cafe Central",
  items: [
    { title: "Opening checklist", window_from: "08:00", window_until: "09:00", route: "window_close", operating_date: "2026-10-15", reason: "short_staffed", note: "Only two of us" },
  ],
};

describe("send-missed-notification email", () => {
  it("validates the payload", () => {
    expect(isValidPayload(base)).toBe(true);
    expect(isValidPayload({ ...base, recipient_email: "nope" })).toBe(false);
    expect(isValidPayload({ ...base, items: [] })).toBe(false);
    expect(isValidPayload(null)).toBe(false);
  });

  it("names the location and count in the subject", () => {
    expect(buildMissedEmail(base).subject).toBe("1 checklist missed at Cafe Central");
    const two = { ...base, items: [...base.items, { title: "Closing" }] };
    expect(buildMissedEmail(two).subject).toBe("2 checklists missed at Cafe Central");
  });

  it("shows the route, window and note", () => {
    const { textBody } = buildMissedEmail(base);
    expect(textBody).toContain("Opening checklist");
    expect(textBody).toContain("Due 08:00 - 09:00");
    expect(textBody).toContain("Missed when the due window closed");
    expect(textBody).toContain("Short-staffed - Only two of us");
    expect(textBody).toContain("Hi Dora,");
  });

  it("explains the after-overdue route", () => {
    const { textBody } = buildMissedEmail({ ...base, items: [{ title: "Closing", route: "after_overdue" }] });
    expect(textBody).toContain("Missed after Overdue");
  });

  it("escapes HTML in user-supplied text", () => {
    const { htmlBody } = buildMissedEmail({ ...base, items: [{ title: "<script>x</script>", note: "<b>hi</b>" }] });
    expect(htmlBody).not.toContain("<script>x</script>");
    expect(htmlBody).toContain("&lt;script&gt;");
  });

  it("caps very long lists", () => {
    const many = { ...base, items: Array.from({ length: 60 }, (_, i) => ({ title: `C${i}` })) };
    expect(buildMissedEmail(many).textBody).toContain("...and 10 more.");
  });
});
