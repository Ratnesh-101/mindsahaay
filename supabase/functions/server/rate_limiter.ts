// ==============================================================================
// PostgreSQL Token-Bucket Rate Limiter for Supabase Edge Runtime
// Calls migration 0003_rate_limit.sql atomic SECURITY DEFINER function:
// public.check_rate_limit(p_key, p_max_tokens, p_window_seconds, p_cost)
// Prevents API abuse, protects student safety, controls LLM inference costs
// ==============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

// In-memory fallback in case of temporary database disconnection
const fallbackStore = new Map<string, { count: number; resetAt: number }>();

function inMemoryFallback(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const record = fallbackStore.get(key);

  if (!record || now > record.resetAt) {
    fallbackStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetInMs: windowMs };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetInMs: Math.max(0, record.resetAt - now) };
  }

  record.count += 1;
  return { allowed: true, remaining: maxRequests - record.count, resetInMs: Math.max(0, record.resetAt - now) };
}

/**
 * Checks rate limit via PostgreSQL token-bucket stored procedure.
 * Atomically deducts 1 token if available; otherwise returns reset delay.
 */
export async function checkRateLimit(
  key: string,
  maxRequests = 20,
  windowMs = 60_000,
  client?: any,
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

  if (client) {
    try {
      const { data, error } = await client.rpc("check_rate_limit", {
        p_key: key,
        p_max_tokens: maxRequests,
        p_window_seconds: windowSeconds,
        p_cost: 1,
      });

      if (!error && data) {
        return {
          allowed: Boolean(data.allowed),
          remaining: typeof data.remaining === "number" ? data.remaining : 0,
          resetInMs: typeof data.resetInMs === "number" ? data.resetInMs : (data.reset_in_ms ?? 0),
        };
      }
      if (error) {
        console.warn("Postgres check_rate_limit RPC warning, fallback activated:", error.message);
      }
    } catch (err: any) {
      console.warn("Postgres check_rate_limit error, fallback activated:", err?.message);
    }
  }

  return inMemoryFallback(key, maxRequests, windowMs);
}
