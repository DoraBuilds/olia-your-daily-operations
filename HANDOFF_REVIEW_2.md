# Olia — Second Review: Deep Verification Pass

Generated: 2026-03-10. All claims below are backed by exact code quotes.

---

# 1. Claim Verification

## PIN Stored in Plaintext
**Status: CONFIRMED**

`useStaffProfiles.ts`, mutation function, line 33:
```typescript
pin: sp.pin,  // no transformation — raw 4-digit string written to DB
```

`supabase/migrations/...sql`, seed data, lines 299–305:
```sql
insert into staff_profiles (..., pin) values
  (..., '1234'),
  (..., '5678'),
  (..., '9012'),
```

`admin-repository.ts`, `generatePin()`, line 77–79:
```typescript
export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
```

**Important nuance:** `hashPin` is imported in `Admin.tsx` line 14, but it is **never called** before saving. The import is dead code. The PIN that flows into `useSaveStaffProfile` is the raw string value from the text input.

---

## Anonymous Users Can Read Staff PINs
**Status: CONFIRMED**

`supabase/migrations/...sql`, lines 207–208:
```sql
create policy "staff_profiles_read" on staff_profiles for select
  using (true);  -- kiosk needs to read staff for the grid
```

`useStaffProfiles.ts`, `queryFn`, line 10:
```typescript
const { data, error } = await supabase
  .from("staff_profiles")
  .select("id, location_id, first_name, last_name, role, status, pin, last_used_at, archived_at, created_at")
  .order("first_name");
```

The `select` explicitly includes the `pin` column. Any client holding the public anon key can execute this query without authentication and receive every staff member's PIN from every organization. The schema comment says "PIN hidden client-side" but that is a false claim — the column is returned in the HTTP response.

---

## Dashboard Is Entirely Mock
**Status: CONFIRMED**

`Dashboard.tsx`, lines 41–82 (module-level constants, not state):
```typescript
const locations = ["All locations", "Main Branch", "City Centre", "Riverside"];

const allChecklists: ChecklistCompliance[] = [
  { id: "cl1", name: "Opening Checklist", location: "Main Branch", completion: 42, ... },
  // 6 more entries
];

const overdueTasks: OverdueTask[] = [
  { id: "od1", title: "Grease trap cleaning", daysOverdue: 3, assignedTo: "James" },
];

const currentUser = "Sarah";

const weekEvents: CalendarEvent[] = [ /* 5 hardcoded events */ ];
const monthEvents: CalendarEvent[] = [ /* 11 hardcoded events */ ];
```

`Dashboard.tsx`, line 272:
```typescript
const allAlerts = useSyncExternalStore(subscribe, getAlerts);
```

`getAlerts` comes from `@/lib/alerts-store`, **not** `useAlerts()`. The store's initial state (`alerts-store.ts`, lines 12–18) is:
```typescript
const DEFAULT_ALERTS: OperationalAlert[] = [
  { id: "1", type: "error", message: "Fridge temperature not logged.", area: "Kitchen", ... },
  { id: "2", type: "warn",  message: "Cleaning overdue by 1 day.", area: "Storage", ... },
  { id: "3", type: "error", message: "Delivery intake form incomplete.", area: "Receiving", ... },
  { id: "4", type: "warn",  message: "Staff handover note missing.", area: "Front of House", ... },
  { id: "5", type: "error", message: "Opening checklist not submitted.", area: "General", ... },
];
```

There is **no `useQuery` call**, no Supabase hook, and no `useAuth()` call on the Dashboard page. Zero server data.

---

## Kiosk Checklist Grid Is Hardcoded
**Status: CONFIRMED**

`Kiosk.tsx`, `KIOSK_CHECKLISTS` constant, lines 34–127 (7 hardcoded checklist objects with hardcoded UUIDs for `location_id`).

`Kiosk.tsx`, filtering function, lines 137–142:
```typescript
function getVisibleChecklists(locationId: string): KioskChecklist[] {
  const tod = getCurrentTimeOfDay();
  return KIOSK_CHECKLISTS.filter(
    cl => cl.location_id === locationId && (cl.time_of_day === tod || cl.time_of_day === "anytime"),
  );
}
```

The filter matches on `location_id` but only works if the location UUID in the DB matches the hardcoded UUIDs in the constant. The seed data creates locations with those exact UUIDs (`00000000-0000-0000-0000-000000000010`, `..011`), so this accidentally works for the demo org — but will break the moment any real location is created, since it will have a random UUID.

---

## Infohub Is Entirely Mock
**Status: CONFIRMED**

`Infohub.tsx`, lines 52–128:
```typescript
const initialLibraryFolders: FolderItem[] = [
  { id: "f1", name: "Cleaning & Maintenance", parentId: null, sortOrder: null },
  { id: "f2", name: "Food Safety", parentId: null, sortOrder: null },
  // ...
];

const initialLibraryDocs: DocItem[] = [
  { id: "s1", title: "How to serve a customer", folderId: "f4", content: `Welcome every customer...`, ... },
  // ...
];

const initialTrainingFolders: TrainingFolder[] = [ /* 2 folders */ ];

const initialTrainingDocs: TrainingDoc[] = [
  { id: "tr1", title: "How to make a latte", completed: false, steps: [...] },
  // ...
];
```

All fed into `useState`. No Supabase hook is imported or called anywhere in `Infohub.tsx`.

---

## Logic Rules Are Not Enforced in the Kiosk Runner
**Status: CONFIRMED**

`Kiosk.tsx`, `ChecklistRunner` component (lines 682–803): iterates questions using a `currentIdx` state. There is no reference to `logicRules`, no evaluation of `LogicComparator`, no conditional question skipping, no trigger execution.

`ChecklistBuilderModal.tsx` stores logic rules in the `sections` JSON:
```typescript
// Example structure in the DB:
{
  "id": "q2",
  "text": "Record fridge temperature",
  "responseType": "number",
  "logicRules": [ { "comparator": "gt", "value": "8", "triggers": [{ "type": "require_action" }] } ]
}
```

The runner reads `checklist.questions` and `answers` but never touches `logicRules`. **Logic rules are write-only data** — they exist in the DB but are never read during execution.

---

## Drag-to-Reorder Is Not Persisted
**Status: CONFIRMED**

`ChecklistsTab.tsx`, comment on line 47:
```typescript
// Local drag-drop order state (visual only — no DB ordering column yet)
const [folderOrder, setFolderOrder] = useState<string[]>([]);
```

