import { createClient } from "@supabase/supabase-js";
import { runtimeConfig } from "@/lib/runtime-config";

export const supabase = createClient(
  runtimeConfig.supabaseUrl,
  runtimeConfig.supabaseAnonKey,
);
