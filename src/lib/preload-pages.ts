/**
 * Start downloading the signed-in pages' code at boot instead of after sign-in.
 *
 * Routes are `lazy()`, and <ProtectedRoute> only renders its page once the
 * profile has loaded — so the page's JS used to begin downloading only after
 * the auth round trips finished, one step behind them. With a saved session
 * we already know the user is about to land in the app, so fetch the page
 * they're opening straight away (in parallel with auth) and the other main
 * pages once the browser is idle.
 */

export interface PreloadRoute {
  /** Path prefix, e.g. "/checklists". */
  prefix: string;
  load: () => Promise<unknown>;
}

/** True when Supabase has a session saved in this browser (`sb-<ref>-auth-token`). */
export function hasStoredSession(storage: Pick<Storage, "length" | "key"> = localStorage): boolean {
  try {
    for (let i = 0; i < storage.length; i++) {
      if (/^sb-.+-auth-token$/.test(storage.key(i) ?? "")) return true;
    }
  } catch {
    // Storage blocked — treat as signed out.
  }
  return false;
}

const whenIdle = (fn: () => void) => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(fn);
  } else {
    setTimeout(fn, 1500);
  }
};

export function preloadPages(
  pathname: string,
  routes: PreloadRoute[],
  schedule: (fn: () => void) => void = whenIdle,
) {
  const swallow = () => { /* a failed prefetch just means the normal lazy load happens later */ };
  const isCurrent = (r: PreloadRoute) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`);

  routes.filter(isCurrent).forEach(r => { r.load().catch(swallow); });
  routes.filter(r => !isCurrent(r)).forEach(r => schedule(() => { r.load().catch(swallow); }));
}
