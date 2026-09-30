import { hasStoredSession, preloadPages } from "@/lib/preload-pages";

const store = (keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null });

describe("hasStoredSession", () => {
  it("is true when a Supabase auth token is saved", () => {
    expect(hasStoredSession(store(["theme", "sb-abcdef-auth-token"]))).toBe(true);
  });
  it("is false for other keys, including the PKCE verifier", () => {
    expect(hasStoredSession(store(["theme", "sb-abcdef-auth-token-code-verifier"]))).toBe(false);
    expect(hasStoredSession(store([]))).toBe(false);
  });
  it("is false, not a crash, when storage throws", () => {
    const blocked = { get length(): number { throw new Error("blocked"); }, key: () => null };
    expect(hasStoredSession(blocked)).toBe(false);
  });
});

describe("preloadPages", () => {
  const make = () => {
    const loaded: string[] = [];
    const route = (prefix: string, fail = false) => ({
      prefix,
      load: () => { loaded.push(prefix); return fail ? Promise.reject(new Error("offline")) : Promise.resolve(); },
    });
    return { loaded, route };
  };

  it("loads the page being opened immediately and defers the rest to idle time", () => {
    const { loaded, route } = make();
    const idle: Array<() => void> = [];
    preloadPages("/checklists", [route("/dashboard"), route("/checklists"), route("/admin")], fn => idle.push(fn));

    expect(loaded).toEqual(["/checklists"]);
    idle.forEach(fn => fn());
    expect(loaded).toEqual(["/checklists", "/dashboard", "/admin"]);
  });

  it("matches nested paths but not look-alike prefixes", () => {
    const { loaded, route } = make();
    preloadPages("/admin/users", [route("/admin"), route("/adminx")], () => {});
    expect(loaded).toEqual(["/admin"]);
  });

  it("on an unknown path (e.g. the landing page) loads nothing immediately", () => {
    const { loaded, route } = make();
    preloadPages("/", [route("/dashboard")], () => {});
    expect(loaded).toEqual([]);
  });

  it("swallows a failed download", async () => {
    const { route } = make();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    preloadPages("/dashboard", [route("/dashboard", true)], () => {});
    await new Promise(r => setTimeout(r, 10));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
