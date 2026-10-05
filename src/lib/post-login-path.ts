// Remembers the page a signed-out visitor was trying to reach (e.g. the
// "Open Olia" link in an alert email) so login can send them there instead
// of the default landing page (#1074).

const KEY = "olia_post_login_path";

// Internal paths only: never let a stored value bounce the user off-site.
function isSafePath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/login");
}

export function rememberPostLoginPath(path: string): void {
  try {
    if (isSafePath(path)) sessionStorage.setItem(KEY, path);
  } catch { /* storage unavailable */ }
}

export function consumePostLoginPath(fallback: string): string {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isSafePath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}
