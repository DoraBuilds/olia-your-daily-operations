import {
  ClipboardList,
  Thermometer,
  AlertTriangle,
  BookOpen,
  BarChart3,
  Building2,
} from "lucide-react";

const FEATURES = [
  {
    Icon: ClipboardList,
    title: "Daily checklists",
    description:
      "Opening, closing, and mid-shift routines — built for your venue, completed by your team, logged automatically.",
  },
  {
    Icon: Thermometer,
    title: "Compliance logs",
    description:
      "Food safety checks, fridge temperature records, allergen logs — all timestamped and stored. Always audit-ready.",
  },
  {
    Icon: AlertTriangle,
    title: "Issue reporting",
    description:
      "Staff flag problems directly in the app. Managers get notified instantly. Nothing waits until the next day.",
  },
  {
    Icon: BookOpen,
    title: "SOP & training hub",
    description:
      "Store your procedures, recipes, and brand standards in one place. New starters get up to speed faster.",
  },
  {
    Icon: BarChart3,
    title: "Reporting & analytics",
    description:
      "Completion rates, recurring issues, compliance trends — surfaced automatically. No spreadsheet digging.",
  },
  {
    Icon: Building2,
    title: "Multi-location visibility",
    description:
      "Manage every site from one dashboard. Spot inconsistencies, maintain standards, and stay in control wherever you are.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-background py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="section-label mb-3">What you get</p>
          <h2 className="font-display text-3xl sm:text-4xl text-foreground mb-4">
            Everything you need to run a consistent operation.
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Purpose-built features for hospitality — not adapted from a generic task manager.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ Icon, title, description }) => (
            <div
              key={title}
              className="card-surface p-6 flex flex-col gap-4 hover:shadow-md transition-shadow"
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "hsl(var(--sage-light))" }}
              >
                <Icon size={18} style={{ color: "hsl(var(--sage))" }} />
              </div>

              <div>
                <h3 className="font-semibold text-base text-foreground mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
