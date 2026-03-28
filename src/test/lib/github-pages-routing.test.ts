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
