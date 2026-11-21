-- ==============================================================================
-- Migration: 0003_rate_limit.sql
-- Project: MindSahaay (Digital Mental Health Platform for Indian HEIs)
-- Description: PostgreSQL Token-Bucket Rate Limiter (Table, Security Definer Function, RLS)
-- Compliance: India DPDP Act 2023, Anti-Abuse & Infrastructure Protection
-- ==============================================================================

-- 1. Rate Limit Buckets Table
-- Stores token balances and refill timestamps per key (e.g. user UUID, IP hash, endpoint)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  tokens double precision NOT NULL,
  last_refill timestamptz NOT NULL DEFAULT now(),
  max_tokens integer NOT NULL DEFAULT 20,
  refill_rate double precision NOT NULL DEFAULT 0.3333333333333333, -- ~20 tokens per 60 seconds
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for maintenance and cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON public.rate_limits (updated_at);

-- 2. Row Level Security (RLS) - STRICT DEFAULT DENY
-- Direct client access is completely forbidden. Only SECURITY DEFINER functions or service role can access.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limits TO service_role;

-- 3. Token-Bucket Algorithm Implementation (Atomic SECURITY DEFINER)
-- Atomically replenishes tokens based on elapsed wall-clock time and decrements requested cost.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max_tokens integer DEFAULT 20,
  p_window_seconds integer DEFAULT 60,
  p_cost integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_tokens double precision;
  v_last_refill timestamptz;
  v_refill_rate double precision;
  v_new_tokens double precision;
  v_elapsed double precision;
  v_allowed boolean;
  v_remaining integer;
  v_reset_in_ms integer;
BEGIN
  IF p_key IS NULL OR p_key = '' THEN
    RAISE EXCEPTION 'Rate limit key cannot be null or empty';
  END IF;

  IF p_max_tokens <= 0 OR p_window_seconds <= 0 OR p_cost <= 0 THEN
    RAISE EXCEPTION 'Rate limit configuration parameters must be positive integers';
  END IF;

  -- Refill rate: tokens replenished per second
  v_refill_rate := p_max_tokens::double precision / p_window_seconds::double precision;

  -- Lock row for update to prevent concurrent race conditions
  SELECT tokens, last_refill INTO v_tokens, v_last_refill
  FROM public.rate_limits
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First request for this key: initialize full capacity minus cost
    IF p_max_tokens >= p_cost THEN
      v_allowed := true;
      v_new_tokens := (p_max_tokens - p_cost)::double precision;
      v_remaining := FLOOR(v_new_tokens)::integer;
      v_reset_in_ms := 0;
    ELSE
      v_allowed := false;
      v_new_tokens := p_max_tokens::double precision;
      v_remaining := 0;
      v_reset_in_ms := CEIL(((p_cost - v_new_tokens) / v_refill_rate) * 1000)::integer;
    END IF;

    INSERT INTO public.rate_limits (
      key,
      tokens,
      last_refill,
      max_tokens,
      refill_rate,
      created_at,
      updated_at
    ) VALUES (
      p_key,
      v_new_tokens,
      v_now,
      p_max_tokens,
      v_refill_rate,
      v_now,
      v_now
    )
    ON CONFLICT (key) DO UPDATE
      SET tokens = EXCLUDED.tokens,
          last_refill = EXCLUDED.last_refill,
          updated_at = EXCLUDED.updated_at;

  ELSE
    -- Row exists: compute elapsed time and replenished tokens
    v_elapsed := EXTRACT(EPOCH FROM (v_now - v_last_refill));
    IF v_elapsed < 0 THEN
      v_elapsed := 0;
    END IF;

    -- Add newly accrued tokens up to maximum bucket capacity
    v_new_tokens := LEAST(p_max_tokens::double precision, v_tokens + (v_elapsed * v_refill_rate));

    IF v_new_tokens >= p_cost THEN
      v_allowed := true;
      v_new_tokens := v_new_tokens - p_cost;
      v_remaining := FLOOR(v_new_tokens)::integer;
      v_reset_in_ms := 0;
    ELSE
      v_allowed := false;
      v_remaining := 0;
      -- Time in milliseconds until enough tokens replenish to satisfy requested cost
      v_reset_in_ms := CEIL(((p_cost - v_new_tokens) / v_refill_rate) * 1000)::integer;
    END IF;

    -- Persist state
    UPDATE public.rate_limits
    SET tokens = v_new_tokens,
        last_refill = v_now,
        max_tokens = p_max_tokens,
        refill_rate = v_refill_rate,
        updated_at = v_now
    WHERE key = p_key;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'remaining', v_remaining,
    'resetInMs', v_reset_in_ms,
    'reset_in_ms', v_reset_in_ms
  );
END;
$$;

-- Allow edge functions and authenticated users to invoke rate limit checking via RPC
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer, integer) TO authenticated, service_role, anon;

-- 4. Stale Record Housekeeping Function
-- Deletes inactive buckets older than 24 hours to prevent unbounded table growth
CREATE OR REPLACE FUNCTION public.cleanup_stale_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.rate_limits
  WHERE updated_at < now() - interval '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_rate_limits() TO service_role;