`moveFolderInList` function only calls `setFolderOrder()` — no mutation hook is invoked. The `folders` and `checklists` tables have no `order`, `sort_order`, or `position` column. On next page load, the order reverts to `created_at` descending from the Supabase query.

---

## Audit Log Is Not Written To
**Status: CONFIRMED**

Searched all hooks and Admin.tsx for `audit_log` writes:
- `useTeamMembers.ts` — no audit log calls
- `useStaffProfiles.ts` — no audit log calls
- `Admin.tsx` — no calls to `supabase.from("audit_log").insert()`
- No hook file named `useAuditLog.ts` exists

The `audit_log` table exists in the DB and its RLS insert policy (`with check (organization_id = current_org_id())`) is defined, but **nothing in the client codebase ever writes to it**. The audit log tab in Admin.tsx reads a static mock array from `admin-repository.ts`.

Exact Admin.tsx read source (line 1293):
```typescript
auditLog={auditLog}  // prop from state initialized as: const [auditLog] = useState(initialAuditLog)
```

`initialAuditLog` is a 6-entry mock array in `admin-repository.ts`.

---

## Stripe Is Only Structurally Implemented
**Status: CONFIRMED**

`Billing.tsx`, `PRICE_IDS` object, lines 24–32:
```typescript
const PRICE_IDS: Record<Plan, Record<"monthly" | "annual", string>> = {
  solo: { monthly: "", annual: "" },
  pro: {
    monthly: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY ?? "",
    annual:  import.meta.env.VITE_STRIPE_PRICE_PRO_ANNUAL  ?? "",
  },
  enterprise: {
    monthly: import.meta.env.VITE_STRIPE_PRICE_ENT_MONTHLY ?? "",
    annual:  import.meta.env.VITE_STRIPE_PRICE_ENT_ANNUAL  ?? "",
  },
};
```

`.env.local` does not contain any `VITE_STRIPE_PRICE_*` keys. When missing, `import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY` resolves to `undefined`, which falls through to `""`.

`handleUpgrade` in `Billing.tsx`, lines 76–82:
```typescript
const priceId = PRICE_IDS[targetPlan][billing];
if (!priceId) {
  setError("Stripe Price ID is not configured yet. Please add it to .env.local and redeploy.");
  return;
}
```

This guard means clicking "Upgrade to Pro" currently shows an error message immediately without calling any edge function. The edge function code itself is correct and complete — it just needs real Stripe keys.

`stripe-webhook/index.ts`, line 24, `planFromMetadata()`:
```typescript
function planFromMetadata(metadata: Record<string, string>): string {
  return metadata?.olia_plan ?? "pro";
}
```

**Partial risk:** If Stripe product metadata does not include `olia_plan`, all subscriptions default to `"pro"` plan. Enterprise customers would receive Pro plan access instead. A comment in the file acknowledges: `// TBD: set these in Stripe product metadata as olia_plan = "pro" etc.`

---

## 95% Coverage Exists and What It Actually Covers
**Status: PARTIALLY CONFIRMED (coverage is real but mostly render coverage)**

Coverage threshold is real and enforced (`vitest.config.ts`, `thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 }`). All four metrics pass `bun run test:ci`.

However, the coverage is misleadingly high because:

1. **All Supabase mutations are mocked with `vi.fn()`** — calling `mutate()` executes nothing; the line is "covered" but the logic is not.

2. **PIN validation mock** (`Kiosk.test.tsx`, line 37):
```typescript
rpc: vi.fn().mockResolvedValue({ data: [], error: null })
```
Every PIN entered in tests returns "no match" — the happy path (valid PIN → checklist runner) is never executed in tests.

3. **Admin mutation mocks** (`Admin.test.tsx`, lines 73–91):
```typescript
useSaveStaffProfile: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
useArchiveStaffProfile: () => ({ mutate: vi.fn() }),
```
All `mutate` calls are no-ops. The 50 Admin tests verify UI rendering and modal behavior, but zero data operations are validated.

---

# 2. Security and Permission Audit

## Issue 1: Staff PINs Readable by Anonymous Clients
**Severity: CRITICAL**

**Exact risk:** Any person with the Supabase URL and public anon key (both visible in `.env.local` which is checked into the repository) can execute:
```
GET https://xdhejmnjhjlgcboawmnu.supabase.co/rest/v1/staff_profiles?select=*
Authorization: Bearer <VITE_SUPABASE_ANON_KEY>
```
And receive a JSON response containing every staff member's name, location, role, status, and **plaintext 4-digit PIN** for every organization in the database.

**Exact RLS policy** (`migrations/...sql`, line 207–208):
```sql
create policy "staff_profiles_read" on staff_profiles for select
  using (true);
```

**Exact select in `useStaffProfiles.ts`** (line 10):
```typescript
.select("id, location_id, first_name, last_name, role, status, pin, last_used_at, archived_at, created_at")
```

**Exploit scenario:** Attacker discovers the Supabase URL (in `.env.local` in the repo, or via browser network tab), issues a single REST API GET with the anon key, dumps all staff PINs across all orgs, and can authenticate as any staff member on any kiosk.

**Recommended fix:**
1. Remove `pin` from the `staff_profiles_read` select in `useStaffProfiles.ts` — Admin doesn't need to display the PIN after creation
2. Change RLS to restrict anonymous reads to only non-sensitive columns, or scope to `location_id` equality provided as a parameter
3. Hash PINs on insert: `pin: await crypto.subtle.digest("SHA-256", ...)`, update `validate_staff_pin()` to hash `p_pin` before comparing
4. Rotate/invalidate the existing seed PINs

---

## Issue 2: Checklist Log Injection by Anonymous Users
**Severity: HIGH**

**Exact RLS policy** (`migrations/...sql`, line 227–229):
```sql
create policy "logs_insert" on checklist_logs for insert
  with check (true);
```

**Exact risk:** Any anonymous client can insert a checklist log with any `organization_id`, including for organizations they don't belong to. This allows:
- Spam pollution of other organizations' compliance data
- Fake completion logs to manipulate scores
- Volume attacks to inflate the database

**Exploit scenario:** POST to `checklist_logs` with `organization_id: "00000000-0000-0000-0000-000000000001"` (the demo org UUID visible in seed data), creating fake 100%-score completion records.

