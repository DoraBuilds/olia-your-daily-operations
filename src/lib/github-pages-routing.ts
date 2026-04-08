function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === "/") return "";
  return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
}

function normalizeFallbackRoute(fallbackRoute: string): string {
  return fallbackRoute.startsWith("/") ? fallbackRoute : `/${fallbackRoute}`;
}

function unwrapNestedFallbackRoute(fallbackRoute: string): string {
  let currentRoute = normalizeFallbackRoute(fallbackRoute);

  for (let i = 0; i < 10; i += 1) {
    const url = new URL(currentRoute, "https://olia.app");
    const nestedRoute = url.searchParams.get("p");

    if (!nestedRoute) {
      return `${url.pathname}${url.search}${url.hash}`;
    }

    currentRoute = normalizeFallbackRoute(nestedRoute);
  }

  return currentRoute;
}

function isGitHubPagesUrl(publicSiteUrl: string) {
  return new URL(publicSiteUrl).hostname.endsWith("github.io");
}

export function buildGitHubPagesRoute(search: string, basePath: string): string | null {
  const searchParams = new URLSearchParams(search);
  const fallbackRoute = searchParams.get("p");
  if (!fallbackRoute) return null;

  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedRoute = unwrapNestedFallbackRoute(fallbackRoute);
  return `${normalizedBasePath}${normalizedRoute}`;
}

export function restoreGitHubPagesRoute(search: string, basePath: string, hash = "") {
  const restoredRoute = buildGitHubPagesRoute(search, basePath);
  if (!restoredRoute) return null;

  return hash ? `${restoredRoute}${hash}` : restoredRoute;
}

export function buildPublicAuthRedirectUrl(publicSiteUrl: string, route: string) {
  const normalizedRoute = normalizeFallbackRoute(route);

  if (isGitHubPagesUrl(publicSiteUrl)) {
    const url = new URL(publicSiteUrl);
    url.searchParams.set("p", normalizedRoute);
    url.hash = "";
    return url.toString();
  }

  return new URL(normalizedRoute, publicSiteUrl.endsWith("/") ? publicSiteUrl : `${publicSiteUrl}/`).toString();
}
