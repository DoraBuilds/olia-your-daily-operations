import { buildGitHubPagesRoute } from "@/lib/github-pages-routing";

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
});
