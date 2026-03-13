// We mock the supabase-js module to avoid needing real env vars in tests
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    }),
    functions: {
      invoke: vi.fn(),
    },
  }),
}));

describe("supabase client", () => {
  it("exports supabase object", async () => {
    const mod = await import("@/lib/supabase");
    expect(mod.supabase).toBeDefined();
  });

  it("supabase is an object", async () => {
    const mod = await import("@/lib/supabase");
    expect(typeof mod.supabase).toBe("object");
  });

  it("supabase.from is a function", async () => {
    const mod = await import("@/lib/supabase");
    expect(typeof mod.supabase.from).toBe("function");
  });

  it("supabase.auth is defined", async () => {
    const mod = await import("@/lib/supabase");
    expect(mod.supabase.auth).toBeDefined();
  });

  it("supabase.auth.signInWithPassword is a function", async () => {
    const mod = await import("@/lib/supabase");
    expect(typeof mod.supabase.auth.signInWithPassword).toBe("function");
  });

  it("supabase.auth.signOut is a function", async () => {
    const mod = await import("@/lib/supabase");
    expect(typeof mod.supabase.auth.signOut).toBe("function");
  });
});
