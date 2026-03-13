import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays } from "lucide-react";
import { KioskMock } from "./KioskMock";

export function HeroSection() {
  return (
    <section className="bg-background overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ── Left: copy ── */}
          <div className="order-2 lg:order-1 text-center lg:text-left">
            {/* Eyebrow */}
            <p className="section-label mb-4">
              Built specifically for hospitality operations.&nbsp; Not a generic task manager.
            </p>

            {/* Headline */}
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] leading-[1.1] tracking-tight text-foreground mb-5">
              Run every shift the same way —&nbsp;every&nbsp;time.
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-[480px] mx-auto lg:mx-0">
              Olia replaces paper checklists and WhatsApp chasing with a simple
              system your team actually uses.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center lg:items-start gap-3 sm:gap-4">
              <Link
                to="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-sage text-white text-base font-semibold px-7 py-3.5 rounded-2xl hover:opacity-90 transition-opacity"
              >
                Set up your first checklist
                <ArrowRight size={16} />
              </Link>
              <a
                href="mailto:hello@useolia.com?subject=Demo request"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-card border border-border text-foreground text-base font-medium px-6 py-3.5 rounded-2xl hover:bg-background transition-colors"
              >
                <CalendarDays size={16} className="text-muted-foreground" />
                Book a demo
              </a>
            </div>

            {/* Trust line */}
            <p className="mt-5 text-sm text-muted-foreground">
              Starter from €49 · per location · no per-user fees
            </p>
          </div>

          {/* ── Right: Kiosk mockup ── */}
          <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
            <KioskMock />
          </div>
        </div>
      </div>
    </section>
  );
}
