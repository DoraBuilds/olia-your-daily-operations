# Olia — App Documentation

> **Last updated:** 2 March 2026  
> **Stack:** React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui  
> **Target:** Mobile-first PWA (max-width 480 px), hospitality operations

---

## 1. Overview

**Olia** is an operational management app for hospitality businesses (restaurants, cafés, bars). It provides daily checklists, an information hub (SOPs & training), operational alerts, scheduling, and team/location administration — all in a mobile-first interface.

There is **no backend** yet. All data lives in React state and in-memory stores. The architecture is designed so that each data layer can be swapped to a database without rewriting UI components.

---

## 2. Navigation & Layout

| Component | File | Purpose |
|---|---|---|
| `Layout` | `src/components/Layout.tsx` | Shared page shell — sticky header, scrollable content area, bottom nav. Max-width `lg` (480 px). |
| `BottomNav` | `src/components/BottomNav.tsx` | Fixed bottom tab bar with 4 tabs: **Home**, **Checklists**, **Infohub**, **Admin**. Uses `lucide-react` icons and active-state underline. |
| `NavLink` | `src/components/NavLink.tsx` | Thin wrapper around `react-router-dom` `NavLink` with `className` / `activeClassName` support. |

### Routes (`src/App.tsx`)

| Path | Component | Notes |
|---|---|---|
| `/` | → `/dashboard` | Redirect |
| `/dashboard` | `Dashboard` | Home / overview |
| `/notifications` | `Notifications` | Full alert list |
| `/checklists/*` | `Checklists` | Checklist management (tabs: Templates, Reporting) |
| `/infohub/*` | `Infohub` | Library & Training |
| `/admin` | `Admin` | Locations, Team, Staff Profiles |
| `/training/*` | → `/infohub` | Legacy redirect |
| `/maintenance` | → `/dashboard` | Legacy redirect |

---

## 3. Design System

### 3.1 Tokens (`src/index.css`)

All colours are **HSL** values stored as CSS custom properties.

| Token | HSL | Usage |
|---|---|---|
| `--sage` | `135 11% 55%` | Primary brand / CTA |
| `--sage-deep` | `135 14% 45%` | Active / hover states |
| `--sage-light` | `135 14% 90%` | Light tint backgrounds |
| `--lavender` | `275 22% 72%` | Secondary accent |
| `--lavender-deep` | `272 25% 67%` | Deep accent |
| `--lavender-light` | `275 28% 93%` | Light accent backgrounds |
| `--background` | `42 22% 94%` | Page background (warm off-white) |
| `--foreground` | `240 3% 19%` | Body text |
| `--card` | `0 0% 100%` | Card surface |
| `--muted` | `40 15% 91%` | Input backgrounds, disabled states |
| `--muted-foreground` | `240 3% 48%` | Secondary text |
| `--border` | `40 12% 87%` | Borders |
| `--status-ok` | `135 14% 45%` | Success / green |
| `--status-warn` | `35 45% 62%` | Warning / amber |
| `--status-error` | `0 30% 58%` | Error / red |

### 3.2 Typography

- **Display:** `DM Serif Display` (serif) — headings, page titles
- **Body:** `Inter` (sans-serif) — all body text, labels, buttons

### 3.3 Tailwind Config (`tailwind.config.ts`)

Extends default Tailwind with:
- Custom colour scales: `sage`, `lavender`, `status`
- Custom `borderRadius` using `--radius` (0.875 rem)
- Custom shadows: `shadow-sm`, `shadow-md`, `shadow-card`
- Animations: `fade-in`, `accordion-down`, `accordion-up`

### 3.4 Component Utilities (CSS)

| Class | Purpose |
|---|---|
| `.status-ok` / `.status-warn` / `.status-error` | Badge styling (bg + text) |
| `.card-surface` | Card with border, radius, and subtle shadow |
| `.section-label` | Uppercase 11 px label (Inter 600, tracking-wide) |
| `.score-ring` | Circular border for score indicators |

