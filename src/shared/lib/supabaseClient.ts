import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The only module that imports the Supabase SDK at runtime. It is loaded with a dynamic import from
 * ./supabase.ts so the SDK (about 55 KB gzip) stays out of the first-paint bundle.
 */
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
