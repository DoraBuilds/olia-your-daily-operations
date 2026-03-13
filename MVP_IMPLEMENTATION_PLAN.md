# Olia — MVP Implementation Plan
_Lead Engineer Reference Document_

---

## 1. Executive Fix Plan

The codebase has a solid architectural foundation and polished UI. The path to a pilot-ready MVP requires six areas of focused work. None require rewriting the system.

**What needs to happen, in order of severity:**

1. **Security is broken before we start.** Staff PINs are plaintext in the DB and readable by any anonymous client. Checklist logs can be injected by any anonymous request. Manager permissions exist only in React state. All three must be fixed before any customer data enters the system.

2. **The two primary screens show fake data.** The Dashboard shows hardcoded mock arrays. The Kiosk serves hardcoded checklists that only match the demo org's seed UUIDs. Both must be wired to Supabase before any real venue can use the product.

3. **The plan/tier model needs a rename and expansion.** Existing tiers (`solo`/`pro`/`enterprise`) need to become `starter`/`growth`/`enterprise` per the product model. The feature matrix needs to be updated with the new Growth-tier capabilities (Info Hub, Issues, Weather Alerts, Multi-location Analytics, Branded Reporting). Server-side enforcement needs to exist alongside the current client-side checks.

4. **Several MVP features are missing their backend.** The Info Hub (SOP library) has no database tables. The Issues system doesn't exist at all. These are Growth-tier features that need to be built from scratch.

5. **The kiosk submission path has no error handling.** A network error silently discards completed checklists. This is unacceptable for a venue operations product.

6. **Logic rules are stored but never evaluated.** The checklist builder saves conditional logic to the DB. The kiosk runner never reads it. This is a complete feature gap.

---

## 2. Implementation Roadmap

---

### Phase 1 — Security Fixes (Week 1, ~3 days)

**Priority: Must complete before any external access.**

#### Task 1.1 — Hash Staff PINs

**Files:** `supabase/migrations/`, `src/pages/Admin.tsx`, `src/hooks/useStaffProfiles.ts`

**Migration required:**
```sql
-- Enable pgcrypto for SHA-256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Migrate existing plaintext PINs to SHA-256 hashes
UPDATE staff_profiles
SET pin = encode(digest(pin, 'sha256'), 'hex')
WHERE length(pin) <= 6;  -- Only update if looks like plaintext (not already a 64-char hash)

-- Update validate_staff_pin to hash the input before comparing
CREATE OR REPLACE FUNCTION validate_staff_pin(p_pin text, p_location_id uuid)
RETURNS TABLE(id uuid, first_name text, last_name text, role text, organization_id uuid) AS $$
BEGIN
  RETURN QUERY
    SELECT sp.id, sp.first_name, sp.last_name, sp.role, sp.organization_id
    FROM staff_profiles sp
    WHERE sp.pin = encode(digest(p_pin, 'sha256'), 'hex')
      AND sp.location_id = p_location_id
      AND sp.status = 'active'
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Code changes:**
- In `Admin.tsx`, before `saveSP.mutate(sp)`, hash the PIN using Web Crypto API:
  ```typescript
  const hashPin = async (raw: string): Promise<string> => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  };
  // Usage: const hashed = await hashPin(pin); then save hashed
  ```
- Remove `pin` from the `select()` in `useStaffProfiles.ts` — Admin never needs to display the raw PIN after creation
- Remove the dead `hashPin` import from `admin-repository.ts`

**Complexity:** Small. **Risk:** Must migrate existing PINs before changing the validator or existing staff can't log in.

---

#### Task 1.2 — Fix Anonymous RLS Policies

**Files:** `supabase/migrations/`

**Migration required:**
```sql
-- STAFF PROFILES: Restrict reads to authenticated managers only
-- The kiosk uses validate_staff_pin() RPC (SECURITY DEFINER) — it doesn't need direct table access
DROP POLICY IF EXISTS "staff_profiles_read" ON staff_profiles;
CREATE POLICY "staff_profiles_manager_read" ON staff_profiles FOR SELECT
  USING (organization_id = current_org_id());

-- CHECKLIST LOGS: Prevent cross-org log injection
-- Logs can still be inserted by anon (kiosk), but org_id must match the staff member's org
DROP POLICY IF EXISTS "logs_insert" ON checklist_logs;
CREATE POLICY "logs_insert" ON checklist_logs FOR INSERT
  WITH CHECK (
    organization_id = (
      SELECT sp.organization_id FROM staff_profiles sp WHERE sp.id = staff_profile_id
    )
  );
```

**Complexity:** Small. **Risk:** Low — the `validate_staff_pin()` RPC is already SECURITY DEFINER and handles PIN lookups without needing the table policy. No client code changes required for the Kiosk PIN flow.

---

#### Task 1.3 — Server-Side Plan Limit Enforcement

**Files:** `supabase/functions/generate-checklist/index.ts`, new `supabase/functions/_shared/enforce-plan.ts`

Create a shared plan enforcement utility for edge functions:
```typescript
// supabase/functions/_shared/enforce-plan.ts
export async function requirePlan(
  supabase: SupabaseClient,
  userId: string,
  requiredPlan: "growth" | "enterprise"
): Promise<void> {
  const { data: member } = await supabase
    .from("team_members").select("organization_id").eq("id", userId).single();
  const { data: org } = await supabase
    .from("organizations").select("plan, plan_status").eq("id", member.organization_id).single();

  const planOrder = { starter: 0, growth: 1, enterprise: 2 };
  const required = planOrder[requiredPlan] ?? 1;
  const current = planOrder[org.plan] ?? 0;

  if (current < required || !["active", "trialing"].includes(org.plan_status)) {
    throw new Response(JSON.stringify({ error: "Plan upgrade required" }), { status: 403 });
  }
}
```

Apply in `generate-checklist/index.ts` after auth verification. Complexity: Small.

---

#### Task 1.4 — Server-Side Permission Checks for Manager Write Operations

**Files:** `supabase/migrations/`

```sql
-- Helper: check a specific permission for the current user
CREATE OR REPLACE FUNCTION has_permission(perm text) RETURNS boolean AS $$
  SELECT COALESCE((permissions->>perm)::boolean, false)
  FROM team_members WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Staff profiles: write requires manage_staff_profiles permission
DROP POLICY IF EXISTS "staff_profiles_write" ON staff_profiles;
CREATE POLICY "staff_profiles_write" ON staff_profiles FOR INSERT
  WITH CHECK (organization_id = current_org_id() AND has_permission('manage_staff_profiles'));

DROP POLICY IF EXISTS "staff_profiles_update" ON staff_profiles;
CREATE POLICY "staff_profiles_update" ON staff_profiles FOR UPDATE
  USING (organization_id = current_org_id() AND has_permission('manage_staff_profiles'));

DROP POLICY IF EXISTS "staff_profiles_delete" ON staff_profiles;
CREATE POLICY "staff_profiles_delete" ON staff_profiles FOR DELETE
  USING (organization_id = current_org_id() AND has_permission('manage_staff_profiles'));
