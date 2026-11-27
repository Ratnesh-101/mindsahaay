-- ==============================================================================
-- Migration: 0010_chat_and_encrypted_blobs.sql
-- Description: Chat Persistence and Synced Encrypted Blobs (Wave 3 Architecture)
-- Author: Worker W1
-- Compliance: India DPDP Act 2023, Zero-Knowledge Encryption Architecture
-- ==============================================================================

-- ==============================================================================
-- 1. Chat Sessions Enhancements
-- ==============================================================================

-- 1.1 Add salt (base64, random per session) and key_version (default 1)
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS salt text;

UPDATE public.chat_sessions
SET salt = encode(gen_random_bytes(16), 'base64')
WHERE salt IS NULL;

ALTER TABLE public.chat_sessions
  ALTER COLUMN salt SET NOT NULL;

ALTER TABLE public.chat_sessions
  ALTER COLUMN salt SET DEFAULT encode(gen_random_bytes(16), 'base64');

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1;

-- 1.2 Title check constraint: title must be 'Well-being Chat'
ALTER TABLE public.chat_sessions
  DROP CONSTRAINT IF EXISTS chat_sessions_title_check;

ALTER TABLE public.chat_sessions
  ADD CONSTRAINT chat_sessions_title_check CHECK (title = 'Well-being Chat');

-- 1.3 Retention TTL check constraint: retention_ttl_days must be 30
ALTER TABLE public.chat_sessions
  DROP CONSTRAINT IF EXISTS chat_sessions_retention_ttl_days_check;

ALTER TABLE public.chat_sessions
  ADD CONSTRAINT chat_sessions_retention_ttl_days_check CHECK (retention_ttl_days = 30);

-- 1.4 Drop risk_level from chat_sessions
ALTER TABLE public.chat_sessions
  DROP COLUMN IF EXISTS risk_level;

-- 1.5 BEFORE INSERT trigger on chat_sessions to ensure created_at and updated_at are set to now()
CREATE OR REPLACE FUNCTION public.trg_chat_sessions_force_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_chat_sessions_force_dates() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_chat_sessions_force_dates ON public.chat_sessions;
CREATE TRIGGER trg_chat_sessions_force_dates
  BEFORE INSERT ON public.chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_chat_sessions_force_dates();

-- Re-affirm RLS policies on chat_sessions (strict owner isolation; no counsellor/moderator/admin access)
DROP POLICY IF EXISTS "Users exclusively view own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users exclusively view own chat sessions"
  ON public.chat_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users exclusively insert own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users exclusively insert own chat sessions"
  ON public.chat_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users exclusively update own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users exclusively update own chat sessions"
  ON public.chat_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users exclusively delete own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users exclusively delete own chat sessions"
  ON public.chat_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ==============================================================================
-- 2. Chat Messages Enhancements
-- ==============================================================================

-- 2.1 Set iv NOT NULL
ALTER TABLE public.chat_messages
  ALTER COLUMN iv SET NOT NULL;

-- 2.2 Add seq int NOT NULL and UNIQUE(session_id, seq)
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS seq int;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY session_id ORDER BY created_at ASC) as r_num
  FROM public.chat_messages
)
UPDATE public.chat_messages m
SET seq = n.r_num
FROM numbered n
WHERE m.id = n.id AND m.seq IS NULL;

ALTER TABLE public.chat_messages
  ALTER COLUMN seq SET NOT NULL;

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_session_id_seq_key;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_session_id_seq_key UNIQUE (session_id, seq);

-- 2.3 Ciphertext column keeps its current name: encrypted_content text NOT NULL (no change needed)

-- 2.4 Drop risk_level from chat_messages
ALTER TABLE public.chat_messages
  DROP COLUMN IF EXISTS risk_level;

-- 2.5 Table constraint on sender_role: requires ('user', 'assistant')
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_sender_role_check;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_role_check CHECK (sender_role IN ('user', 'assistant'));

-- 2.6 BEFORE INSERT trigger forces created_at = now() and retention_expires_at = now() + interval '30 days'
CREATE OR REPLACE FUNCTION public.trg_chat_messages_force_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.created_at := now();
  NEW.retention_expires_at := now() + interval '30 days';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_chat_messages_force_dates() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_chat_messages_force_dates ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_force_dates
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_chat_messages_force_dates();

-- 2.7 Update RLS policies on chat_messages
-- Select policy hides expired rows (retention_expires_at > now())
DROP POLICY IF EXISTS "Users exclusively view messages from own sessions" ON public.chat_messages;
CREATE POLICY "Users exclusively view messages from own sessions"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    retention_expires_at > now()
    AND EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- Insert policy requires sender_role IN ('user', 'assistant') and session ownership
