// ==============================================================================
// DEPRECATED: kv_store.tsx
// This insecure KV-store module has been deprecated and replaced by the relational
// PostgreSQL schema with Row-Level Security (RLS) under India DPDP Act 2023.
// See migrations/0001_core.sql and server/index.tsx.
// ==============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const client = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

export const set = async (_key: string, _value: any): Promise<void> => {
  console.warn("kv_store.set is deprecated. Use relational PostgreSQL tables with RLS.");
};

export const get = async (_key: string): Promise<any> => {
  console.warn("kv_store.get is deprecated. Use relational PostgreSQL tables with RLS.");
  return null;
};

export const del = async (_key: string): Promise<void> => {
  console.warn("kv_store.del is deprecated. Use relational PostgreSQL tables with RLS.");
};