```

**Complexity:** Small. **Risk:** Verify that the Owner role has `manage_staff_profiles: true` in the seed data before deploying.

---

### Phase 2 — Core Product Functionality (Week 2–3, ~8 days)

#### Task 2.1 — Kiosk: Load Real Checklists from Database

**Files:** `src/pages/Kiosk.tsx`, `supabase/migrations/`

The kiosk is anonymous. The `checklists` table is org-scoped behind RLS. A `SECURITY DEFINER` function is needed to safely serve checklists to the kiosk given only a `location_id`.

**Migration required:**
```sql
-- Kiosk: fetch checklists for a given location
-- Returns checklists + their flattened questions for the kiosk runner
CREATE OR REPLACE FUNCTION get_kiosk_checklists(p_location_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  schedule jsonb,
  sections jsonb,
  questions_count integer
) AS $$
BEGIN
  RETURN QUERY
    SELECT c.id, c.title, c.schedule, c.sections, c.questions_count
    FROM checklists c
    WHERE c.location_id = p_location_id
      AND c.schedule IS NOT NULL
    ORDER BY c.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Code change in `Kiosk.tsx`:**
1. Add `const [liveChecklists, setLiveChecklists] = useState<KioskChecklist[]>([])` and `const [checklistsLoading, setChecklistsLoading] = useState(false)`
2. After `handleSetup()`, call `get_kiosk_checklists(locationId)` via Supabase RPC
3. Map DB response to `KioskChecklist[]` — flatten `sections[].questions[]` into a flat `questions` array, map `schedule` to `time_of_day` using a helper:
   ```typescript
   function scheduleToTimeOfDay(schedule: string): TimeOfDay {
     // "daily" = anytime, "weekday" = anytime, specific time-of-day in schedule config
     if (schedule === "daily" || schedule === "weekday") return "anytime";
     return "anytime"; // default until schedule metadata includes time-of-day
   }
   ```
4. Fall back to `KIOSK_CHECKLISTS` only if RPC returns empty (preserves demo functionality)
5. Delete `KIOSK_CHECKLISTS` constant after confirming real data loads correctly

**Note on schedule-to-time-of-day mapping:** The current `checklists.schedule` is a ScheduleType (when to repeat) not a time-of-day. A `time_of_day` field should be added to the checklists table:
```sql
ALTER TABLE checklists ADD COLUMN time_of_day text DEFAULT 'anytime'
  CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'anytime'));
```
And exposed in the `ChecklistBuilderModal.tsx` with a dropdown.

**Complexity:** Medium. **Risk:** Schedule-to-time-of-day mapping requires a new DB column and UI field.

---

#### Task 2.2 — Dashboard: Replace Mock Data with Real Supabase Queries

**Files:** `src/pages/Dashboard.tsx`, `src/hooks/useChecklistLogs.ts`, `src/hooks/useActions.ts`, `src/hooks/useAlerts.ts`, `src/contexts/AuthContext.tsx`

The mock data in Dashboard.tsx must be replaced with four data sources:

**a) Greeting — use real user name:**
```typescript
const { teamMember } = useAuth();
const firstName = teamMember?.name?.split(" ")[0] ?? "there";
```

**b) Alerts — use Supabase `useAlerts()`:**
```typescript
// Replace: const allAlerts = useSyncExternalStore(subscribe, getAlerts);
const { data: allAlerts = [] } = useAlerts();
```

**c) Compliance grid — use `useChecklistLogs`:**
```typescript
const todayStart = new Date(); todayStart.setHours(0,0,0,0);
const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
const { data: todayLogs = [], isLoading: logsLoading } = useChecklistLogs({
  from: todayStart.toISOString(),
  to: todayEnd.toISOString(),
});
// Transform logs into ChecklistCompliance[] for the score ring grid
const complianceData: ChecklistCompliance[] = todayLogs.map(log => ({
  id: log.id,
  name: log.checklist_title,
  location: log.location_name ?? "—",
  completion: log.score ?? 0,
  totalTasks: log.answers?.length ?? 0,
  completedTasks: log.answers?.filter((a: any) => a.answer).length ?? 0,
  unanswered: log.answers?.filter((a: any) => !a.answer).map((a: any) => a.label) ?? [],
  completedAt: log.created_at,
}));
```

Note: `useChecklistLogs` needs a `location_name` join. Add to the query:
```typescript
.select("id, checklist_id, checklist_title, completed_by, staff_profile_id, score, answers, created_at, staff_profiles(location_id, locations(name))")
```

**d) Overdue tasks — use `useActions()`:**
```typescript
const { data: actions = [] } = useActions();
const overdueTasks = actions.filter(a => a.status !== "resolved" && a.due && new Date(a.due) < new Date());
```

**e) Stat strip numbers:**
```typescript
const completedToday = todayLogs.length;
const activeAlerts = allAlerts.filter(a => !a.dismissed_at).length;
const overdueCount = overdueTasks.length;
```

**f) Calendar — keep as mock for MVP.** Mark with a `// TODO: wire to real events table` comment. The calendar requires a new `events` table which is out of scope for MVP.

**Remove from Dashboard.tsx:** All module-level mock constants (`allChecklists`, `overdueTasks`, `currentUser`, `weekEvents`, `monthEvents`). Remove the import of `getAlerts` and `subscribe` from `alerts-store`.

**Complexity:** Medium. **Risk:** The compliance grid currently shows cards with `unanswered` question arrays. Real logs store `answers` as a JSON array — the transform needs to filter by empty answer values.

---

#### Task 2.3 — Unify Alert System: Remove `alerts-store.ts`

**Files:** `src/lib/alerts-store.ts` (delete), `src/pages/Dashboard.tsx`, `src/test/lib/alerts-store.test.ts` (delete)

After Task 2.2 wires Dashboard to `useAlerts()`, `alerts-store.ts` serves no purpose. Delete the file and its test. Remove all imports. Seed the Supabase `alerts` table with 2-3 demo records for the demo org so the Dashboard doesn't look empty.

**Complexity:** Small. **Risk:** Check all files that import from `alerts-store` before deleting.

---

#### Task 2.4 — Logic Rules: Enforce in Kiosk Runner

**Files:** `src/pages/Kiosk.tsx`

The `ChecklistRunner` component iterates questions with a `currentIdx` state. Logic rules need to be evaluated at answer submission time.

**Implementation approach:**
```typescript
// In ChecklistRunner, after an answer is recorded:
function evaluateLogicRules(question: Question, answer: any): LogicTrigger[] {
  const rules: LogicRule[] = question.config?.logicRules ?? [];
  const triggers: LogicTrigger[] = [];
  for (const rule of rules) {
    if (matchesRule(rule, answer)) {
      triggers.push(...rule.triggers);
    }
  }
  return triggers;
}

function matchesRule(rule: LogicRule, answer: any): boolean {
  const v = String(answer ?? "");
  switch (rule.comparator) {
    case "is": return v === rule.value;
    case "is_not": return v !== rule.value;
    case "gt": return Number(v) > Number(rule.value);
    case "lt": return Number(v) < Number(rule.value);
    case "gte": return Number(v) >= Number(rule.value);
    case "lte": return Number(v) <= Number(rule.value);
    case "eq": return Number(v) === Number(rule.value);
    case "neq": return Number(v) !== Number(rule.value);
    case "between": return Number(v) >= Number(rule.value) && Number(v) <= Number(rule.valueTo ?? rule.value);
    default: return false;
  }
}
```

