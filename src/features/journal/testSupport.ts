/**
 * Test helpers for the content features: an in-memory fake of the Supabase client and an i18next
 * bootstrap. Only imported from *.test.ts(x) files.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { vi } from "vitest";

export type Row = Record<string, unknown>;

export interface FakeState {
  tables: Record<string, Row[]>;
  userId: string;
  userMetadata: Record<string, unknown>;
  signedIn: boolean;
  channelHandlers: ((payload: Record<string, unknown>) => void)[];
  removedChannels: number;
  counter: number;
}

export const fake: FakeState = {
  tables: {},
  userId: "user-1",
  userMetadata: {},
  signedIn: true,
  channelHandlers: [],
  removedChannels: 0,
  counter: 0,
};

export function resetFake(tables: Record<string, Row[]> = {}, userId = "user-1"): void {
  fake.tables = {};
  for (const [name, rows] of Object.entries(tables)) fake.tables[name] = rows.map((r) => ({ ...r }));
  fake.userId = userId;
  fake.userMetadata = {};
  fake.signedIn = true;
  fake.channelHandlers = [];
  fake.removedChannels = 0;
  fake.counter = 0;
}

type Result = { data: unknown; error: { message: string; code?: string } | null };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: ((r: Row) => boolean)[] = [];
  private payload: Row | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private returning = false;

  constructor(private table: string) {}

  select(_cols?: string): this {
    if (this.op === "insert" || this.op === "update") this.returning = true;
    else this.op = "select";
    return this;
  }
  insert(row: Row): this {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push((r) => String(r[col]) >= String(val));
    return this;
  }
  like(col: string, pattern: string): this {
    const prefix = pattern.replace(/%$/, "");
    this.filters.push((r) => String(r[col]).startsWith(prefix));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybe";
    return this;
  }

  private run(): Result {
    const rows = (fake.tables[this.table] ??= []);
    if (this.op === "insert") {
      const row: Row = {
        id: `${this.table}-${++fake.counter}`,
        created_at: new Date(2026, 0, 1, 0, 0, fake.counter).toISOString(),
        ...this.payload,
      };
      rows.push(row);
      return { data: this.mode === "many" && !this.returning ? null : this.mode === "many" ? [row] : row, error: null };
    }
    const matches = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      matches.forEach((r) => Object.assign(r, this.payload));
      return { data: matches, error: null };
    }
    if (this.op === "delete") {
      fake.tables[this.table] = rows.filter((r) => !matches.includes(r));
      return { data: null, error: null };
    }
    let out = [...matches];
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.max !== null) out = out.slice(0, this.max);
    if (this.mode === "single") return { data: out[0] ?? null, error: out[0] ? null : { message: "not found" } };
    if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

function currentUser() {
  return { id: fake.userId, email: "student@example.edu", user_metadata: fake.userMetadata };
}

export const fakeSupabase = {
  from: (table: string) => new Query(table),
  auth: {
    getSession: async () => ({
      data: { session: fake.signedIn ? { access_token: "test-token", user: currentUser() } : null },
      error: null,
    }),
    getUser: async () => ({ data: { user: fake.signedIn ? currentUser() : null }, error: null }),
    updateUser: async (attrs: { data?: Record<string, unknown> }) => {
      fake.userMetadata = { ...fake.userMetadata, ...attrs.data };
      return { data: { user: currentUser() }, error: null };
    },
  },
  channel: () => {
    const channel = {
      on: (_type: string, _filter: unknown, handler: (payload: Record<string, unknown>) => void) => {
        fake.channelHandlers.push(handler);
        return channel;
      },
      subscribe: (cb?: (status: string) => void) => {
        cb?.("SUBSCRIBED");
        return channel;
      },
    };
    return channel;
  },
  removeChannel: async () => {
    fake.removedChannels += 1;
    return "ok";
  },
};

/** Factory for vi.mock("<path>/shared/lib/supabase", ...). */
export function supabaseModule() {
  return {
    supabase: fakeSupabase,
    default: fakeSupabase,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    FUNCTIONS_BASE_URL: "https://test.supabase.co/functions/v1/make-server-6534ec8c",
    getFunctionUrl: (path: string) => `https://test.supabase.co/functions/v1/make-server-6534ec8c${path.startsWith("/") ? path : `/${path}`}`,
  };
}

/** Initialises i18next once for component tests. Feature bundles merge themselves when they are imported. */
export async function setupI18n(lng: "en" | "hi" = "en"): Promise<void> {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng,
      fallbackLng: "en",
      resources: { en: { translation: {} }, hi: { translation: {} } },
      interpolation: { escapeValue: false },
    });
  } else if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
  }
}

export function spyFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal("fetch", spy);
  return spy;
}
