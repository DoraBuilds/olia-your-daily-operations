import { Settings2, TabletSmartphone, LayoutDashboard, ArrowRight } from "lucide-react";

const STEPS = [
  {
    number: "01",
    Icon: Settings2,
    title: "Set up your routines",
    description:
      "Build opening, closing, and compliance checklists for your venue — or start from our ready-made hospitality templates. Takes about an hour.",
  },
  {
    number: "02",
    Icon: TabletSmartphone,
    title: "Staff complete tasks on the kiosk",
    description:
      "Staff tap through their tasks on a tablet in your venue. No app to download, no login, no training required. Just tap, confirm, and get on with the shift.",
  },
  {
    number: "03",
    Icon: LayoutDashboard,
    title: "Managers see what's happening",
    description:
      "Every completion is timestamped and logged. Check in from your phone, your office, or across all your locations. In real time.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-background py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="section-label mb-3">How it works</p>
          <h2 className="font-display text-3xl sm:text-4xl text-foreground mb-4">
            One system for your whole operation.
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Olia works in two places at once — on the floor for your team, and in your
            pocket for you.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-6 relative">
          {STEPS.map(({ number, Icon, title, description }, i) => (
            <div key={number} className="relative">
              {/* Connector arrow — desktop only */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:flex absolute top-10 -right-3 z-10 items-center justify-center">
                  <ArrowRight size={20} className="text-border" />
                </div>
              )}

              {/* Card */}
              <div className="card-surface p-6 h-full">
                {/* Step number + icon */}
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="font-display text-4xl leading-none font-bold"
                    style={{ color: "hsl(var(--sage) / 0.12)" }}
                  >
                    {number}
                  </span>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "hsl(var(--sage-light))" }}
                  >
                    <Icon size={18} style={{ color: "hsl(var(--sage))" }} />
                  </div>
                </div>

                <h3 className="font-display text-lg text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