For each trigger type:
- `require_note` → inject a mandatory follow-up `text` question after the current question
- `require_media` → inject a mandatory `media` question after the current question
- `require_action` → add an entry to a `pendingActions` array, resolved after submission
- `notify` → add a notification payload to submit alongside the log
- `ask_question` → inject a custom question

Track `injectedQuestions` in state. At submission, submit `pendingActions` to the `actions` table.

**Complexity:** Medium. **Risk:** The `media` question type needs file upload capability (currently missing — see Task 2.8).

---

#### Task 2.5 — Info Hub Backend

**Files:** `supabase/migrations/`, new `src/hooks/useInfohub.ts`, `src/pages/Infohub.tsx`

**Migration required:**
```sql
-- SOP documents (the "library" in Infohub)
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  folder_id uuid,  -- self-referencing via documents_folders table below
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid REFERENCES document_folders(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents ADD CONSTRAINT fk_doc_folder
  FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL;

-- Training modules
CREATE TABLE IF NOT EXISTS training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  steps jsonb NOT NULL DEFAULT '[]',  -- TrainingStep[]
  folder_id uuid REFERENCES document_folders(id) ON DELETE SET NULL,
  completed_by uuid[] NOT NULL DEFAULT '{}',  -- staff_profile_ids
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_all" ON documents FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "doc_folders_all" ON document_folders FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "training_all" ON training_modules FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());
```

**Create `src/hooks/useInfohub.ts`** following the same React Query pattern as `useChecklists.ts`:
- `useDocumentFolders()` → `useQuery(["document_folders"])`
- `useDocuments(folderId?)` → `useQuery(["documents", folderId])`
- `useSaveDocument()` → `useMutation` + invalidate
- `useDeleteDocument()` → `useMutation` + invalidate
- `useTrainingModules()`, `useSaveTrainingModule()`

**Wire `Infohub.tsx`:** Replace `useState(initialLibraryFolders)` etc. with hook calls. Keep the current component structure; just swap the data source. Add loading skeletons.

**Gate behind Growth plan:** Wrap the Infohub nav link and route with `can("infoHub")` check (new feature flag — see Phase 3).

**Complexity:** Large. **Risk:** Infohub.tsx is 1,213 lines and will need careful refactoring to accept dynamic data without breaking the existing UI.

---

#### Task 2.6 — Issues System (Growth Feature)

**Files:** `supabase/migrations/`, new `src/hooks/useIssues.ts`, new `src/pages/Issues.tsx`, `src/components/BottomNav.tsx`, `src/App.tsx`

**Migration required:**
```sql
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  checklist_log_id uuid REFERENCES checklist_logs(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium'  -- 'low' | 'medium' | 'high' | 'critical'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  reported_by text,  -- staff name (anon kiosk)
  staff_profile_id uuid REFERENCES staff_profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES team_members(id) ON DELETE SET NULL,
  photo_urls text[] NOT NULL DEFAULT '{}',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

-- Anon (kiosk) can insert issues, managers can read/update
CREATE POLICY "issues_insert" ON issues FOR INSERT WITH CHECK (true);
CREATE POLICY "issues_read" ON issues FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY "issues_update" ON issues FOR UPDATE USING (organization_id = current_org_id());
```

**Storage for issue photos:** Create a `issues` storage bucket in Supabase:
```sql
-- Run in Supabase Storage policy editor
-- Bucket: "issues" (public read, anon insert with size limit)
```

**`useIssues.ts`:** Standard React Query hooks for list, create, update.

**`Issues.tsx`:** Page listing open issues by severity, filter by location, ability to assign/resolve. Accessible from the manager dashboard.

**Kiosk integration:** Add "Report an Issue" button to the Kiosk grid screen (visible to staff after PIN entry or as a separate flow). Staff can flag a problem with a title, description, severity, and optional photo before or after completing a checklist.

**Complexity:** Large. **Risk:** Photo upload requires Supabase Storage bucket setup and media upload handling in the kiosk (camera API or file input).

---

#### Task 2.7 — Fix Score Calculation: Exclude Instruction Questions

**Files:** `src/pages/Kiosk.tsx`

In `handleComplete`, lines 897–899:
```typescript
// Current (broken):
const answered = Object.values(answers).filter(v => v !== undefined && v !== "" && v !== null).length;
const score = questions.length > 0 ? Math.round((answered / questions.length) * 100) : 100;

// Fixed:
const scoredQuestions = questions.filter(q => q.type !== "instruction");
const answered = scoredQuestions.filter(q => {
  const v = answers[q.id];
  return v !== undefined && v !== "" && v !== null;
}).length;
const score = scoredQuestions.length > 0 ? Math.round((answered / scoredQuestions.length) * 100) : 100;
```

**Complexity:** Small. **Risk:** None — pure function change.

---

#### Task 2.8 — Signup / Onboarding Flow

**Files:** new `src/pages/Signup.tsx`, new `supabase/functions/create-organization/index.ts`, `src/App.tsx`

Currently there is no way to create a new organization. The edge function must do the work because `organizations` has no INSERT RLS policy for new users.

**Edge function `create-organization/index.ts`:**
```typescript
// 1. Create Supabase Auth user (email + password)
// 2. Create organization record
// 3. Create first location record
// 4. Create team_member record as Owner (id = auth user id)
// 5. Return session token for immediate login
```

**`Signup.tsx` flow:**
1. Step 1: "What's your business name?" (org name + first location name)
2. Step 2: "Create your account" (email + password)
3. On submit → call edge function → receive session → `supabase.auth.setSession()` → redirect to `/dashboard`

Add `/signup` route to `App.tsx`. Add "New to Olia? Create account" link to `AdminLoginModal` in `Kiosk.tsx`.

**Complexity:** Medium. **Risk:** Auth state must be correctly set after programmatic session creation.

---

#### Task 2.9 — Stripe: Configure Real Keys and Billing Portal URL

**Files:** `.env.local`, `src/pages/Billing.tsx`, `supabase/functions/create-checkout-session/`, `supabase/functions/stripe-webhook/`

**Action items:**
1. Create Stripe account. Create 4 products (Growth Monthly, Growth Annual, Enterprise Monthly, Enterprise Annual).
2. Add metadata to each Stripe product: `olia_plan = "growth"` or `"enterprise"`.
3. Add price IDs to `.env.local`: `VITE_STRIPE_PRICE_GROWTH_MONTHLY`, etc.
4. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Supabase edge function secrets.
5. Replace the hardcoded `https://billing.stripe.com/p/login/test_00000` in `Billing.tsx` with the real Stripe Customer Portal URL.
6. Register the webhook endpoint in Stripe Dashboard pointing to the deployed edge function URL.

