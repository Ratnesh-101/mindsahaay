import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import I18nProvider from "../../app/providers/I18nProvider";

/** Test-only helpers (not imported by app code). */

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

export function Providers({ client, children }: { client: QueryClient; children: React.ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
}

export interface FakeBackend {
  counts: { mood_entries: number; assessments: number };
  rpcCalls: string[];
  /** When set, the next rpc call fails with this error. */
  rpcError: { message: string; code?: string; status?: number } | null;
  /** When set, the next rpc call returns this payload instead of counts. */
  rpcPayload: unknown;
  /** When true, the presence queries fail. */
  statusError: boolean;
  /** When false, getSession reports no session. */
  signedIn: boolean;
}

export function makeBackend(): FakeBackend {
  return {
    counts: { mood_entries: 0, assessments: 0 },
    rpcCalls: [],
    rpcError: null,
    rpcPayload: undefined,
    statusError: false,
    signedIn: true,
  };
}

/** A minimal stand-in for the supabase facade that behaves like the DB CONTRACT. */
export function makeFakeSupabase(backend: FakeBackend) {
  return {
    auth: {
      getSession: async () =>
        backend.signedIn
          ? { data: { session: { access_token: "t", user: { id: "u1" } } }, error: null }
          : { data: { session: null }, error: null },
    },
    rpc: async (name: string) => {
      backend.rpcCalls.push(name);
      if (backend.rpcError) {
        const error = backend.rpcError;
        backend.rpcError = null;
        return { data: null, error };
      }
      if (backend.rpcPayload !== undefined) {
        return { data: backend.rpcPayload, error: null };
      }
      if (name === "load_demo_data") {
        backend.counts = { mood_entries: 26, assessments: 3 };
        return { data: { moods: 26, assessments: 3 }, error: null };
      }
      const removed = { moods: backend.counts.mood_entries, assessments: backend.counts.assessments };
      backend.counts = { mood_entries: 0, assessments: 0 };
      return { data: removed, error: null };
    },
    from: (table: "mood_entries" | "assessments") => ({
      select: () => ({
        eq: async () =>
          backend.statusError
            ? { count: null, error: { message: "boom", code: "XX000" } }
            : { count: backend.counts[table], error: null },
      }),
    }),
  };
}