**Recommended fix:** Change `with check (true)` to validate the `organization_id` against the location's organization. Since kiosk is anon, a function-based check is needed:
```sql
create policy "logs_insert" on checklist_logs for insert
  with check (
    organization_id IN (
      SELECT organization_id FROM locations WHERE id = (
        SELECT location_id FROM staff_profiles WHERE id = staff_profile_id
      )
    )
  );
```
Or pass organization_id through the `validate_staff_pin()` RPC and validate in the edge function.

---

## Issue 3: Manager Permissions Are Client-Side Only
**Severity: HIGH**

**Exact risk:** Manager permissions (8 flags in `permissions` JSONB column) are checked only in React components. No Supabase RLS policy restricts what a Manager can do based on their permission flags.

**Evidence:** The `team_members` RLS policy (`migrations/...sql`, line 204):
```sql
create policy "team_members_all" on team_members for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());
```

This allows **any authenticated team member** to insert/update/delete any row in their org, regardless of their `permissions` field.

**Exploit scenario:** A Manager with `"manage_staff_profiles": false` can directly call `supabase.from("staff_profiles").delete()` and delete any staff profile in their org. The UI hides the button, but the API call succeeds.

**Recommended fix:** Add RLS helper functions that check the current user's permission flags:
```sql
create function has_permission(perm text) returns boolean as $$
  select coalesce((permissions->>perm)::boolean, false)
  from team_members where id = auth.uid()
$$ language sql security definer stable;
```
Then add granular policies:
```sql
create policy "staff_profiles_write_permitted" on staff_profiles for insert
  with check (organization_id = current_org_id() AND has_permission('manage_staff_profiles'));
```

---

## Issue 4: Plan Limits Enforced Only in UI
**Severity: HIGH**

**Exact risk:** The Solo plan limits (`maxLocations: 1`, `maxStaff: 15`, `maxChecklists: 10`) are checked only via `usePlan().withinLimit()` in React components. No RLS policy or edge function enforces them.

**Evidence** (`usePlan.ts`, lines 43–58):
```typescript
function withinLimit(feature: "maxLocations" | "maxStaff" | "maxChecklists", count: number): boolean {
  const limit = features[feature] as number;
  return limit === -1 || count < limit;
}
```

This is a client-side check. A developer console call to `supabase.from("locations").insert(...)` bypasses it entirely.

**Recommended fix:** Add server-side count validation in an edge function before allowing insert, or add a PostgreSQL trigger that counts and rejects inserts exceeding plan limits.

---

## Issue 5: No Rate Limiting on PIN Validation
**Severity: MEDIUM**

**Exact risk:** The 3-attempt lockout is tracked in React component state (`useState`). It is reset on page refresh. An attacker can refresh the page between attempts and enumerate all 10,000 possible PINs for a known location.

**Evidence** (`Kiosk.tsx`, lines 424–443):
```typescript
const [attempts, setAttempts]       = useState(0);
const [lockedUntil, setLockedUntil] = useState<number | null>(null);
const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
```

All state is component-local. No server-side attempt tracking exists.

**Recommended fix:** Track attempts in the Supabase `staff_profiles` table (add `pin_attempts` and `pin_locked_until` columns), check in `validate_staff_pin()`, and reset on successful login.

---

## Issue 6: Supabase Keys Committed to Repository
**Severity: MEDIUM (depends on repo visibility)**

