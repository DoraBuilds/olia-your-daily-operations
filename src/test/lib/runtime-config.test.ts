import { buildRuntimeConfig } from "@/lib/runtime-config";

describe("runtime-config", () => {
  it("throws a clear error when Supabase URL is missing", () => {
    expect(() =>
      buildRuntimeConfig(
        { VITE_SUPABASE_ANON_KEY: "anon-key" },
        "https://olia.app",
      ),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  it("throws a clear error when Supabase anon key is missing", () => {
    expect(() =>
      buildRuntimeConfig(
        { VITE_SUPABASE_URL: "https://example.supabase.co" },
        "https://olia.app",
      ),
    ).toThrow(/VITE_SUPABASE_ANON_KEY/);
  });

  it("uses the current origin when public site url is not configured", () => {
    const config = buildRuntimeConfig(
      {
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon-key",
      },
      "https://app.olia.test/",
    );

    expect(config.publicSiteUrl).toBe("https://app.olia.test");
  });

  it("centralizes optional billing and maps config", () => {
    const config = buildRuntimeConfig(
      {
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon-key",
        VITE_STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
        VITE_STRIPE_CUSTOMER_PORTAL_URL: "https://billing.stripe.com/example",
        VITE_GOOGLE_MAPS_API_KEY: "maps-key",
      },
      "https://olia.app",
    );

    expect(config.stripe.priceIds.starter.monthly).toBe("price_starter_monthly");
    expect(config.stripe.customerPortalUrl).toBe("https://billing.stripe.com/example");
    expect(config.googleMapsApiKey).toBe("maps-key");
  });
});
