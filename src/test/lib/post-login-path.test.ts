import { beforeEach, describe, expect, it } from "vitest";
import { consumePostLoginPath, rememberPostLoginPath } from "@/lib/post-login-path";

describe("post-login path", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns the remembered path once, then the fallback", () => {
    rememberPostLoginPath("/notifications?alert=1");
    expect(consumePostLoginPath("/admin")).toBe("/notifications?alert=1");
    expect(consumePostLoginPath("/admin")).toBe("/admin");
  });

  it("ignores off-site and login paths", () => {
    rememberPostLoginPath("//evil.com");
    expect(consumePostLoginPath("/admin")).toBe("/admin");
    rememberPostLoginPath("/login");
    expect(consumePostLoginPath("/admin")).toBe("/admin");
  });
});
