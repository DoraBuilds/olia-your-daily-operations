// While true, the landing page replaces every Sign in / Get started CTA with a
// "Join the waitlist" email capture, and /signup redirects to the landing page.
// Flip it off by setting VITE_WAITLIST_MODE=false at build time.
export const WAITLIST_MODE: boolean = import.meta.env.VITE_WAITLIST_MODE !== "false";
