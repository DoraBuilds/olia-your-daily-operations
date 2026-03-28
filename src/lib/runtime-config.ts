type EnvSource = Record<string, string | undefined>;

function readRequired(env: EnvSource, key: string, help: string): string {
  const value = env[key]?.trim();
  if (value) return value;
  throw new Error(`Missing required environment variable ${key}. ${help}`);
}

function readOptional(env: EnvSource, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export function buildRuntimeConfig(env: EnvSource, currentOrigin: string) {
  const publicSiteUrl = readOptional(env, "VITE_PUBLIC_SITE_URL");

  return {
    supabaseUrl: readRequired(
      env,
      "VITE_SUPABASE_URL",
      "Set it in your app env file before starting Vite or running the app.",
    ),
    supabaseAnonKey: readRequired(
      env,
      "VITE_SUPABASE_ANON_KEY",
      "Set it in your app env file before starting Vite or running the app.",
    ),
    publicSiteUrl: withoutTrailingSlash(publicSiteUrl ?? currentOrigin),
    stripe: {
      priceIds: {
        starter: {
          monthly: readOptional(env, "VITE_STRIPE_PRICE_STARTER_MONTHLY") ?? "",
          annual: readOptional(env, "VITE_STRIPE_PRICE_STARTER_ANNUAL") ?? "",
        },
        growth: {
          monthly: readOptional(env, "VITE_STRIPE_PRICE_GROWTH_MONTHLY") ?? "",
          annual: readOptional(env, "VITE_STRIPE_PRICE_GROWTH_ANNUAL") ?? "",
        },
      },
      customerPortalUrl: readOptional(env, "VITE_STRIPE_CUSTOMER_PORTAL_URL"),
    },
    googleMapsApiKey: readOptional(env, "VITE_GOOGLE_MAPS_API_KEY") ?? "",
  };
}

function resolveCurrentOrigin() {
  return typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "http://localhost:8080";
}

export function getRuntimeConfig() {
  return buildRuntimeConfig(import.meta.env, resolveCurrentOrigin());
}

export const runtimeConfig = getRuntimeConfig();
