import { useState } from "react";
import { Layout } from "@/components/Layout";
import { ChevronRight, FileText, Link, Brain, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SOP {
  id: string;
  title: string;
  category: "food-safety" | "opening-closing" | "cleaning" | "service";
  summary: string;
  linkedChecklist?: string;
  hasAttachment?: boolean;
  hasQuiz?: boolean;
  updatedAt: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const sops: SOP[] = [
  {
    id: "s1",
    title: "Food Temperature Monitoring",
    category: "food-safety",
    summary: "Procedures for logging and managing food storage temperatures throughout the day.",
    linkedChecklist: "Opening Checklist",
    hasAttachment: true,
    hasQuiz: true,
    updatedAt: "2 days ago",
  },
  {
    id: "s2",
    title: "HACCP Compliance Basics",
    category: "food-safety",
    summary: "Core HACCP principles and documentation requirements for your establishment.",
    hasAttachment: true,
    updatedAt: "1 week ago",
  },
  {
    id: "s3",
    title: "Opening Duties — Kitchen",
    category: "opening-closing",
    summary: "Step-by-step opening sequence for kitchen staff before service begins.",
    linkedChecklist: "Opening Checklist",
    updatedAt: "3 days ago",
  },
  {
    id: "s4",
    title: "Closing Duties — Full Team",
    category: "opening-closing",
    summary: "End-of-day procedures covering all areas: kitchen, bar, storage, and entrance.",
    linkedChecklist: "Closing Checklist",
    hasQuiz: true,
    updatedAt: "1 week ago",
  },
  {
    id: "s5",
    title: "Deep Clean Protocol",
    category: "cleaning",
    summary: "Scheduled deep clean routine for fryers, extraction units, and walk-in storage.",
    linkedChecklist: "Cleaning Schedule",
    hasAttachment: true,
    updatedAt: "5 days ago",
  },
  {
    id: "s6",
    title: "Service & Allergen Standards",
    category: "service",
    summary: "Staff guidelines for allergen communication, table service, and escalation procedures.",
    hasAttachment: false,
    hasQuiz: true,
    updatedAt: "2 weeks ago",
  },
];

const categories = [
  { id: "all",            label: "All" },
  { id: "food-safety",    label: "Food Safety" },
  { id: "opening-closing",label: "Opening & Closing" },
  { id: "cleaning",       label: "Cleaning" },
  { id: "service",        label: "Service" },
] as const;

type CategoryId = typeof categories[number]["id"];

const catColors: Record<string, string> = {
  "food-safety":     "status-error",
  "opening-closing": "status-ok",
  "cleaning":        "status-warn",
  "service":         "bg-lavender-light text-lavender-deep",
};

// ─── SOP Detail Sheet (simple modal) ─────────────────────────────────────────

function SOPDetail({ sop, onClose }: { sop: SOP; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-fade-in">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
          Back
        </button>
        <h2 className="font-display text-base text-foreground flex-1 truncate">{sop.title}</h2>
      </header>

      <div className="flex-1 overflow-auto px-5 py-5 space-y-5">
        <span className={cn("inline-flex text-xs px-2 py-0.5 rounded-full font-medium", catColors[sop.category])}>
          {categories.find(c => c.id === sop.category)?.label}
        </span>

        <p className="text-muted-foreground text-sm leading-relaxed">{sop.summary}</p>

        {/* Rich content placeholder */}
        <div className="space-y-3">
          <div className="card-surface p-4">
            <p className="text-xs font-semibold text-foreground mb-2">Procedure steps</p>
            <ol className="space-y-2 text-sm text-foreground list-decimal list-inside">
              <li>Verify equipment calibration before logging.</li>
              <li>Record temperature at the designated times.</li>
              <li>Flag any out-of-range readings immediately to the manager.</li>
              <li>Complete corrective action log if required.</li>
              <li>Submit checklist at end of shift.</li>
            </ol>
          </div>

          {sop.hasAttachment && (
            <div className="card-surface p-4 flex items-center gap-3">
              <FileText size={18} className="text-sage shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Attached document</p>
                <p className="text-xs text-muted-foreground">PDF · 1.2 MB</p>
              </div>
              <button className="text-xs text-sage font-medium">View</button>
            </div>
          )}

          {sop.linkedChecklist && (
            <div className="card-surface p-4 flex items-center gap-3">
              <Link size={18} className="text-lavender-deep shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Linked checklist</p>
                <p className="text-xs text-muted-foreground">{sop.linkedChecklist}</p>
              </div>
              <button className="text-xs text-lavender-deep font-medium">Open</button>
            </div>
          )}

          {sop.hasQuiz && (
            <div className="card-surface p-4 flex items-center gap-3 bg-lavender-light border-lavender/30">
              <Brain size={18} className="text-lavender-deep shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">AI Knowledge Check</p>
                <p className="text-xs text-muted-foreground">5 questions · auto-generated</p>
              </div>
              <button className="text-xs text-lavender-deep font-medium">Start</button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">Last updated {sop.updatedAt}</p>
      </div>
    </div>
  );
}

// ─── SOPs Page ────────────────────────────────────────────────────────────────

export default function SOPs() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SOP | null>(null);

  const filtered = sops.filter(s => {
    const matchCat = activeCategory === "all" || s.category === activeCategory;
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  if (selected) return <SOPDetail sop={selected} onClose={() => setSelected(null)} />;

  return (
    <Layout
      title="SOP Library"
      subtitle="Standard operating procedures"
      headerRight={
        <button className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-sage text-primary-foreground">
          <Plus size={13} />
          Add
        </button>
      }
    >
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search procedures..."
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-card border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={cn(
              "shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors",
              activeCategory === c.id
                ? "bg-sage text-primary-foreground border-sage"
                : "border-border text-muted-foreground bg-card hover:border-sage/40"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* SOP list */}
      <div className="card-surface divide-y divide-border">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">No procedures found.</p>
        )}
        {filtered.map(sop => (
          <button
            key={sop.id}
            onClick={() => setSelected(sop)}
            className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-muted/50 transition-colors"
          >
            <FileText size={16} className="text-sage mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground">{sop.title}</p>
                <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", catColors[sop.category])}>
                  {categories.find(c => c.id === sop.category)?.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{sop.summary}</p>
              <div className="flex items-center gap-3 mt-1.5">
                {sop.hasAttachment && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText size={10} /> Attachment
                  </span>
                )}
                {sop.hasQuiz && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Brain size={10} /> AI Quiz
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={14} className="text-muted-foreground mt-0.5 shrink-0" />
          </button>
        ))}
      </div>
    </Layout>
  );
}
