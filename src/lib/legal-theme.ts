import type { CSSProperties } from "react";

/**
 * Locally overrides the app's global shadcn color tokens (--background,
 * --foreground, --muted-foreground, --border) with the new marketing site's
 * white/near-black palette, scoped to a single page via inline style — the
 * rest of the authenticated app keeps its existing navy/lavender theme.
 */
export const legalTheme = {
  "--background": "0 0% 100%",
  "--foreground": "135 15% 5%",
  "--muted-foreground": "142 7% 32%",
  "--border": "0 0% 88%",
  "--muted": "0 0% 95%",
  "--ring": "173 100% 45%",
} as CSSProperties;

export const legalLinkStyle = `.legal-scope a { color: #007E70; text-decoration-color: rgba(0,229,204,0.5); } .legal-scope a:hover { color: hsl(var(--foreground)); text-decoration-color: currentColor; }`;

// Routes on the new white/black/teal marketing design.
export const NEW_DESIGN_ROUTES = ["/", "/login", "/signup", "/privacy", "/terms", "/cookies", "/aviso-legal"];

export function isNewDesignPath(pathname: string) {
  return NEW_DESIGN_ROUTES.some((route) => pathname.endsWith(route)) || pathname.includes("/experiments/");
}
