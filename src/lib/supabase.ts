import { createClient } from "@supabase/supabase-js";
import { runtimeConfig } from "@/lib/runtime-config";
import { supportModeFetch } from "@/lib/support-mode";

export const supabase = createClient(
  runtimeConfig.supabaseUrl,
  runtimeConfig.supabaseAnonKey,
  { global: { fetch: supportModeFetch } },
);
