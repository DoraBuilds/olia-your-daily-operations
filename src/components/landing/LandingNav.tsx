import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          to="/"
          className="font-display text-2xl tracking-tight text-foreground shrink-0"
        >
          Olia
        </Link>

        {/* Nav links — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-6">
          <a
            href="#how-it-works"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </a>
          <a
            href="#features"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </a>
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg"
          >
            Sign in
          </Link>
          <a
            href="mailto:hello@useolia.com?subject=Demo request"
            className="hidden sm:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg"
          >
            Book a demo
          </a>
          <Link
            to="/signup"
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-sage text-white px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
          >
            Get started
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}
