import { Link } from "react-router-dom";
import { ArrowRight, Tablet, Clock4, ShieldCheck } from "lucide-react";

const DIFFERENTIATORS = [
  {
    Icon: Tablet,
    title: "Kiosk-first, not app-first",
    description:
      "Staff don't download anything. The kiosk lives on a tablet in your venue. Tap, confirm, done.",
  },
  {
    Icon: Clock4,
    title: "Shift-aware, not just date-aware",
    description:
      "Olia understands opening shifts, closing shifts, morning prep, and late clean-down — not just 'today'.",
  },
  {
    Icon: ShieldCheck,
    title: "Compliance-grade logging",
    description:
      "Every completion is timestamped and stored. Not just for your peace of mind — for your hygiene records and audit trail.",
  },
];

export function HospitalitySection() {
  return (
    <section className="py-20 sm:py-24" style={{ background: "hsl(var(--sage))" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="section-label mb-3" style={{ color: "hsl(var(--lavender))" }}>
            Why Olia
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-white mb-4">
            Built for the way restaurants actually work.
          </h2>
          <p className="text-white/60 text-base leading-relaxed">
            Not a repurposed task manager. Not a generic checklist tool.
            Olia was built from the ground up for shift-based teams,
            compliance logging, and multi-location oversight.
          </p>
        </div>

        {/* Differentiators */}
        <div className="grid sm:grid-cols-3 gap-5 mb-12">
          {DIFFERENTIATORS.map(({ Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl p-6"
              style={{ background: "hsl(var(--sage) / 0.5)", border: "1px solid hsl(var(--sage-light) / 0.1)" }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "hsl(var(--lavender-light) / 0.1)" }}
              >
                <Icon size={18} style={{ color: "hsl(var(--lavender))" }} />
              </div>
              <h3 className="font-semibold text-white text-base mb-2">{title}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 bg-white text-foreground font-semibold text-base px-7 py-3.5 rounded-2xl hover:opacity-90 transition-opacity"
          >
            Set up your first checklist
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
