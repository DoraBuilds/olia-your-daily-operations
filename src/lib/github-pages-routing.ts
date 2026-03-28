function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === "/") return "";
  return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
}

function normalizeFallbackRoute(fallbackRoute: string): string {
  return fallbackRoute.startsWith("/") ? fallbackRoute : `/${fallbackRoute}`;
}

export function buildGitHubPagesRoute(search: string, basePath: string): string | null {
  const searchParams = new URLSearchParams(search);
  const fallbackRoute = searchParams.get("p");
  if (!fallbackRoute) return null;

  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedRoute = normalizeFallbackRoute(fallbackRoute);
  return `${normalizedBasePath}${normalizedRoute}`;
}

export function restoreGitHubPagesRoute(search: string, basePath: string) {
  return buildGitHubPagesRoute(search, basePath);
}