`.env.local` containing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` is checked into the repository. If the repo is ever made public or shared, the anon key is exposed. Combined with Issue 1, this enables complete staff PIN extraction.

**Recommended fix:** Add `.env.local` to `.gitignore`. Create `.env.example` with placeholder values. Rotate the anon key after removing from version history.

---

## Issue 7: `current_org_id()` Returns NULL for Anonymous Users
**Severity: LOW (by design, but creates confusion)**

**Exact behavior:** For anonymous requests, `auth.uid()` is `null`, `current_org_id()` returns `null`, and any policy `using (organization_id = current_org_id())` evaluates to `organization_id = NULL`, which is always `FALSE` in SQL. This is correct behavior — anon users can't read org-scoped data.

**Risk:** This is by design, but it means the "Allow anon insert on checklist_logs" and "Allow anon read on staff_profiles" policies are the only two intentional anonymous access points, and they are both problematic (see Issues 1 and 2).

---

## Org Tenancy Isolation Summary

| Table | Select | Insert | Update | Delete | Anon Access |
|-------|--------|--------|--------|--------|-------------|
| organizations | org-scoped | blocked | org-scoped | blocked | none |
| locations | org-scoped | org-scoped | org-scoped | org-scoped | none |
| team_members | org-scoped | org-scoped | org-scoped | org-scoped | none |
| **staff_profiles** | **ALL** (`true`) | org-scoped | org-scoped | org-scoped | **reads all** |
| folders | org-scoped | org-scoped | org-scoped | org-scoped | none |
| checklists | org-scoped | org-scoped | org-scoped | org-scoped | none |
| **checklist_logs** | org-scoped | **ALL** (`true`) | blocked | org-scoped | **inserts any** |
| actions | org-scoped | org-scoped | org-scoped | org-scoped | none |
| alerts | org-scoped | org-scoped | org-scoped | org-scoped | none |
| audit_log | org-scoped | org-scoped | blocked | blocked | none |

Two tables have critical anon exposure. All others are correctly isolated.

---

# 3. Kiosk Reliability Audit

## Checklist Loading
**Launch blocker: YES**

As confirmed above, checklists are hardcoded in `KIOSK_CHECKLISTS` and filtered by hardcoded location UUIDs. This works only for the seeded demo org because the seed data creates locations with matching UUIDs. Any customer who creates their own locations through the Admin panel will see an empty checklist grid on the kiosk, because their location UUIDs won't match the hardcoded ones.

---

## PIN Flow
**Launch blocker: NO (functional, with security caveats)**

The flow works: auto-submit after 4 digits → RPC call → success transitions to runner, failure increments attempts → 3 failures → 30s lockout. The lockout is client-side state only (refresh bypasses it). The RPC is `SECURITY DEFINER` so it correctly bypasses RLS for PIN lookup.

**Edge case:** If the RPC errors (network failure, timeout), `rpcError` is truthy, and the code increments `newAttempts` as if it were a wrong PIN:
```typescript
if (!rpcError && data && data.length > 0) {
  // success
}
const newAttempts = attempts + 1;  // runs on both wrong PIN and network error
```
A network glitch during PIN entry locks the user out after 3 network errors. No distinction between "wrong PIN" and "network failure" is communicated to the user.

---

## Submission Handling
**Launch blocker: YES**

`Kiosk.tsx`, `handleComplete`, lines 906–910:
```typescript
await supabase.from("checklist_logs").insert({
  organization_id: selectedOrgId,
  checklist_title: selectedChecklist.title,
  // ...
});
// No try/catch. No .catch(). No error handling.
```

If this insert fails (network error, Supabase down, RLS rejection), the user sees the success screen and walks away. The submission is lost permanently — no retry, no local queue, no error message.

**Additionally:** `selectedOrgId` is populated from the `validate_staff_pin()` RPC response (`staff.organization_id`). If the RPC returns a null `organization_id`, the log insert will fail silently because the `organization_id` column is `not null`. This is a data integrity gap.

---

## Duplicate Submission Risk
**Launch blocker: NO (minor)**

After completion, the user returns to the grid and can immediately select the same checklist and submit again. No duplicate detection exists. This will create multiple `checklist_logs` entries with the same `checklist_title`, `staff_profile_id`, and similar timestamps. The reporting tab will count each submission separately, inflating completion counts.

---

## Score Calculation
**Launch blocker: NO (but misleading)**

`Kiosk.tsx`, score formula, line 899:
```typescript
const answered = Object.values(answers).filter(v => v !== undefined && v !== "" && v !== null).length;
const score = questions.length > 0 ? Math.round((answered / questions.length) * 100) : 100;
```

**Issues:**
- `instruction` type questions increment the denominator but have no answer — a checklist with 5 checkbox questions and 2 instruction blocks scores at most 71% (5/7) even if all real questions are answered
- Numeric `0` is filtered out as falsy (number zero is not `undefined`, `""`, or `null` — actually this is fine, `0 !== undefined && 0 !== "" && 0 !== null` — **on second look, `0` DOES pass this filter**). Temperature reading of `0°C` would be counted as answered. Correct.
- An empty string answer (`""`) is counted as unanswered. If a `text` question is intentionally left blank, it reduces the score. This may or may not be the intended behavior.
- `instruction` blocks: their `id` is never set as a key in `answers` since `InstructionBlock` doesn't call `onChange`. They add to `questions.length` but never to `answered`. This definitively means instruction-heavy checklists will score lower than intended.

---

## Logic Rule Execution
**Launch blocker: NO (feature gap, not a crash)**

Logic rules are stored in the DB but never evaluated. The runner simply displays all questions in order. Users who build conditional logic in the builder will not see it enforced in the kiosk.

---

## Offline Behavior
**Launch blocker: YES (for production kiosk)**

Zero offline support. If the tablet loses WiFi:
- Location list fails to load (falls back to `MOCK_LOCATIONS`)
- PIN validation fails (RPC call fails) — user sees incorrect error
- Checklist submission is lost silently

For an unattended kiosk tablet in a kitchen or bar, reliable WiFi cannot be assumed. This is a production blocker for any real deployment.

---

## State Reset
**Launch blocker: NO**

Inactivity reset (80s + 10s countdown) calls `handleReset()` which sets `screen("setup")` and clears all running state. The module-level `_kioskLocationId` persists, so after reset the kiosk returns to the grid (not setup) if a location was previously selected — this is correct behavior.

---

# 4. Schedule and Data Correctness Audit

## How Schedules Are Stored

In the **kiosk**, "schedule" is a property on hardcoded `KioskChecklist` objects:
```typescript
time_of_day: "morning" | "afternoon" | "evening" | "anytime"
```
This is not stored in the database — it only exists in the `KIOSK_CHECKLISTS` constant.

In the **checklist builder** (what managers create), schedules are stored in `checklists.schedule` as JSONB:
```typescript
export type ScheduleType = "daily" | "weekday" | "weekly" | "monthly" | "yearly" | "custom" | "none";
```

The seed data stores it as a JSON string: `'"daily"'::jsonb`.

`CustomRecurrence` interface (`checklists/types.ts`, lines 90–97):
```typescript
export interface CustomRecurrence {
  interval: number;
  unit: "day" | "week" | "month" | "year";
  weekDays: string[];
  ends: "never" | "on" | "after";
  endDate?: string;
  occurrences?: number;
}
```

## How "Today's Checklist" Is Determined

For the **kiosk**: `getCurrentTimeOfDay()` maps current hour to `"morning"` (before 12), `"afternoon"` (12–17), `"evening"` (17+). Checklists are filtered by `time_of_day` matching this string.

**The `schedule` JSONB field in the DB is never read by the kiosk.** There is no code that queries checklists and applies `ScheduleType` logic to determine which are due today.

For **Reporting**: `useChecklistLogs()` is called with a date range (`from`, `to`). Whether a checklist was "due" is not evaluated — only whether it was submitted.

**Conclusion:** There is no "today's checklist" determination logic. The kiosk grid is entirely hardcoded. The DB schedule field is purely informational/display text.

## How Overdue Status Is Determined

It isn't. `Dashboard.tsx` has a hardcoded `overdueTasks` array. There is no query that evaluates `checklists.schedule` against `checklist_logs.created_at` to determine what was due and not submitted.

## Timezone Handling

`Kiosk.tsx`, `getCurrentTimeOfDay()`:
```typescript
function getCurrentTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  // ...
}
```

`new Date().getHours()` uses the browser's local timezone. No timezone offset, no UTC conversion.

`useChecklistLogs.ts`, date filter (lines 36–37):
```typescript
if (filters?.from) q = q.gte("created_at", filters.from);
if (filters?.to) q = q.lte("created_at", filters.to);
```

`created_at` in Supabase is `timestamptz` (UTC). The `filters.from/to` strings come from `ReportingTab.tsx` date range logic. If the client constructs these as local-time ISO strings without timezone offset, the comparison will be against UTC timestamps, causing up to ±12 hours of skew. Needs verification of how `from`/`to` strings are generated in `ReportingTab.tsx`.

## Production Safety Assessment

The scheduling system is **not production-safe**:
- The kiosk does not load real checklists from the database
- Schedule fields in the DB serve no functional purpose in the current implementation
- "Overdue" is hardcoded mock data
- There is no engine that evaluates "what should have been submitted today"

---

# 5. Billing and Entitlement Audit

## Checkout Session Creation

`Billing.tsx` → `supabase.functions.invoke("create-checkout-session")` → edge function.

**What is real:**
- Edge function `create-checkout-session/index.ts` is complete, correct code
- Verifies JWT (checks Authorization header)
- Fetches team member's org from DB using service role key
- Creates/reuses Stripe customer
- Creates Stripe checkout session
- Returns `{ url }` for redirect

**What can break:**

1. **Missing price IDs:** `VITE_STRIPE_PRICE_*` not set in `.env.local`. `handleUpgrade` will show an error immediately (line 78–82) without calling the edge function. **Currently non-functional.**

2. **Missing Supabase secrets:** `STRIPE_SECRET_KEY` is `Deno.env.get("STRIPE_SECRET_KEY")!` — the `!` means it will throw if missing. The edge function will return 500.

3. **Silent success without URL:** If `data.url` is undefined but `data.error` is also falsy (e.g., unexpected Stripe response), the redirect never happens, no error is shown. The loading spinner clears and nothing happens.

## Webhook Handling

`stripe-webhook/index.ts` handles 5 events correctly. **Critical gap:**

`planFromMetadata()`:
```typescript
function planFromMetadata(metadata: Record<string, string>): string {
  return metadata?.olia_plan ?? "pro";
}
```

If Stripe product metadata does not include `olia_plan`, all subscriptions — including Enterprise purchases — will be set to `"pro"`. This is a misconfiguration risk, not a code bug.

**Idempotency:** The webhook does not check for duplicate events. If Stripe retries a webhook (which it does on 2xx non-200 responses), the `organization.update` will run multiple times. Since it's setting the same values, this is safe in practice but not explicitly handled.

## Plan Persistence

`usePlan.ts` queries `organizations.plan` and `organizations.plan_status`. These are set by the webhook. If the webhook is not configured in Stripe Dashboard (which it isn't currently), plan will never update from the default `"pro"/"trialing"` seed data values.

**Current state of the demo org** (from seed data):
```sql
insert into organizations (id, name, plan, plan_status)
values ('00000000-0000-0000-0000-000000000001', 'Olia Demo Restaurant Group', 'pro', 'active')
```

The demo org is already on `"pro"/"active"`. This means `usePlan().isActive` is `true` and all Pro features show as enabled in the UI — **masking the fact that feature gating is untested for Solo plan users**.

## Feature Gating

`UpgradePrompt.tsx` wraps Pro-only features (AI Builder, File Convert) in the Checklists module. It checks `usePlan().can("aiBuilder")`. Since the demo org is Pro-active, these features are never gated in normal use.

**No server-side gating exists** — the edge function `generate-checklist` does not verify the org's plan before generating a checklist. A Solo user who calls the function directly bypasses the plan check.

---

# 6. Test Quality Audit

## Critical Behaviors Truly Tested

| Behavior | Evidence |
|----------|----------|
| `cn()` utility merges classes correctly | `utils.test.ts` — 8 meaningful assertions, no mocks |
| `alerts-store` pub/sub emits changes | `alerts-store.test.ts` — tests add, remove, clear, subscribe pattern |
| `generatePin()` returns 4-digit strings | `admin-repository.test.ts` — validates format |
| `daysAgo()` calculates relative dates | `admin-repository.test.ts` — date math tested |
| `plan-features` matrix is correctly defined | `plan-features.test.ts` — validates per-plan feature flags |
| PDF/CSV export functions are callable | `export-utils.test.ts` — mocked jsPDF, tests invocations |
| `BottomNav` highlights active route | `BottomNav.test.tsx` — checks `bg-sage` on active item |
| `ProtectedRoute` redirects to /kiosk | `ProtectedRoute.test.tsx` — tests unauthenticated redirect |
| Billing page renders plan cards | `Billing.test.tsx` — renders and checks plan names |
| Notifications empty state and dismiss | `Notifications.test.tsx` — tests alert list + buttons |
| Checklist builder title validation | `ChecklistBuilderModal.test.tsx` — tests empty title rejection |
| Recurrence picker options | `CustomRecurrencePicker.test.tsx` — tests day/week/month options |

## Critical Behaviors Only Mocked (Not Truly Tested)

| Behavior | Mock Evidence | Risk |
|----------|---------------|------|
| PIN validates against Supabase | RPC always returns `{ data: [], error: null }` | Broken RPC would pass tests |
| Admin login succeeds | `signInWithPassword` always returns `{ session: {...} }` | Auth failures not tested |
| Checklist saves to DB | `useSaveChecklist: () => ({ mutate: vi.fn() })` | Wrong payload would pass |
| Staff profile PIN saved correctly | Mutation is a no-op `vi.fn()` | Plaintext vs hash not tested |
| Drag-to-reorder calls any mutation | No mutation hook in drag handlers | Persistence bug invisible to tests |
| Stripe checkout redirects | `supabase.functions.invoke` is mocked | Edge function errors untested |
| Plan gating blocks access | `usePlan` mocked to return whatever the test needs | Actual gating logic untested |

## Production-Critical Paths Effectively Untested

1. **Full PIN validation → runner → submission sequence** — The happy path of a staff member entering a correct PIN and completing a checklist is never tested end-to-end. The runner component is not tested at all in the unit test suite.

2. **Checklist submission payload correctness** — The `answers` array structure, `organization_id` value, `score` calculation, and field mapping written to `checklist_logs` are never verified in any test.

3. **Real Supabase mutations** — No test calls a real Supabase instance. Every mutation is mocked. Data integrity (required fields, FK constraints, RLS behavior) is completely untested.

4. **Auth session lifecycle** — Login, token refresh, session expiry, and logout flows are not tested. The `onAuthStateChange` listener in `AuthContext` is not exercised.

5. **Edge functions** — `generate-checklist`, `create-checkout-session`, `stripe-webhook` have zero tests. An error in any of them is invisible to the CI pipeline.

6. **Dashboard data integration** — There are no tests that verify what happens when Supabase returns real compliance data to the Dashboard. The component is tested only with hardcoded mock constants.

## Top 10 Missing Tests (Highest Confidence Value)

1. **Kiosk: Valid PIN → runner transition** — Mock RPC to return a valid staff profile, verify runner renders with correct checklist
2. **Kiosk: Submission payload** — After completing a checklist, assert `supabase.from("checklist_logs").insert` was called with correct `organization_id`, `score`, and `answers` structure
3. **Kiosk: Submission failure** — Mock Supabase insert to throw, verify user sees an error or retry prompt (currently would be silent)
4. **Kiosk: Instruction questions excluded from score** — Render a checklist with instruction + checkbox questions, answer only the checkbox, verify score is 100% not 50%
5. **Admin: PIN written to DB as plaintext** — Trigger `useSaveStaffProfile` with a PIN, assert the mutation payload's `pin` field matches the raw input
6. **Billing: Stripe checkout with missing price ID** — Assert the error message is shown when `VITE_STRIPE_PRICE_*` is empty
7. **Billing: Edge function network failure** — Mock `supabase.functions.invoke` to throw, assert error message is shown to user
8. **ReportingTab: Date range filtering** — Assert `useChecklistLogs` is called with correct `from`/`to` ISO strings when period tabs are clicked
9. **usePlan: Solo plan blocks Pro features** — Set org plan to `"solo"`, assert `can("aiBuilder")` is `false` and `UpgradePrompt` renders
10. **ChecklistsTab: Drag-to-reorder does NOT call useSaveFolder** — Assert that no mutation is triggered after a drag-drop operation (documents the known limitation explicitly)

---

# 7. Revised Launch Readiness Assessment

## Verdict: **NOT LAUNCHABLE**

### Why

The app cannot go live as-is for four independent reasons, any one of which would be disqualifying:

**1. Active security vulnerability (no mitigation needed to exploit):** Anonymous clients can read all staff PINs for all organizations using nothing but the public anon key. The anon key is visible in the repository. This isn't a theoretical risk — it requires a single HTTP GET request. A malicious actor could impersonate any staff member on any kiosk.

**2. Primary user flow uses hardcoded data:** The kiosk checklist grid is hardcoded with fixed location UUIDs. Any customer who creates their own locations through the Admin panel will see an empty kiosk grid. The product's core workflow — staff completing daily checklists — does not work for new customers.

**3. Manager landing screen is entirely fake:** The Dashboard, which managers see after login, shows "Sarah" as the user name and mock compliance data. A real manager logging in sees data that isn't theirs. This alone makes the product unsuitable for any customer use.

**4. Submissions can silently fail:** The kiosk's `checklist_logs` insert has no error handling. In any environment with intermittent connectivity (which is all hospitality venues), submitted checklists will be silently discarded. Staff will believe their work was recorded. It wasn't.

### What It Is Good For

This codebase is in excellent shape as a **demo/prototype**:
- The UI is polished and the UX flows make sense
- The data model is correct and well-normalized
- The checklist builder, AI generation, Stripe edge functions, and admin panel are all solid work
- 95% test coverage provides good regression protection once real integration is added
- 10 Maestro E2E flows verify the visual product experience

With approximately 2–3 weeks of focused engineering, it could reach **pilot-ready** status.

---

# 8. Actionable Change Requests

---

## CR-01: Fix Anonymous Staff PIN Exposure
**Objective:** Prevent anonymous clients from reading staff PINs via the REST API.

**Files involved:**
- `supabase/migrations/` — new migration file
- `src/hooks/useStaffProfiles.ts`

**Why it matters:** Current RLS allows any person with the anon key to dump all staff PINs across all organizations. The anon key is in the repository.

**Constraints to preserve:** The kiosk must still be able to validate PINs. The Admin page must still display staff members (but not their PINs after creation).

**Implementation direction:**
1. Write a new migration that changes the `staff_profiles_read` policy from `using (true)` to `using (organization_id = current_org_id())`. This restricts reads to authenticated managers only.
2. Remove `pin` from the `.select()` in `useStaffProfiles.ts` — the Admin page should never display the PIN after it is set.
3. The `validate_staff_pin()` RPC function already uses `SECURITY DEFINER` and bypasses RLS, so kiosk PIN validation continues to work.
4. Update the seed data and any test fixtures that rely on reading the `pin` column directly.

---

## CR-02: Hash Staff PINs at Rest
**Objective:** Ensure PINs are not stored as plaintext in the database.

**Files involved:**
- `supabase/migrations/` — new migration + updated `validate_staff_pin()` function
- `src/pages/Admin.tsx` — PIN generation and save
- `src/hooks/useStaffProfiles.ts` — mutation payload
- `src/lib/admin-repository.ts` — `generatePin()` (no change needed here)

**Why it matters:** Even after CR-01 restricts access, defense in depth requires hashing. A DB backup, SQL injection, or future policy misconfiguration would expose plaintext PINs.

**Constraints to preserve:** The kiosk PIN entry UX (user types 4 digits) must remain unchanged.

**Implementation direction:**
1. In `Admin.tsx`, before calling `saveSP.mutate(sp)`, hash the PIN using the Web Crypto API: `const hashed = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin)))).map(b => b.toString(16).padStart(2, '0')).join('');`
2. Pass `pin: hashed` to the mutation.
3. Update `validate_staff_pin()` in a new migration to hash `p_pin` before comparing: `where sp.pin = encode(digest(p_pin, 'sha256'), 'hex')` (requires `pgcrypto` extension).
4. Migrate existing seed PINs to their hashed equivalents in the migration.
5. The `hashPin()` function that already exists in `admin-repository.ts` is a stub — use the crypto.subtle approach instead since this is a browser environment.

---

## CR-03: Restrict Anonymous Checklist Log Inserts
**Objective:** Prevent anonymous clients from inserting fake logs for any organization.

**Files involved:**
- `supabase/migrations/` — new migration

**Why it matters:** Current `with check (true)` allows log injection into any org's compliance history.

**Constraints to preserve:** The kiosk (anonymous) must still be able to submit logs after a valid PIN entry. The `organization_id` passed in the insert comes from the `validate_staff_pin()` RPC response.

**Implementation direction:**
Write a new migration:
```sql
-- Replace with check (true) with org validation via the staff profile
create policy "logs_insert" on checklist_logs for insert
  with check (
    organization_id = (
      select organization_id from staff_profiles where id = staff_profile_id
    )
  );
