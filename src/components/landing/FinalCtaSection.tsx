import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays } from "lucide-react";

export function FinalCtaSection() {
  return (
    <section className="py-20 sm:py-28" style={{ background: "hsl(var(--sage))" }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        {/* Headline */}
        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white leading-tight mb-5">
          Ready to stop chasing your team on WhatsApp?
        </h2>

        {/* Subhead */}
        <p className="text-white/60 text-lg mb-10">
          Set up your first checklist today. No card required.
          Most venues are running in under an hour.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/signup"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-foreground font-semibold text-base px-8 py-3.5 rounded-2xl hover:opacity-90 transition-opacity"
          >
            Set up your first checklist
            <ArrowRight size={16} />
          </Link>
          <a
            href="mailto:hello@useolia.com?subject=Demo request"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/25 text-white font-medium text-base px-7 py-3.5 rounded-2xl hover:bg-white/10 transition-colors"
          >
            <CalendarDays size={16} className="opacity-70" />
            Book a demo
          </a>
        </div>

        {/* Trust trio */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {["14-day free trial", "No credit card required", "Cancel anytime"].map((t) => (
            <span key={t} className="text-sm text-white/50 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-white/30" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