---

## 4. Pages

### 4.1 Dashboard (`src/pages/Dashboard.tsx` · ~560 lines)

The home screen. Sections rendered top-to-bottom:

1. **Operational Alerts** — reads from shared `alerts-store`. Shows up to 3 alerts with severity-coloured left border. "See all" links to `/notifications`.
2. **Compliance Overview** — tabs: Today / Yesterday / Overdue. Paginated list of checklists with `ScoreRing` completion indicators. Click opens `ChecklistDetailModal` with unanswered-question breakdown. Location dropdown filter.
3. **Upcoming Schedule** — toggles Week / Month view. Filters events to the current user. Colour-coded event type badges (Recurring, Delivery, Maintenance).
4. **Quick Task** — FAB (`+`) opens `QuickTaskModal` bottom sheet to add ad-hoc tasks.

**Sub-components (inline):** `ScoreRing`, `EventRow`, `UpcomingEmptyState`, `QuickTaskModal`, `ChecklistDetailModal`.

### 4.2 Notifications (`src/pages/Notifications.tsx` · 94 lines)

Full-screen list of all operational alerts from `alerts-store`. Each alert has a dismiss (×) button. "Clear all" button at top. Empty state shows a check-circle illustration.

### 4.3 Checklists (`src/pages/Checklists.tsx` · ~2 044 lines)

The largest page. Two top-level tabs: **Templates** and **Reporting**.

#### Templates Tab
- **Folder browser** — hierarchical folders with breadcrumb navigation. Folders support: create, rename, move, delete, drag-to-reorder (via `GripVertical` handles).
- **Checklist list** — cards showing title, question count, schedule. Click opens the **Checklist Builder** in edit mode. Eye icon opens **Preview Modal**.
- **Creation flows:**
  - **New blank checklist** — opens builder with empty state
  - **Convert file** — upload a PDF, simulated parsing generates prefilled questions, opens builder
  - **Build with AI** — text prompt, simulated AI generates title + sections, opens builder
- **3-dot context menu** on each checklist: Edit, Duplicate, Move, Delete.

#### Checklist Builder Modal (`ChecklistBuilderModal` — inline)
- **Title & description** fields
- **Sections** — collapsible groups of questions. Add/remove sections.
- **Questions** — each has:
  - Text input
  - Response type picker (bottom sheet): Text, Number, Checkbox, Date & Time, Media, Signature, Person, Instruction, Multiple Choice (5 preset sets like Good/Fair/Poor, Pass/Fail, etc.)
  - Required toggle
  - **Logic rules** — expandable panel per question:
    - Comparator: is, is_not, lt, lte, eq, neq, gte, gt, between, not_between
    - Triggers: Ask question, Notify, Require note, Require media, **Create action** (auto-generates an operational alert with summary title + preview card)
- **Schedule picker** — presets (daily, weekday, weekly, monthly, yearly, none) + custom recurrence (interval, unit, weekday selector, end conditions)
- **Assign roles** per checklist
- **Save** persists to local state; "Create action" triggers push alerts to `alerts-store`

#### Reporting Tab
- **Actions** — table of corrective actions with status badges (Open, In progress, Resolved)
- **Logs** — completed checklist submissions with scores, expandable answer details (checkbox, numeric, photo indicators, comments)
- **Date range filter** — calendar popover for filtering logs
- **Export** — placeholder download button

#### Key Types
```typescript
type ResponseType = "text" | "number" | "checkbox" | "datetime" | "media"
  | "signature" | "instruction" | "person" | "multiple_choice";

type LogicComparator = "is" | "is_not" | "lt" | "lte" | "eq" | "neq"
  | "gte" | "gt" | "between" | "not_between";

type LogicTriggerType = "ask_question" | "notify" | "require_note"
  | "require_media" | "require_action";

interface QuestionDef {
  id: string; text: string; responseType: ResponseType;
  required: boolean; choices?: string[];
  config?: QuestionConfig; mcSetId?: string;
}

interface SectionDef { id: string; name: string; questions: QuestionDef[]; }
```