```
This ensures the `organization_id` in the log matches the staff member's org, preventing cross-org injection while still allowing anonymous inserts.

---

## CR-04: Wire Kiosk to Real Checklists from Database
**Objective:** Replace the `KIOSK_CHECKLISTS` hardcoded constant with a live Supabase query.

**Files involved:**
- `src/pages/Kiosk.tsx`
- `src/hooks/useChecklists.ts` — possibly add a `useKioskChecklists(locationId)` variant

**Why it matters:** Any customer using the Admin panel to create checklists will see an empty kiosk grid. The product's core workflow is broken for all non-demo customers.

**Constraints to preserve:** Kiosk is unauthenticated (anon key). The `checklists` RLS policy is org-scoped, which requires an authenticated user. Solution: either pass `location_id` and use the locations table to derive org (if you make checklists readable by anon given a valid location_id), or use an RPC function similar to `validate_staff_pin`.

**Implementation direction:**
1. Create a `get_kiosk_checklists(p_location_id uuid)` Supabase function with `SECURITY DEFINER` that returns checklists for a location without requiring auth.
2. In `Kiosk.tsx`, after `setScreen("grid")`, call `supabase.rpc("get_kiosk_checklists", { p_location_id: locationId })`.
3. Map the returned data to the `KioskChecklist` interface.
4. Time-of-day filtering stays client-side using `getCurrentTimeOfDay()` — but consider adding a `schedule` field to the RPC response so the kiosk can filter by actual schedule type, not just time-of-day label.
5. Remove the `KIOSK_CHECKLISTS` constant and `getVisibleChecklists` function.

---

## CR-05: Wire Dashboard to Real Supabase Data
**Objective:** Replace all mock constants in Dashboard with live React Query hooks.

**Files involved:**
- `src/pages/Dashboard.tsx`
- `src/hooks/useChecklistLogs.ts` (already exists)
- `src/hooks/useActions.ts` (already exists)
- `src/hooks/useAlerts.ts` (already exists)
- `src/contexts/AuthContext.tsx` (for user name)

**Why it matters:** The manager's primary screen shows fake data. This makes the product unusable for real customers.

**Implementation direction:**
1. Replace `const currentUser = "Sarah"` with `const { teamMember } = useAuth(); const name = teamMember?.name ?? "there";`
2. Replace `allAlerts` from `alerts-store` with `const { data: allAlerts = [] } = useAlerts();`
3. Replace `allChecklists` mock with a `useChecklistLogs({ from: todayStart, to: todayEnd })` query, transform results into compliance cards
4. Replace `overdueTasks` mock with a `useActions()` query filtered to `status !== "resolved"` and `due < today`
5. Calendar events remain partially mock until an events/scheduling system is built
6. Remove all module-level mock constants
7. Add loading states (skeleton cards) for the async data

---

## CR-06: Unify Alert System — Remove `alerts-store.ts`
**Objective:** Remove the client-side mock alert store and use the Supabase-backed `useAlerts()` hook everywhere.

**Files involved:**
- `src/lib/alerts-store.ts` — delete
- `src/pages/Dashboard.tsx` — replace `useSyncExternalStore(subscribe, getAlerts)` with `useAlerts()`
- `src/test/lib/alerts-store.test.ts` — delete
- Any component importing from `alerts-store`

**Why it matters:** Dashboard uses mock alerts while Notifications uses real Supabase alerts. Two systems create inconsistency and confusion. The mock 5 alerts always appear on Dashboard regardless of real system state.

**Constraints to preserve:** The Notifications page already correctly uses `useAlerts()`. No behavioral change needed there. Dashboard alert count in the stat strip should reflect real alerts.

**Implementation direction:**
1. Search for all imports of `alerts-store` — there are at least 2 (Dashboard, possibly Checklists)
2. Replace `useSyncExternalStore(subscribe, getAlerts)` with `const { data: allAlerts = [] } = useAlerts()`
3. Delete `src/lib/alerts-store.ts` and its test file
4. Seed the `alerts` table with demo data so the demo org has visible alerts

---

## CR-07: Add Error Handling to Kiosk Submission
**Objective:** Prevent silent data loss when `checklist_logs` insert fails.

**Files involved:**
- `src/pages/Kiosk.tsx` — `handleComplete` function

**Why it matters:** Failed submissions show a success screen. Staff walk away believing their checklist was recorded. It wasn't.

**Constraints to preserve:** The completion screen UX (10s auto-dismiss) should be preserved for the happy path.

**Implementation direction:**
```typescript
const handleComplete = async (answers: Record<string, any>) => {
  setScreen("completion");
  // ... score calculation ...
  try {
    const { error } = await supabase.from("checklist_logs").insert({ ... });
    if (error) throw error;
    setSubmissionError(null);
  } catch (err) {
    console.error("Submission failed:", err);
    setSubmissionError("Checklist saved locally. Will sync when connection is restored.");
    // TODO Phase 2: queue to localStorage for retry
  }
};
```
Add a `submissionError` state and display a non-blocking banner on the completion screen. Add a retry button. Log failed submissions to localStorage as a simple queue.

---

## CR-08: Add React Error Boundaries
**Objective:** Prevent unhandled JavaScript errors from showing a white screen.

**Files involved:**
- `src/App.tsx` — wrap each route
- New file: `src/components/ErrorBoundary.tsx`

**Why it matters:** Any uncaught error in any component renders the entire app blank. Users see a white screen with no explanation.

**Implementation direction:**
```typescript
// ErrorBoundary.tsx
class ErrorBoundary extends React.Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return <div className="p-8 text-center"><p>Something went wrong. Please refresh.</p></div>;
    return this.props.children;
  }
}
```
Wrap each `<Route element={...}>` in `App.tsx` with `<ErrorBoundary>`. Optionally send error details to Sentry when configured.

---

## CR-09: Implement Submission Error Handling for Stripe Checkout
**Objective:** Handle the edge case where `data.url` is missing from a successful Stripe edge function response.

**Files involved:**
- `src/pages/Billing.tsx` — `handleUpgrade` function

**Why it matters:** If the edge function returns a 200 with `{ url: undefined }` or any unexpected shape, the redirect silently fails. The loading state clears and nothing happens, with no feedback to the user.

**Constraints to preserve:** Error messages already display correctly for `fnError` and `data.error` cases. Only the `data.url` missing case needs fixing.

**Implementation direction:**
```typescript
if (data?.url) {
  window.location.href = data.url;
} else {
  // This case was previously unhandled
  throw new Error("No checkout URL returned. Please try again or contact support.");
}
```
Add this else-throw after line `if (data?.url) window.location.href = data.url;`.

---

## CR-10: Add Server-Side Plan Enforcement to Edge Functions
**Objective:** Validate the organization's plan before executing AI generation or checkout.

**Files involved:**
- `supabase/functions/generate-checklist/index.ts`
- `supabase/functions/create-checkout-session/index.ts`

**Why it matters:** A Solo plan user can call `generate-checklist` directly (bypassing the React UI plan check) and receive AI-generated content without paying.

**Implementation direction:**
In `generate-checklist/index.ts`, after verifying the JWT:
1. Fetch the calling team member's `organization_id`
2. Query `organizations` to get `plan` and `plan_status`
3. Check if `plan === "solo"` → return 403 `{ error: "AI checklist builder requires Pro plan" }`
4. Wrap this check in a shared utility used by all premium edge functions

---

## CR-11: Add Order Column to Folders and Checklists Tables
**Objective:** Persist drag-to-reorder operations to the database.

**Files involved:**
- `supabase/migrations/` — new migration adding `sort_order integer default 0`
- `src/pages/checklists/ChecklistsTab.tsx` — `moveFolderInList` to call `useSaveFolder` mutation
- `src/hooks/useChecklists.ts` — add `sort_order` to query and mutation

**Why it matters:** Drag-to-reorder is a core UX feature of the checklist manager. Currently, reordered items revert to DB creation order on refresh.

**Constraints to preserve:** The comment in `ChecklistsTab.tsx` says "no DB ordering column yet" — this CR adds that column.

**Implementation direction:**
1. New migration: `ALTER TABLE folders ADD COLUMN sort_order integer default 0; ALTER TABLE checklists ADD COLUMN sort_order integer default 0;`
2. Update `useChecklists.ts` hooks to include `sort_order` in SELECT and pass it in upsert
3. In `moveFolderInList`, after updating local state, fire a batch mutation to update `sort_order` for all affected siblings
4. Update the Supabase query in `useFolders` to `.order("sort_order", { ascending: true })`

---

## CR-12: Build Signup and Onboarding Flow
**Objective:** Allow new customers to create their own organization, location, and owner account.

**Files involved:**
- New page: `src/pages/Signup.tsx`
- New edge function: `supabase/functions/create-organization/index.ts`
- `src/App.tsx` — add `/signup` route

**Why it matters:** Currently the only way to use the app is to be part of the seeded demo org. There is no self-serve signup. The product cannot acquire real customers.

**Implementation direction:**
The signup flow needs to be an edge function (not client-side) because the `organizations` table has no INSERT RLS policy for new users:
1. Edge function `create-organization`: accepts `{ orgName, email, password, locationName }`, creates the org, creates the first location, creates a Supabase Auth user, creates the team_member record as Owner, returns the session
2. `Signup.tsx`: 3-step form (org name → location → owner credentials) → calls edge function → on success, store session and redirect to `/dashboard`
3. Add `/signup` link to the Kiosk `AdminLoginModal` ("New to Olia? Create account")

---

## CR-13: Fix `instruction` Question Type in Score Calculation
**Objective:** Exclude instruction-type questions from the score denominator.

**Files involved:**
- `src/pages/Kiosk.tsx` — `handleComplete` function, score calculation

**Why it matters:** A checklist with 5 real questions and 3 instruction blocks scores a maximum of 62% (5/8), making even a perfectly completed checklist appear non-compliant.

**Implementation direction:**
Change line 899 in `Kiosk.tsx`:
```typescript
// Before:
const answered = Object.values(answers).filter(v => v !== undefined && v !== "" && v !== null).length;
const score = questions.length > 0 ? Math.round((answered / questions.length) * 100) : 100;

