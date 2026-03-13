import { CheckCircle2 } from "lucide-react";

const BULLETS = [
  "No app to download. No account to create.",
  "Staff tap through tasks on a tablet already in your venue.",
  "Nothing to learn. Nothing to remember. Just show up and do the shift.",
  "New starters are operational on day one.",
];

export function StaffAdoptionSection() {
  return (
    <section className="bg-card py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* ── Left: visual accent card ── */}
          <div className="order-2 lg:order-1">
            <div
              className="rounded-3xl p-8 sm:p-10 relative overflow-hidden"
              style={{ background: "hsl(var(--sage))" }}
            >
              {/* Decorative circles */}
              <div
                className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10"
                style={{ background: "hsl(var(--lavender))" }}
              />
              <div
                className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10"
                style={{ background: "hsl(var(--powder-blue))" }}
              />

              {/* Kiosk interaction mockup */}
              <div className="relative space-y-3">
                <p className="text-white/50 text-xs font-semibold tracking-widest uppercase mb-5">
                  Staff view · Kiosk
                </p>

                {/* Simulated tap-to-complete items */}
                {[
                  "Confirm fridge temp ✓",
                  "Bar stocked and ready ✓",
                  "Opening float counted ✓",
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3"
                  >
                    <div
                      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-0"
                      style={{ background: "hsl(var(--status-ok))" }}
                    >
                      <CheckCircle2 size={14} className="text-white" />
                    </div>
                    <span className="text-white text-sm font-medium">{item}</span>
                  </div>
                ))}

                <div className="mt-6 pt-5 border-t border-white/10">
                  <p className="font-display text-white/80 text-sm italic">
                    "Done in 2 minutes. Back to the floor."
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: copy ── */}
          <div className="order-1 lg:order-2">
            <p className="section-label mb-3">Staff adoption</p>
            <h2 className="font-display text-3xl sm:text-4xl text-foreground mb-4">
              Your team won't fight this.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed mb-6">
              Staff don't install anything, create accounts, or learn new software.
              The kiosk lives on a tablet in your venue. They tap through tasks
              and move on with their shift.
            </p>

            <ul className="space-y-3">
              {BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <CheckCircle2
                    size={18}
                    className="shrink-0 mt-0.5"
                    style={{ color: "hsl(var(--status-ok))" }}
                  />
                  <span className="text-sm text-foreground leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
