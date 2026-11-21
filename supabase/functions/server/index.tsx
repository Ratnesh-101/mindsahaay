// ==============================================================================
// MindSahaay Platform - Supabase Edge Function entrypoint (Deno)
// Wires production dependencies into the testable app factory in app.ts.
// Do not add route logic here.
// ==============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { createApp } from "./app.ts";
import { createAnthropicClient } from "./anthropic_client.ts";

const env = (name: string) => Deno.env.get(name);

const SUPABASE_URL = env("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY") || "";

function getUserClient(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

const app = createApp({
  env,
  getAdminClient: () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  getUserClient,
  verifyJwt: async (token: string) => {
    const {
      data: { user },
      error,
    } = await getUserClient(token).auth.getUser(token);
    return error || !user ? null : user;
  },
  createAnthropic: createAnthropicClient,
});

// @ts-ignore - Deno global serve
Deno.serve(app.fetch);