// After:
const scoredQuestions = questions.filter(q => q.type !== "instruction");
const answered = scoredQuestions.filter(q => {
  const v = answers[q.id];
  return v !== undefined && v !== "" && v !== null;
}).length;
const score = scoredQuestions.length > 0 ? Math.round((answered / scoredQuestions.length) * 100) : 100;
```

---

## CR-14: Add Submission Retry Queue Using localStorage
**Objective:** Queue failed checklist log submissions and retry when connectivity is restored.

**Files involved:**
- `src/pages/Kiosk.tsx` — `handleComplete`
- New utility: `src/lib/submission-queue.ts`

**Why it matters:** Kiosk tablets in kitchens and bars regularly lose WiFi. Silent submission loss is a production reliability failure. Staff compliance data is the core value of the product.

**Implementation direction:**
1. Create `submission-queue.ts` with `enqueue(payload)`, `dequeue()`, `retryAll()` using `localStorage` as storage
2. In `handleComplete`, on Supabase error, call `enqueue(logPayload)` and set a `submissionQueued` flag
3. Add a `useEffect` in `Kiosk.tsx` that calls `retryAll()` on mount (catches submissions from previous sessions) and when `navigator.onLine` becomes true
4. Display a small persistent badge showing queued submission count if > 0

---

## CR-15: Add Integration Tests for Critical Paths
**Objective:** Replace smoke tests on the 3 most critical production paths with meaningful behavioral tests.

**Files involved:**
- `src/test/pages/Kiosk.test.tsx`
- `src/test/pages/checklists/ChecklistsTab.test.tsx`
- New: `src/test/integration/submission-flow.test.tsx`

**Why it matters:** 95% coverage is largely render coverage. The PIN → runner → submission path, the checklist save payload, and the dashboard data loading path are all effectively untested. A breaking change to any of these would pass CI.

**Implementation direction:**

Test 1 — Kiosk full happy path:
```typescript
it("valid PIN completes full checklist and inserts correct log", async () => {
  // Mock RPC to return valid staff
  supabaseMock.rpc.mockResolvedValue({ data: [{ id: "s1", first_name: "Maria", organization_id: "org1" }], error: null });
  // Mock insert to capture payload
  const insertSpy = vi.fn().mockResolvedValue({ error: null });
  supabaseMock.from.mockReturnValue({ insert: insertSpy });

  // Render, navigate to grid, open PIN modal, enter valid PIN
  // ... assert runner appears ...
  // Click through questions, submit
  // Assert insertSpy called with correct structure:
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
    organization_id: "org1",
    score: expect.any(Number),
    answers: expect.arrayContaining([expect.objectContaining({ label: expect.any(String) })]),
  }));
});
```

Test 2 — Submission failure is visible:
```typescript
it("shows error message when submission fails", async () => {
  supabaseMock.from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: "Connection failed" } }) });
  // Complete checklist
  // Assert error message appears on completion screen
  expect(screen.getByText(/saved locally|sync when/i)).toBeInTheDocument();
});
```