DROP POLICY IF EXISTS "Users exclusively insert messages into own sessions" ON public.chat_messages;
CREATE POLICY "Users exclusively insert messages into own sessions"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_role IN ('user', 'assistant')
    AND EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- Delete policy: session owner only
DROP POLICY IF EXISTS "Users exclusively delete messages from own sessions" ON public.chat_messages;
CREATE POLICY "Users exclusively delete messages from own sessions"
  ON public.chat_messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- ==============================================================================
-- 3. Message & Empty Session Purge Function
-- ==============================================================================

-- In compliance with DPDP Act 2023, companion chat messages older than retention TTL
-- are purged, and empty old sessions (> 30 days old with no messages) are also removed.
CREATE OR REPLACE FUNCTION public.purge_expired_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_messages integer := 0;
  v_deleted_sessions integer := 0;
BEGIN
  -- 1. Delete expired messages
  DELETE FROM public.chat_messages
  WHERE retention_expires_at < now()
     OR created_at < (now() - interval '30 days');
  GET DIAGNOSTICS v_deleted_messages = ROW_COUNT;

  -- 2. Delete empty old sessions (> 30 days old without messages)
  DELETE FROM public.chat_sessions s
  WHERE s.created_at < (now() - interval '30 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_messages m WHERE m.session_id = s.id
    );
  GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;

  RETURN v_deleted_messages + v_deleted_sessions;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_chat_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_chat_messages() TO service_role;

-- ==============================================================================
-- 4. Synced Encrypted Blobs (CBT, Worry Time, Safety Card Anchors)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.encrypted_blobs (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN (
    'mindsahaay_sec_0f9a2b8e3d1c4a7e', -- cbt_activities
    'mindsahaay_sec_4c8b1a7d2e9f0a3b', -- cbt_worry
    'mindsahaay_sec_7e1d4a9b2c8f0e3a'  -- safety_card
  )),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  salt text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_encrypted_blobs_user_slot
  ON public.encrypted_blobs (user_id, slot);

ALTER TABLE public.encrypted_blobs ENABLE ROW LEVEL SECURITY;

-- Owner-only RLS policies (Counsellors, moderators, and admins have NO access)
DROP POLICY IF EXISTS "Users exclusively view own encrypted blobs" ON public.encrypted_blobs;
CREATE POLICY "Users exclusively view own encrypted blobs"
  ON public.encrypted_blobs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users exclusively insert own encrypted blobs" ON public.encrypted_blobs;
CREATE POLICY "Users exclusively insert own encrypted blobs"
  ON public.encrypted_blobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users exclusively update own encrypted blobs" ON public.encrypted_blobs;
CREATE POLICY "Users exclusively update own encrypted blobs"
  ON public.encrypted_blobs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users exclusively delete own encrypted blobs" ON public.encrypted_blobs;
CREATE POLICY "Users exclusively delete own encrypted blobs"
  ON public.encrypted_blobs FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.encrypted_blobs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encrypted_blobs TO authenticated;
GRANT ALL ON public.encrypted_blobs TO service_role;

-- ==============================================================================
-- 5. RPC put_blob Function
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.put_blob(
  p_slot text,
  p_ciphertext text,
  p_iv text,
  p_salt text,
  p_expected_version integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_version integer;
  v_new_version integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_slot NOT IN (
    'mindsahaay_sec_0f9a2b8e3d1c4a7e',
    'mindsahaay_sec_4c8b1a7d2e9f0a3b',
    'mindsahaay_sec_7e1d4a9b2c8f0e3a'
  ) THEN
    RAISE EXCEPTION 'Invalid slot identifier';
  END IF;

  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'VERSION_CONFLICT';
  END IF;

  SELECT version INTO v_current_version
  FROM public.encrypted_blobs
  WHERE user_id = v_user_id AND slot = p_slot
  FOR UPDATE;

  IF p_expected_version = 0 THEN
    IF v_current_version IS NOT NULL THEN
      RAISE EXCEPTION 'VERSION_CONFLICT';
    END IF;

    v_new_version := 1;
    BEGIN
      INSERT INTO public.encrypted_blobs (user_id, slot, ciphertext, iv, salt, version, updated_at)
      VALUES (v_user_id, p_slot, p_ciphertext, p_iv, p_salt, v_new_version, now());
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'VERSION_CONFLICT';
    END;
  ELSE
    IF v_current_version IS NULL OR v_current_version <> p_expected_version THEN
      RAISE EXCEPTION 'VERSION_CONFLICT';
    END IF;

    v_new_version := v_current_version + 1;
    UPDATE public.encrypted_blobs
    SET ciphertext = p_ciphertext,
        iv = p_iv,
        salt = p_salt,
        version = v_new_version,
        updated_at = now()
    WHERE user_id = v_user_id AND slot = p_slot;
  END IF;

  RETURN v_new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.put_blob(text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.put_blob(text, text, text, text, integer) TO authenticated, service_role;
