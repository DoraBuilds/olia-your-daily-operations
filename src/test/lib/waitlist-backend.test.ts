// Static checks on the SQL migrations and the Apps Script. There's no database
// in the unit suite, so these pin down the properties that matter: the signup
// gate stays server-side and fail-closed, the webhook trigger can never block an
// insert, and the waitlist table stays insert-only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const table = read("supabase/migrations/20261003000001_waitlist_signups.sql");
const trigger = read("supabase/migrations/20261003000002_waitlist_webhook_trigger.sql");
const gate = read("supabase/migrations/20261003000003_signups_gate.sql");
const script = read("docs/waitlist-sheet-apps-script.gs");

describe("waitlist_signups table", () => {
  it("is insert-only for API roles", () => {
    expect(table).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(table).toMatch(/FOR INSERT\s+TO anon, authenticated/);
    expect(table).not.toMatch(/FOR (SELECT|UPDATE|DELETE|ALL)/);
    expect(table).toMatch(/GRANT INSERT ON public\.waitlist_signups TO anon, authenticated/);
    expect(table).toMatch(/UNIQUE INDEX[\s\S]*lower\(email\)/);
  });
});

describe("waitlist webhook trigger", () => {
  it("uses net.http_post (not extensions.net) and reads the URL from app_config", () => {
    expect(trigger).toMatch(/PERFORM net\.http_post\(/);
    expect(trigger).not.toMatch(/extensions\.net\.http_post/);
    expect(trigger).toMatch(/key = 'waitlist_webhook_url'/);
  });

  it("only warns when the URL is unset or the call fails, and always returns NEW", () => {
    expect(trigger).toMatch(/RAISE WARNING 'notify_waitlist_signup: waitlist_webhook_url not set/);
    expect(trigger).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING[\s\S]*RETURN NEW;/);
    expect(trigger).not.toMatch(/RAISE EXCEPTION/);
    expect(trigger).toMatch(/AFTER INSERT ON public\.waitlist_signups/);
  });

  it("can't be called directly by API roles", () => {
    expect(trigger).toMatch(/REVOKE ALL ON FUNCTION public\.notify_waitlist_signup\(\) FROM PUBLIC, anon, authenticated/);
  });
});

describe("signups gate", () => {
  it("defaults to closed", () => {
    expect(gate).toMatch(/\('signups_enabled', 'false'\)\s+ON CONFLICT \(key\) DO NOTHING/);
  });

  it("fails closed unless the flag is exactly 'true'", () => {
    expect(gate).toMatch(/COALESCE\(\(SELECT value FROM public\.app_config WHERE key = 'signups_enabled'\), 'false'\) <> 'true'/);
    expect(gate).toMatch(/RAISE EXCEPTION 'Signups are not open yet'/);
  });

  it("runs after the existing-member branch and before any organization is created", () => {
    const existing = gate.indexOf("IF EXISTS (SELECT 1 FROM team_members WHERE id = v_user_id)");
    const check = gate.indexOf("Signups are not open yet");
    const insertOrg = gate.indexOf("INSERT INTO organizations");
    expect(existing).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(existing);
    expect(insertOrg).toBeGreaterThan(check);
  });

  it("keeps the function executable only by signed-in users", () => {
    expect(gate).toMatch(/REVOKE ALL ON FUNCTION public\.setup_new_organization\(TEXT, TEXT, TEXT\) FROM PUBLIC/);
    expect(gate).toMatch(/GRANT EXECUTE ON FUNCTION public\.setup_new_organization\(TEXT, TEXT, TEXT\) TO authenticated/);
  });
});

describe("Apps Script", () => {
  it("rejects a missing or wrong secret before touching the sheet", () => {
    const secretCheck = script.indexOf("given !== secret");
    expect(secretCheck).toBeGreaterThan(-1);
    expect(secretCheck).toBeLessThan(script.indexOf("getActiveSheet"));
  });

  it("dedupes on column B, guards against formula injection, and notifies the owner", () => {
    expect(script).toMatch(/getRange\(2, 2,/);
    expect(script).toMatch(/\[=\+\\-@\]/);
    expect(script).toMatch(/MailApp\.sendEmail\(\s*Session\.getEffectiveUser\(\)\.getEmail\(\)/);
    expect(script).toMatch(/'New Olia waitlist signup: ' \+ email/);
  });
});