**Complexity:** Small (config-only). **Risk:** Must test the full checkout → webhook → plan update cycle in Stripe test mode before go-live.

---

### Phase 3 — Tier Enforcement (Week 3, ~3 days)

#### Task 3.1 — Rename Plans: Solo → Starter, Pro → Growth

**Files:** `src/lib/plan-features.ts`, `src/pages/Billing.tsx`, `src/hooks/usePlan.ts`, `src/contexts/AuthContext.tsx`, `supabase/migrations/`

The `Plan` type in `plan-features.ts` must change from `"solo" | "pro" | "enterprise"` to `"starter" | "growth" | "enterprise"`.

**Migration:**
```sql
-- Update existing records
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;
UPDATE organizations SET plan = 'starter' WHERE plan = 'solo';
UPDATE organizations SET plan = 'growth' WHERE plan = 'pro';
ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('starter', 'growth', 'enterprise'));
```

**Code:** Global find-and-replace `"solo"` → `"starter"`, `"pro"` → `"growth"` in all src files (except comments/strings that describe the old naming). Update `PLAN_LABELS`, `PLAN_PRICES`, `PLAN_FEATURES`, `PRICE_IDS` constants.

**Complexity:** Small. **Risk:** Seed data in migration file also uses `'pro'` — update the seed too.

---

#### Task 3.2 — Update Feature Matrix for New Tiers

**Files:** `src/lib/plan-features.ts`

```typescript
export type Plan = "starter" | "growth" | "enterprise";

export interface PlanFeatures {
  maxLocations: number;
  maxStaff: number;
  maxChecklists: number;
  // Starter features
  templates: boolean;
  onboardingMode: boolean;
  basicAnalytics: boolean;
  exportPdf: boolean;
  duplicateChecklist: boolean;
  fridgeTempLog: boolean;
  staffIdentification: boolean;  // name + last initial on kiosk
  // Growth features
  infoHub: boolean;
  multiLocationAnalytics: boolean;
  brandedReporting: boolean;
  issues: boolean;
  weatherAlerts: boolean;
  aiBuilder: boolean;
  fileConvert: boolean;
  exportCsv: boolean;
  aiTranslation: boolean;
  insiderTips: boolean;
  fridgeTempMonitoring: boolean;
  // Enterprise features
  advancedAI: boolean;
  integrations: boolean;
  advancedAnalytics: boolean;
  customReporting: boolean;
  prioritySupport: boolean;
}

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  starter: {
    maxLocations: 1, maxStaff: 15, maxChecklists: 10,
    templates: true, onboardingMode: true, basicAnalytics: true, exportPdf: true,
    duplicateChecklist: true, fridgeTempLog: true, staffIdentification: true,
    // Growth: off
    infoHub: false, multiLocationAnalytics: false, brandedReporting: false,
    issues: false, weatherAlerts: false, aiBuilder: false, fileConvert: false,
    exportCsv: false, aiTranslation: false, insiderTips: false, fridgeTempMonitoring: false,
    // Enterprise: off
    advancedAI: false, integrations: false, advancedAnalytics: false,
    customReporting: false, prioritySupport: false,
  },
  growth: {
    maxLocations: 10, maxStaff: 200, maxChecklists: -1,
    templates: true, onboardingMode: true, basicAnalytics: true, exportPdf: true,
    duplicateChecklist: true, fridgeTempLog: true, staffIdentification: true,
    // Growth: on
    infoHub: true, multiLocationAnalytics: true, brandedReporting: true,
    issues: true, weatherAlerts: true, aiBuilder: true, fileConvert: true,
    exportCsv: true, aiTranslation: true, insiderTips: true, fridgeTempMonitoring: true,
    // Enterprise: off
    advancedAI: false, integrations: false, advancedAnalytics: false,
    customReporting: false, prioritySupport: false,
  },
  enterprise: {
    maxLocations: -1, maxStaff: -1, maxChecklists: -1,
    templates: true, onboardingMode: true, basicAnalytics: true, exportPdf: true,
    duplicateChecklist: true, fridgeTempLog: true, staffIdentification: true,
    infoHub: true, multiLocationAnalytics: true, brandedReporting: true,
    issues: true, weatherAlerts: true, aiBuilder: true, fileConvert: true,
    exportCsv: true, aiTranslation: true, insiderTips: true, fridgeTempMonitoring: true,
    // Enterprise: on
    advancedAI: true, integrations: true, advancedAnalytics: true,
    customReporting: true, prioritySupport: true,
  },
};
```

**Complexity:** Small. **Risk:** Every `can("aiBuilder")` call must also work with new keys. `usePlan.can()` is generic and doesn't need changes.

---

#### Task 3.3 — UI Tier Gates

**Files:** `src/pages/Infohub.tsx`, `src/components/BottomNav.tsx`, `src/pages/checklists/ChecklistsTab.tsx`, `src/pages/checklists/ReportingTab.tsx`

Add `UpgradePrompt` wrappers to all Growth-tier features:
- Info Hub nav link and page: `can("infoHub")`
- Issues page: `can("issues")`
- AI Builder button: `can("aiBuilder")` (already done — verify uses new key name)
- File Convert button: `can("fileConvert")` (already done)
- CSV export: `can("exportCsv")`
- Branded Reporting (custom logo on PDFs): `can("brandedReporting")`
- Multi-location Analytics tab on Dashboard: `can("multiLocationAnalytics")`
- Weather Alerts integration: `can("weatherAlerts")`

---

### Phase 4 — Kiosk Reliability (Week 4, ~2 days)

#### Task 4.1 — Submission Retry Queue

**Files:** new `src/lib/submission-queue.ts`, `src/pages/Kiosk.tsx`

```typescript
// src/lib/submission-queue.ts
const QUEUE_KEY = "olia_submission_queue";

interface QueuedSubmission {
  id: string;           // local UUID
  payload: CreateLogPayload;
  attemptCount: number;
  queuedAt: string;
}

export const submissionQueue = {
  enqueue(payload: CreateLogPayload): void {
    const existing = this.getAll();
    existing.push({ id: crypto.randomUUID(), payload, attemptCount: 0, queuedAt: new Date().toISOString() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(existing));
  },
  getAll(): QueuedSubmission[] {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"); } catch { return []; }
  },
  remove(id: string): void {
    const updated = this.getAll().filter(q => q.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
  },
  async retryAll(supabase: SupabaseClient): Promise<void> {
    const queue = this.getAll();
    for (const item of queue) {
      try {
        const { error } = await supabase.from("checklist_logs").insert(item.payload);
        if (!error) this.remove(item.id);
        else item.attemptCount++;
      } catch { item.attemptCount++; }
    }
  },
};
```

**In `Kiosk.tsx` `handleComplete`:**
```typescript
const handleComplete = async (answers: Record<string, any>) => {
  const now = new Date();
  setCompletedAt(now);

  if (selectedChecklist && selectedOrgId) {
    // ... score calculation (fixed to exclude instruction questions) ...
    const logPayload: CreateLogPayload = { ... };

    try {
      const { error } = await supabase.from("checklist_logs").insert(logPayload);
      if (error) throw error;
      setSubmissionStatus("success");
    } catch (err) {
      submissionQueue.enqueue(logPayload);
      setSubmissionStatus("queued");
      console.warn("Submission queued for retry:", err);
    }
  }

  setScreen("completion");
};
```