### 4.4 Infohub (`src/pages/Infohub.tsx` · ~1 213 lines)

Two sub-tabs: **Library** and **Training**.

#### Library
- Folder-based SOP document browser
- Folder management: create, rename, move, delete, drag-to-reorder (`GripVertical` handles)
- Document viewer: full-text content display with tags
- Create/edit documents with title, summary, content, tags, folder assignment
- Context menus (3-dot) on folders and documents
- Search across all documents

#### Training
- Folder-based training module browser (same folder UX as Library)
- Training document viewer: step-by-step instructions with progress tracking (completed/not completed toggle per step)
- Create/edit training modules with title, duration, steps, folder assignment
- Completion status badges

**Shared sub-components (inline):** `ItemContextMenu`, `MoveToFolderSheet`, `CreateFolderModal`, `RenameFolderModal`.

### 4.5 Admin (`src/pages/Admin.tsx` · ~753 lines)

Three accordion sections:

#### Locations
- List of locations with staff count and device-mode badge
- Add/edit location modal: name, manager, staff count, device-mode toggle
- Delete confirmation modal

#### Team (Account Users)
- List of team members (Owner, Manager) with role badges and location
- Invite/edit member modal: name, email, role, location
- Avatar initials display

#### Staff Profiles (Device Mode)
- For locations with device mode enabled
- List of staff with PIN-based access
- Add/edit profile modal: location, display name, role label (Staff/Shift Lead), PIN setup with confirmation
- PIN reset flow
- Archive/restore and permanent delete workflows
- Status filter (Active/Archived)
- "Last used" timestamp display

**Data layer:** `src/lib/admin-repository.ts` — exports types, initial mock data, and helpers (`hashPin`, `getInitials`, `daysAgo`).

---

## 5. Shared State

### Alerts Store (`src/lib/alerts-store.ts`)

In-memory pub/sub store using `useSyncExternalStore`.

```typescript
interface OperationalAlert {
  id: string;
  type: "error" | "warn";
  message: string;
  area: string;
  time?: string;
  source?: "system" | "action";
}
```

| Export | Purpose |
|---|---|
| `getAlerts()` | Snapshot for `useSyncExternalStore` |
| `subscribe(fn)` | Register listener, returns unsubscribe |
| `addAlert(alert)` | Push new alert (used by Checklist "Create action" trigger) |
| `removeAlert(id)` | Dismiss single alert |
| `clearAllAlerts()` | Clear all alerts |

Pre-loaded with 5 default system alerts.

### Admin Repository (`src/lib/admin-repository.ts`)

Exports types and initial mock data for Locations, Staff Profiles, and Team Members. Pure functions: `hashPin`, `getInitials`, `daysAgo`.

---

## 6. UI Patterns

### Bottom Sheet Modals
All modals use a consistent pattern:
- Fixed overlay with `bg-foreground/20 backdrop-blur-sm`
- Content slides up from bottom (`rounded-t-2xl`)
- Max width `lg`, max height `85vh` with overflow scroll
- Close via × button or backdrop click
- `animate-fade-in` entrance

### Context Menus (3-dot)
- Positioned absolutely relative to trigger
- Click-outside-to-close via `useEffect` + `mousedown` listener
- Actions: Edit, Rename, Move, Duplicate, Delete

### Folder Drag-to-Reorder
- `GripVertical` icon as drag handle
- `onDragStart` / `onDragOver` / `onDrop` native HTML drag events
- Swaps folder positions in state array

### Status Badges
Three tiers using `.status-ok`, `.status-warn`, `.status-error` utility classes.

