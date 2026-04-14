import { buildGitHubPagesRoute, buildPublicAuthRedirectUrl, restoreGitHubPagesRoute } from "@/lib/github-pages-routing";

describe("github-pages-routing", () => {
  it("returns null when the fallback query param is missing", () => {
    expect(buildGitHubPagesRoute("", "/repo/")).toBeNull();
  });

  it("restores a deep link under the GitHub Pages base path", () => {
    expect(buildGitHubPagesRoute("?p=%2Fdashboard", "/olia-your-daily-operations/")).toBe(
      "/olia-your-daily-operations/dashboard",
    );
  });

  it("preserves search and hash fragments in the restored route", () => {
    expect(buildGitHubPagesRoute("?p=%2Fchecklists%2Fcl-1%3Ftab%3Dreporting%23history", "/olia/")).toBe(
      "/olia/checklists/cl-1?tab=reporting#history",
    );
  });

  it("does not add a duplicate slash for root base paths", () => {
    expect(buildGitHubPagesRoute("?p=admin", "/")).toBe("/admin");
  });

  it("preserves the current hash when restoring a GitHub Pages fallback route", () => {
    expect(restoreGitHubPagesRoute("?p=%2Fauth%2Fcallback", "/olia-your-daily-operations/", "#access_token=abc")).toBe(
      "/olia-your-daily-operations/auth/callback#access_token=abc",
    );
  });

  it("unwraps nested fallback params instead of recursively growing the route", () => {
    expect(
      buildGitHubPagesRoute(
        "?p=%2Fadmin%2F%3Fp%3D%252Fadmin%252Flocation",
        "/olia-your-daily-operations/",
      ),
    ).toBe("/olia-your-daily-operations/admin/location");
  });

  it("strips a residual empty ?p= sentinel so it is never re-encoded on the next refresh", () => {
    // ?p=%2Fadmin%3Fp%3D decodes to /admin?p= — the inner ?p= is empty and
    // must be stripped from the restored URL, otherwise the next page refresh
    // would re-encode it and the sentinel would grow.
    expect(
      buildGitHubPagesRoute("?p=%2Fadmin%3Fp%3D", "/olia-your-daily-operations/"),
    ).toBe("/olia-your-daily-operations/admin");
  });

  it("preserves non-sentinel query params while stripping ?p= from the restored route", () => {
    // ?p=%2Fadmin%3Ftab%3Dreporting — the inner route has a real query param
    // (tab=reporting) that must survive while any ?p= is stripped.
    expect(
      buildGitHubPagesRoute("?p=%2Fadmin%3Ftab%3Dreporting", "/olia-your-daily-operations/"),
    ).toBe("/olia-your-daily-operations/admin?tab=reporting");
  });

  it("builds a GitHub Pages-safe auth redirect URL", () => {
    expect(buildPublicAuthRedirectUrl("https://dorabuilds.github.io/olia-your-daily-operations", "/auth/callback")).toBe(
      "https://dorabuilds.github.io/olia-your-daily-operations?p=%2Fauth%2Fcallback",
    );
  });

  it("builds a direct auth redirect URL for non-GitHub Pages hosts", () => {
    expect(buildPublicAuthRedirectUrl("https://app.olia.com", "/auth/callback")).toBe(
      "https://app.olia.com/auth/callback",
    );
  });
});
