import { Link } from "react-router-dom";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          {/* Logo + tagline */}
          <div>
            <Link to="/" className="font-display text-xl text-foreground">
              Olia
            </Link>
            <p className="text-sm text-muted-foreground mt-1">
              Operations software for hospitality teams.
            </p>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <a
              href="mailto:hello@useolia.com?subject=Demo request"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Book a demo
            </a>
            <a
              href="mailto:hello@useolia.com"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact
            </a>
            <Link
              to="/signup"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign up
            </Link>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Olia. All rights reserved.
          </p>
          <div className="flex gap-4">
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Privacy
            </a>
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