### Score Rings
SVG-based circular progress indicators with dynamic `strokeDasharray` and colour thresholds (≥85 green, ≥65 amber, <65 red).

---

## 7. File Structure

```
src/
├── App.tsx                    # Router + providers
├── App.css                    # (minimal)
├── index.css                  # Design tokens + utility classes
├── main.tsx                   # Entry point
├── vite-env.d.ts
├── components/
│   ├── Layout.tsx             # Page shell
│   ├── BottomNav.tsx          # Tab bar
│   ├── NavLink.tsx            # Router NavLink wrapper
│   └── ui/                    # shadcn/ui components (60+ files)
├── hooks/
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── lib/
│   ├── utils.ts               # cn() helper
│   ├── alerts-store.ts        # Shared alert pub/sub store
│   └── admin-repository.ts    # Admin mock data & types
├── pages/
│   ├── Dashboard.tsx           # Home page (~560 lines)
│   ├── Notifications.tsx       # Alert list (94 lines)
│   ├── Checklists.tsx          # Templates + Reporting (~2044 lines)
│   ├── Infohub.tsx             # Library + Training (~1213 lines)
│   ├── Admin.tsx               # Locations, Team, Staff (~753 lines)
│   ├── Index.tsx               # (unused)
│   ├── NotFound.tsx            # 404
│   ├── Maintenance.tsx         # (redirected to /dashboard)
│   ├── SOPs.tsx                # (redirected)
│   └── Training.tsx            # (redirected to /infohub)
└── test/
    ├── setup.ts
    └── example.test.ts
```

---

## 8. Dependencies (Key)

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3 | UI framework |
| `react-router-dom` | ^6.30 | Client-side routing |
| `@tanstack/react-query` | ^5.83 | Data fetching (unused currently) |
| `lucide-react` | ^0.462 | Icon library |
| `date-fns` | ^3.6 | Date formatting |
| `react-day-picker` | ^8.10 | Calendar component |
| `recharts` | ^2.15 | Charts (available, not yet used) |
| `sonner` | ^1.7 | Toast notifications |
| `tailwindcss` | ^3.4 | Utility CSS |
| `class-variance-authority` | ^0.7 | Component variant styling |
| `zod` | ^3.25 | Schema validation (available) |

---

## 9. What's Not Yet Implemented

- **No backend / database** — all data is in-memory React state
- **No authentication** — no login, no user sessions
- **No real AI** — "Build with AI" and "Convert File" use mock data generation
- **No file storage** — uploaded PDFs are read client-side only
- **No real-time sync** — single-user, single-tab only
- **No push notifications**
- **No data export** — export buttons are placeholders
- **Dark mode** — tokens defined but not fully tested
- **Charts** — `recharts` installed but not used in any dashboard widget yet

---

## 10. Architecture Notes

1. **Single-file pages:** Each page is a self-contained file with inline sub-components. This keeps related UI + logic together but means large files (Checklists.tsx is ~2 000 lines).

2. **No global state management:** Only `alerts-store` uses a shared store pattern. Everything else is component-local `useState`.

3. **Mock data co-located:** Mock arrays live at the top of each page file (except Admin, which uses `admin-repository.ts`).

4. **Ready for backend:** Types are well-defined. The `admin-repository.ts` pattern (isolated data layer) can be replicated for other domains when connecting to a database.

5. **Mobile-first constraint:** All layouts target `max-w-lg` (480 px). Bottom navigation, bottom sheets, and touch-friendly targets (min 44 px) throughout.

---

## 11. Tone & Personality

- **Calm and professional** — no loud colours, no exclamation marks.
- **Warm neutrals** with sage green as the primary accent.
- **Serif display headings** paired with clean sans-serif body text.
- **Generous whitespace** and soft card surfaces.
- **Muted status indicators** — never harsh or alarming.
- **Illustrations** use simple line art (e.g. plant motif for empty states).
- The overall feel is: *a well-organised notebook for a well-run kitchen*.
