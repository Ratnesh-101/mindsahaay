// Test helpers shared by edge function tests (not a test file itself).
import { vi } from "vitest";
import type { AnthropicLike } from "./claude.ts";

export interface FakeAnthropicOptions {
  /** Text returned by the classifier call, or an Error to throw. */
  classifier?: string | Error;
  /** Text deltas yielded by the generation stream. */
  chunks?: string[];
  /** Error thrown when the stream is created. */
  streamError?: Error;
}

export function createFakeAnthropic(opts: FakeAnthropicOptions = {}) {
  const { classifier = "none", chunks = ["Hello, ", "I am here."], streamError } = opts;

  const create = vi.fn(async (_args: any) => {
    if (classifier instanceof Error) throw classifier;
    return { content: [{ type: "text", text: classifier }] };
  });

  const stream = vi.fn((_args: any) => {
    if (streamError) throw streamError;
    return {
      async *[Symbol.asyncIterator]() {
        for (const text of chunks) {
          yield { type: "content_block_delta", delta: { type: "text_delta", text } };
        }
      },
      finalMessage: async () => ({ usage: { input_tokens: 11, output_tokens: 7 } }),
    };
  });

  const client: AnthropicLike = { messages: { create, stream } };
  const factory = vi.fn((_apiKey: string) => client);
  return { client, factory, create, stream };
}

export interface RecordedCall {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  payload?: any;
  filters: Array<[string, any]>;
}

/**
 * Chainable Supabase query-builder fake. Records every call so tests can assert which
 * identity was used in filters and payloads.
 */
export function createFakeSupabase(
  resultFor: (call: RecordedCall) => { data?: any; error?: any } = () => ({ data: null, error: null }),
  rpcResult: (name: string, args: any) => { data?: any; error?: any } = () => ({ data: null, error: null }),
) {
  const calls: RecordedCall[] = [];
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const deletedAuthUsers: string[] = [];

  function from(table: string) {
    const call: RecordedCall = { table, op: "select", filters: [] };
    calls.push(call);
    const b: any = {
      select: () => b,
      insert: (payload: any) => {
        call.op = "insert";
        call.payload = payload;
        return b;
      },
      upsert: (payload: any) => {
        call.op = "upsert";
        call.payload = payload;
        return b;
      },
      update: (payload: any) => {
        call.op = "update";
        call.payload = payload;
        return b;
      },
      delete: () => {
        call.op = "delete";
        return b;
      },
      eq: (col: string, val: any) => {
        call.filters.push([col, val]);
        return b;
      },
      order: () => b,
      limit: () => b,
      single: () => b,
      maybeSingle: () => b,
      then: (resolve: any, reject: any) => Promise.resolve({ data: null, error: null, ...resultFor(call) }).then(resolve, reject),
    };
    return b;
  }

  const client = {
    from,
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null, ...rpcResult(name, args) };
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deletedAuthUsers.push(id);
          return { error: null };
        },
      },
    },
  };

  return { client, calls, rpcCalls, deletedAuthUsers };
}