**Add retry on mount and on network reconnect:**
```typescript
useEffect(() => {
  // Retry queued submissions on load
  submissionQueue.retryAll(supabase);

  const handleOnline = () => submissionQueue.retryAll(supabase);
  window.addEventListener("online", handleOnline);
  return () => window.removeEventListener("online", handleOnline);
}, []);
```

**Completion screen:** Show "Saved locally — will sync when connection is restored" banner when `submissionStatus === "queued"`.

**Complexity:** Medium. **Risk:** Queue persists in localStorage per device — if a kiosk is replaced, queued items are lost. Acceptable for MVP.

---

#### Task 4.2 — PIN Error Distinction

**Files:** `src/pages/Kiosk.tsx`

Currently, network errors and wrong PINs both increment the attempt counter. Distinguish them:
```typescript
const { data, error: rpcError } = await supabase.rpc("validate_staff_pin", { ... });

if (rpcError) {
  // Network/server error — don't consume an attempt
  setPinError("Connection error. Please try again.");
  return;
}
if (!data || data.length === 0) {
  // Genuinely wrong PIN — consume an attempt
  const newAttempts = attempts + 1;
  setAttempts(newAttempts);
  if (newAttempts >= 3) { /* lockout */ }
  else setPinError(`Incorrect PIN. ${3 - newAttempts} attempt${3 - newAttempts === 1 ? "" : "s"} remaining.`);
}
```

**Complexity:** Small. **Risk:** None.

---

### Phase 5 — Test Hardening (Week 4–5, ~3 days)

#### Task 5.1 — PIN Validation Tests (Kiosk)

**File:** `src/test/pages/Kiosk.test.tsx`

Add these tests (currently all PIN tests return empty RPC response):

```typescript
it("valid PIN transitions to checklist runner", async () => {
  vi.mocked(supabaseMock.rpc).mockResolvedValueOnce({
    data: [{ id: "staff-1", first_name: "Maria", last_name: "Garcia", role: "Kitchen", organization_id: "org-1" }],
    error: null,
  });
  // Render kiosk with locationId, select a checklist, open PIN modal
  // Enter PIN digits
  // Assert runner screen renders
});

it("wrong PIN increments attempt counter", async () => {
  vi.mocked(supabaseMock.rpc).mockResolvedValue({ data: [], error: null });
  // Enter PIN, assert "2 attempts remaining" text
});

it("network error does NOT consume an attempt", async () => {
  vi.mocked(supabaseMock.rpc).mockResolvedValue({ data: null, error: { message: "Network error" } });
  // Enter PIN, assert attempt count is still 0, error message shown
});

it("3 wrong PINs triggers 30s lockout", async () => {
  vi.mocked(supabaseMock.rpc).mockResolvedValue({ data: [], error: null });
  // Enter PIN 3 times, assert lockout state
});
```

---

#### Task 5.2 — Submission Tests (Kiosk)

**File:** `src/test/pages/Kiosk.test.tsx`

```typescript
it("successful submission inserts correct payload", async () => {
  const insertSpy = vi.fn().mockResolvedValue({ error: null });
  supabaseMock.from.mockReturnValue({ insert: insertSpy });

  // Complete full checklist run
  // Assert insertSpy called with:
  // - organization_id: "org-1"
  // - score: 100 (all answered)
  // - answers: array with correct label/type/answer fields
});

it("failed submission is queued to localStorage", async () => {
  supabaseMock.from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: "Network error" } }) });
  // Complete checklist
  // Assert submissionQueue.getAll().length === 1
  // Assert completion screen shows "saved locally" message
});

it("instruction questions are excluded from score", () => {
  const questions = [
    { id: "i1", type: "instruction", text: "Instructions" },
    { id: "q1", type: "checkbox", text: "Door locked" },
    { id: "q2", type: "checkbox", text: "Alarm set" },
  ];
  const answers = { q1: true, q2: true }; // instruction has no answer
  const score = calculateScore(questions, answers); // extract score logic to testable function
  expect(score).toBe(100); // 2/2 scored questions answered = 100%
});
```

---

#### Task 5.3 — Feature Gating Tests

**File:** `src/test/hooks/usePlan.test.tsx`

```typescript
it("starter plan blocks aiBuilder", () => {
  // Mock org with plan: "starter"
  const { can } = renderHook(() => usePlan(), { ... }).result.current;
  expect(can("aiBuilder")).toBe(false);
});

it("growth plan allows aiBuilder", () => {
  // Mock org with plan: "growth"
  expect(can("aiBuilder")).toBe(true);
});

it("canceled plan falls back to starter limits", () => {
  // Mock org with plan: "growth", plan_status: "canceled"
  expect(can("infoHub")).toBe(false); // canceled falls back to starter
});

it("withinLimit returns false at exact limit for starter", () => {
  // plan: "starter", maxLocations: 1
  const { withinLimit } = renderUsePlanWithOrg({ plan: "starter" });
  expect(withinLimit("maxLocations", 1)).toBe(false); // at limit
  expect(withinLimit("maxLocations", 0)).toBe(true);  // below limit
});
```

---

#### Task 5.4 — Dashboard Analytics Tests

**File:** `src/test/pages/Dashboard.test.tsx`

```typescript
it("displays greeting with real user name from auth context", () => {
  mockAuthContext({ teamMember: { name: "Alex Chen" } });
  render(<Dashboard />);
  expect(screen.getByText(/Good .+, Alex/i)).toBeInTheDocument();
});

it("shows real alert count from useAlerts", () => {
  mockUseAlerts([{ id: "a1", message: "Fridge temp high" }, { id: "a2", message: "Overdue task" }]);
  render(<Dashboard />);
  expect(screen.getByText("2")).toBeInTheDocument(); // alert stat card
});

it("compliance grid renders from real checklist logs", () => {
  mockUseChecklistLogs([
    { id: "l1", checklist_title: "Opening Checklist", score: 85, completed_by: "Maria", created_at: new Date().toISOString(), answers: [] },
  ]);
  render(<Dashboard />);
  expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
  expect(screen.getByText("85%")).toBeInTheDocument();
});
```

---

#### Task 5.5 — Score Calculation Unit Test

Extract score logic from `handleComplete` to a pure function `calculateScore(questions, answers)` in a utility file. Test directly:

```typescript
// src/test/lib/score-utils.test.ts
it("counts checkbox true as answered", () => expect(calculateScore([{id:"q1",type:"checkbox"}], {q1: true})).toBe(100));
it("counts checkbox false as unanswered", () => expect(calculateScore([{id:"q1",type:"checkbox"}], {q1: false})).toBe(0));
it("counts number 0 as answered", () => expect(calculateScore([{id:"q1",type:"number"}], {q1: 0})).toBe(100));
it("counts empty string as unanswered", () => expect(calculateScore([{id:"q1",type:"text"}], {q1: ""})).toBe(0));
it("excludes instruction from denominator", () => {
  const q = [{id:"i",type:"instruction"},{id:"q",type:"checkbox"}];
  expect(calculateScore(q, {q: true})).toBe(100);  // not 50%
});
it("returns 100 for zero scored questions", () => expect(calculateScore([{id:"i",type:"instruction"}], {})).toBe(100));
```

---

### Phase 6 — Codebase Maintainability (Ongoing)

#### Task 6.1 — Decompose Large Page Files

**Priority order:**
1. `Kiosk.tsx` (1,078 lines) → Extract: `KioskSetupScreen`, `KioskGridScreen`, `ChecklistRunner`, `PinEntryModal`, `CompletionScreen`, `KioskAdminLoginModal` into `src/pages/kiosk/` folder
2. `Admin.tsx` (1,338 lines) → Extract: `AdminLocationTab`, `AdminAccountTab`, `AdminBillingCard`, `StaffProfileModal`, `TeamMemberModal` into `src/pages/admin/` folder
3. `Infohub.tsx` (1,213 lines) → Will be necessary after Task 2.5 adds real data hooks

**Complexity:** Large (risk of regression). Use move-not-rewrite: cut component functions out of the page file, put them in separate files, re-export and re-import. Verify tests still pass after each split.

---

#### Task 6.2 — React Error Boundaries

**Files:** new `src/components/ErrorBoundary.tsx`, `src/App.tsx`

```typescript
// src/components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("Boundary caught:", error); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex items-center justify-center p-8 text-center">
          <div>
            <p className="font-semibold text-foreground mb-2">Something went wrong</p>
            <p className="text-sm text-muted-foreground mb-4">Please refresh the page.</p>
            <button onClick={() => window.location.reload()} className="text-sm text-sage underline">
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap each route element in `App.tsx` with `<ErrorBoundary>`.

**Complexity:** Small. **Risk:** None.

---

#### Task 6.3 — Audit Log Writes

**Files:** `src/hooks/useStaffProfiles.ts`, `src/hooks/useTeamMembers.ts`

After every write mutation (create, update, delete, archive), insert a record to `audit_log`:
```typescript
// After successful staff archive:
await supabase.from("audit_log").insert({
  organization_id: payload.organization_id,
  performed_by: teamMember.id,
  action: "archive_staff",
  entity_type: "staff_profile",
  entity_id: staffId,
  details: { reason: "manual" },
});
```

**Complexity:** Small. Wire into existing mutation `onSuccess` callbacks.

---

## 3. Tier Enforcement Matrix

| Feature | Starter | Growth | Enterprise | Current State | Required Changes |
|---------|---------|--------|------------|---------------|-----------------|
| Checklists CRUD | ✓ (10 max) | ✓ (unlimited) | ✓ (unlimited) | Works, limit UI-only | Add server-side count check |
| Basic Analytics | ✓ | ✓ | ✓ | Mock data | Wire to real logs (Task 2.2) |
| PDF Export | ✓ | ✓ | ✓ | Works | No change |
| Duplicate Checklist | ✓ | ✓ | ✓ | Missing from UI | Add copy action to ItemContextMenu |
| Fridge Temp Log | ✓ | ✓ | ✓ | Missing entirely | Add as special checklist template |
| Onboarding Mode | ✓ | ✓ | ✓ | Missing | Add "dry run" toggle to runner |
| Templates | ✓ | ✓ | ✓ | Missing | Add template library screen |
| Staff Identification | ✓ | ✓ | ✓ | Works (PIN + name) | No change |
| Info Hub | ✗ | ✓ | ✓ | All mock, no backend | Build backend (Task 2.5) + gate |
| Issues | ✗ | ✓ | ✓ | Does not exist | Build (Task 2.6) |
| Multi-location Analytics | ✗ | ✓ | ✓ | Mock | Wire to real data with location filter |
| Branded Reporting | ✗ | ✓ | ✓ | Partially exists in PDF export | Gate `can("brandedReporting")` on logo embedding |
| Weather Alerts | ✗ | ✓ | ✓ | Does not exist | Build weather alert edge function |
| AI Checklist Builder | ✗ | ✓ | ✓ | Built, no server gate | Add `requirePlan("growth")` in edge function |
| File Convert | ✗ | ✓ | ✓ | Built, no server gate | Add `requirePlan("growth")` in edge function |
| CSV Export | ✗ | ✓ | ✓ | Built, no gate | Add `can("exportCsv")` check to export button |
| Fridge Temp Monitoring | ✗ | ✓ | ✓ | Missing | Build alert rules on number questions |
| Insider Tips (AI) | ✗ | ✓ | ✓ | Missing | AI-driven operational suggestions in dashboard |
| Advanced AI | ✗ | ✗ | ✓ | Missing | Enterprise-only edge function |
| Integrations | ✗ | ✗ | ✓ | Missing | Enterprise-only webhooks/API |
| Custom Reporting | ✗ | ✗ | ✓ | Missing | Enterprise-only report builder |
| Priority Support | ✗ | ✗ | ✓ | UI flag only | Flag in CRM/support system |

**Server-side enforcement status:**
- Currently: all gating is React component state only
- After Phase 3: edge functions check plan for AI/billing features
- Remaining gap: DB-level plan limits for rows (locations, staff, checklists) require PostgreSQL triggers or edge function validation

---

## 4. Code Change Requests

_(Ordered: execute these one at a time)_

---

### CCR-01 — Hash Staff PINs
**Objective:** Stop storing plaintext PINs in the database.
**Files:** New migration, `Admin.tsx`, `useStaffProfiles.ts`
**Why:** Critical security vulnerability. Plaintext PINs are exposed in DB backups, any SQL console access, and (currently) via the REST API.
**Direction:** Enable `pgcrypto`, migrate existing PINs with `encode(digest(pin,'sha256'),'hex')`, update `validate_staff_pin()` to hash input before comparing, remove `pin` from client-side SELECT, add `hashPin()` helper using `crypto.subtle.digest`.

---

### CCR-02 — Fix Anonymous RLS Policies
**Objective:** Prevent anon clients from reading all staff PINs and injecting fake logs.
**Files:** New migration file only.
**Why:** Any person with the Supabase anon key (in the repo) can read all staff PINs. Any anon client can write fake compliance logs for any org.
**Direction:** Change `staff_profiles_read` from `using (true)` to `using (organization_id = current_org_id())`. Change `logs_insert` from `with check (true)` to validate `organization_id` via the `staff_profile_id` FK.

---

### CCR-03 — Add Server-Side Permission Enforcement
**Objective:** Manager permissions must be enforced at the database level, not just in React.
**Files:** New migration file only.
**Why:** A manager with `manage_staff_profiles: false` can still call the API directly and modify staff.
**Direction:** Add `has_permission(perm text)` Postgres function, add granular RLS policies for write operations on staff_profiles and team_members.

---

### CCR-04 — Fix Score Calculation (Exclude Instruction Questions)
**Objective:** Instruction blocks must not count in the checklist score denominator.
**Files:** `src/pages/Kiosk.tsx`, new `src/lib/score-utils.ts`
**Why:** A checklist with 5 real questions and 3 instruction blocks scores max 62% even if perfectly completed.
**Direction:** Extract score logic to `calculateScore(questions, answers)`, filter out `type === "instruction"` before dividing, add 6 unit tests.

---

### CCR-05 — Wire Kiosk to Real Checklists
**Objective:** Replace hardcoded `KIOSK_CHECKLISTS` with live DB query.
**Files:** New migration (RPC function + `time_of_day` column), `src/pages/Kiosk.tsx`
**Why:** Any customer who creates their own locations sees an empty kiosk grid.
**Direction:** Add `time_of_day` column to `checklists`, create `get_kiosk_checklists(location_id)` SECURITY DEFINER RPC, call it from Kiosk on setup, map response to `KioskChecklist[]`.

---

### CCR-06 — Wire Dashboard to Real Supabase Data
**Objective:** Replace all mock constants in Dashboard.tsx with live hooks.
**Files:** `src/pages/Dashboard.tsx`
**Why:** The manager's primary screen shows hardcoded fake data.
**Direction:** Replace `currentUser = "Sarah"` with `useAuth().teamMember.name`, replace `useSyncExternalStore` alerts with `useAlerts()`, replace compliance grid mock with `useChecklistLogs({ from, to })`, replace overdue tasks with `useActions()` filtered by status and due date.

---

### CCR-07 — Remove `alerts-store.ts`
**Objective:** Delete the client-side mock alert store.
**Files:** `src/lib/alerts-store.ts` (delete), `src/pages/Dashboard.tsx`, test file (delete)
**Why:** Two parallel alert systems create confusion. After CCR-06 wires Dashboard to `useAlerts()`, the mock store is dead code.
**Direction:** Check all imports, replace with `useAlerts()`, delete the file.

---

### CCR-08 — Add Submission Retry Queue to Kiosk
**Objective:** Prevent silent data loss on kiosk network failures.
**Files:** New `src/lib/submission-queue.ts`, `src/pages/Kiosk.tsx`
**Why:** `handleComplete` has no error handling — a failed insert is silently discarded.
**Direction:** Wrap the Supabase insert in try/catch, on failure call `submissionQueue.enqueue(payload)`, set `submissionStatus = "queued"`, show queued indicator on completion screen. Add `retryAll()` call on mount and `window.addEventListener("online")`.

---

### CCR-09 — Distinguish PIN Network Errors from Wrong PINs
**Objective:** Network errors should not consume a PIN attempt or lock out staff.
**Files:** `src/pages/Kiosk.tsx`
**Why:** A WiFi dropout during PIN entry currently locks staff out after 3 tries.
**Direction:** Check `rpcError` before `attempts++`. Show "Connection error — please try again" without consuming an attempt.

---

### CCR-10 — Rename Plan Types: Solo → Starter, Pro → Growth
**Objective:** Align plan naming with the product model.
**Files:** New migration, `src/lib/plan-features.ts`, `src/pages/Billing.tsx`, `src/hooks/usePlan.ts`
**Why:** The existing `"solo"/"pro"` names are placeholder and inconsistent with the defined tier structure.
**Direction:** Migration to update DB CHECK constraint and UPDATE existing rows, then global rename in source files.

---

### CCR-11 — Update Feature Matrix for New Tier Capabilities
**Objective:** `PlanFeatures` must reflect the full feature set per tier.
**Files:** `src/lib/plan-features.ts`
**Why:** Current matrix has 10 features. New model has 20+ across three tiers.
**Direction:** Replace the interface and constants with the expanded matrix from Task 3.2. Update all `can()` call sites.

---

### CCR-12 — Build Info Hub Backend (Tables + Hooks)
**Objective:** Replace Infohub mock data with Supabase-backed documents and training modules.
**Files:** New migration, new `src/hooks/useInfohub.ts`, `src/pages/Infohub.tsx`
**Why:** Infohub is the flagship Growth-tier differentiator. Currently it's entirely `useState` with hardcoded content.
**Direction:** Create `documents`, `document_folders`, `training_modules` tables with RLS. Create React Query hooks. Replace `useState(initialLibraryDocs)` etc. with hook calls in Infohub.tsx.

---

### CCR-13 — Build Issues System
**Objective:** Allow kiosk staff to report problems with photos. Allow managers to track and resolve issues.
**Files:** New migration, new `src/hooks/useIssues.ts`, new `src/pages/Issues.tsx`, Supabase Storage bucket, `src/pages/Kiosk.tsx`
**Why:** Issues (staff flag problems with photos) is a key Growth-tier differentiator and a critical operations tool.
**Direction:** Create `issues` table, set up Supabase Storage bucket for photos, build Issues page for managers, add "Report Issue" flow to Kiosk.

---

### CCR-14 — Enforce Logic Rules in Kiosk Runner
**Objective:** Conditional logic defined in the checklist builder must execute during kiosk use.
**Files:** `src/pages/Kiosk.tsx`
**Why:** The builder saves logic rules but the runner ignores them. Conditional compliance logic (e.g., "if temperature > 8°C, require action") never fires.
**Direction:** Add `evaluateLogicRules(question, answer)` function, inject follow-up questions or `pendingActions` based on trigger type, submit `pendingActions` to the `actions` table alongside the log.

---

### CCR-15 — Build Signup / Onboarding Flow
**Objective:** Allow new customers to register without pre-seeded data.
**Files:** New edge function `create-organization`, new `src/pages/Signup.tsx`, `src/App.tsx`
**Why:** Currently there is no way for a new customer to create an organization. Only the seeded demo org can use the product.
**Direction:** Edge function creates org + location + auth user + owner team_member in a transaction. 3-step Signup.tsx form (business name → location → credentials). Link from AdminLoginModal.

---

### CCR-16 — Add Server-Side Plan Enforcement to Edge Functions
**Objective:** AI and file-conversion features must verify plan server-side, not just in React.
**Files:** New `supabase/functions/_shared/enforce-plan.ts`, `supabase/functions/generate-checklist/index.ts`
**Why:** A Starter plan user can call edge functions directly, bypassing the React plan check.
**Direction:** Create shared `requirePlan()` utility, call it in `generate-checklist` and `create-checkout-session` after auth verification.

---

### CCR-17 — Add React Error Boundaries
**Objective:** Prevent any uncaught component error from showing a blank screen.
**Files:** New `src/components/ErrorBoundary.tsx`, `src/App.tsx`
**Why:** There are zero error boundaries. A single unhandled error kills the whole app.
**Direction:** Class component with `getDerivedStateFromError`, minimal "Something went wrong / refresh" fallback. Wrap each route in `App.tsx`.

---

### CCR-18 — Add Audit Log Writes to Mutation Hooks
**Objective:** The `audit_log` table must record admin actions.
**Files:** `src/hooks/useStaffProfiles.ts`, `src/hooks/useTeamMembers.ts`, `src/hooks/useLocations.ts`
**Why:** The table exists but nothing writes to it. Admin actions are unauditable.
**Direction:** In each mutation's `onSuccess` callback, insert a record to `audit_log` with `action`, `entity_type`, `entity_id`.

---

### CCR-19 — Configure Stripe and Fix Billing Portal URL
**Objective:** Make billing functional.
**Files:** `.env.local`, `src/pages/Billing.tsx`, Supabase edge function secrets, Stripe Dashboard
**Why:** All Stripe integration is present but non-functional due to missing keys and a hardcoded placeholder portal URL.
**Direction:** Create Stripe products/prices, set env vars, replace `test_00000` portal URL, register webhook endpoint, test full checkout cycle.

---

### CCR-20 — Add High-Value Integration Tests
**Objective:** Critical production paths must have meaningful test coverage.
**Files:** `src/test/pages/Kiosk.test.tsx`, new `src/test/lib/score-utils.test.ts`, `src/test/hooks/usePlan.test.tsx`
**Why:** Current 95% coverage is dominated by render assertions. The PIN flow, submission payload, and plan gating are effectively untested.
**Direction:** See Phase 5 test implementations.

---

## 5. Testing Plan

### Critical Path Tests to Add (ordered by risk)

| # | Test | File | Why Critical |
|---|------|------|--------------|
| 1 | Valid PIN → runner transition | `Kiosk.test.tsx` | Primary user flow, currently untested |
| 2 | Submission payload structure | `Kiosk.test.tsx` | Wrong payload = corrupted compliance data |
| 3 | Failed submission → localStorage queue | `Kiosk.test.tsx` | Silent data loss = unacceptable for venue ops |
| 4 | Instruction questions excluded from score | `score-utils.test.ts` | Bug causes systematically low compliance scores |
| 5 | Network error does NOT consume PIN attempt | `Kiosk.test.tsx` | WiFi drop = staff lockout |
| 6 | Starter plan blocks Growth features | `usePlan.test.tsx` | Feature gating never tested with Starter org |
| 7 | Canceled plan falls back to Starter | `usePlan.test.tsx` | Plan enforcement logic |
| 8 | Dashboard shows real user name | `Dashboard.test.tsx` | Basic data integration smoke test |
| 9 | Dashboard renders from real log data | `Dashboard.test.tsx` | Primary screen data correctness |
| 10 | Logic rule `gt` triggers require_action | `Kiosk.test.tsx` | Core compliance automation feature |
| 11 | Retry queue empties on successful network | `submission-queue.test.ts` | Queue management correctness |
| 12 | `withinLimit` returns false at exact limit | `usePlan.test.tsx` | Off-by-one in plan limits |
| 13 | Issue creation inserts correct org_id | `Issues.test.tsx` | Data isolation for new module |
| 14 | Signup edge function creates all 4 records | Edge function test | Critical onboarding path |
| 15 | Checkout: missing price ID shows error | `Billing.test.tsx` | Guards against silent payment failure |

---

## 6. Remaining Risks Requiring Product Decisions

### 1 — Time-of-Day vs. Schedule Mapping
**Question:** Should `checklists.schedule` determine both *when a checklist recurs* and *what time of day it appears on the kiosk*, or should these be separate fields?
**Recommendation:** Add a separate `time_of_day` column. Keep `schedule` for recurrence rules.
**Impact on timeline:** Task CCR-05 depends on this decision.

### 2 — Offline Kiosk Strategy
**Question:** Is the localStorage queue (CCR-08) sufficient for pilot, or does the kiosk need full offline support (service worker, local DB)?
**Recommendation:** localStorage queue is sufficient for pilot. Full PWA offline support is a Phase 2 product decision.
**Impact:** Service worker with background sync is a large feature (2-3 days) — don't block pilot on this.

### 3 — Photo Upload for Issues and Media Questions
**Question:** Does the kiosk need camera access? Which bucket permissions are acceptable?
**Recommendation:** Use `<input type="file" accept="image/*" capture="environment">` for mobile camera access. Create a private Supabase Storage bucket (`issues`) with service-role upload from an edge function (avoids exposing storage keys in the anon client).
**Impact:** Issues system (CCR-13) and `media` question type in runner both depend on this.

### 4 — Weather Alerts Implementation
**Question:** Which weather API? What conditions trigger alerts? Per-location? Global thresholds?
**Recommendation:** Use Open-Meteo (free, no API key) for pilot. Create a daily edge function (scheduled via Supabase cron) that checks forecast for each location's coordinates and inserts alerts for rain/frost/extreme heat. Requires `latitude` and `longitude` columns on `locations` table.
**Impact:** CCR not included above — this is a planned Growth feature but needs product specification.

### 5 — Branded Reporting Definition
**Question:** Does "branded reporting" mean adding the organization's logo to PDF exports? Or custom templates?
**Recommendation:** For pilot: allow the org to upload a logo (stored in Supabase Storage) that gets embedded in PDF exports via the existing `export-utils.ts` jsPDF integration. Full custom templates are Enterprise.
**Impact:** Requires `logo_url` column on `organizations` and a file upload flow in Admin settings.

### 6 — Fridge Temp Log vs. Monitoring
**Question:** Is Fridge Temp Log (Starter) just a checklist question type, or a dedicated module?
**Recommendation:** For Starter, it's a prebuilt template (special `number` question with min/max validation and auto-generated chart). For Growth (Fridge Temp Monitoring), it becomes an alert system — if a submitted temperature value exceeds thresholds, an alert is automatically created.
**Impact:** Temp Monitoring requires the logic rules engine (CCR-14) to be complete first.

### 7 — Insider Tips (AI) Scope
**Question:** What does "Insider Tips — AI operational suggestions" mean in practice?
**Recommendation:** For pilot: a weekly edge function that analyzes the last 7 days of `checklist_logs` for the org, identifies patterns (e.g., "Closing checklist scores are consistently low on Fridays"), and creates a `tip` alert record. Powered by the existing Claude API edge function infrastructure.
**Impact:** Scope needs product sign-off before implementation.

### 8 — Duplicate Submission Prevention
**Question:** If a staff member submits the same checklist twice in a day (intentionally or by accident), should the second submission be blocked, flagged, or allowed?
**Recommendation:** Allow it (some venues run multiple shifts), but highlight duplicates in the Reporting tab with a "2nd submission" badge.
**Impact:** Small UI change in ReportingTab, no DB schema change needed.

### 9 — Supabase Project Separation (Dev / Staging / Production)
**Question:** The `.env.local` points to a single Supabase project used for development. When does a staging/production separation happen?
**Recommendation:** Before any pilot customer data enters the system. Create a production Supabase project. Apply the migration to production. Set up environment-specific `.env` files. This must happen before CCR-19 (Stripe).
**Impact:** Blocks the billing launch. Not technically complex but requires ops coordination.

### 10 — Manager Onboarding: Single-Step or Multi-Step?
**Question:** Should signup be a single form or a guided 3-step flow with location creation, staff invite, and template selection?
**Recommendation:** For pilot: 2-step (account + first location). Templates and staff setup happen inside the app. Full guided onboarding is post-pilot.
**Impact:** Determines scope of CCR-15.
