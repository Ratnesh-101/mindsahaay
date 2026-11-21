-- ==============================================================================
-- Migration: 0008_realtime_publication.sql
-- Purpose: make Supabase Realtime actually deliver changes for the crisis queue.
--
-- Found by a real-browser test: the counsellor risk queue subscribes to postgres_changes on
-- public.risk_events, but the supabase_realtime publication contained NO tables, so no event was
-- ever streamed and the queue only updated when someone reloaded or on the 5 minute refresh.
-- For a crisis queue that is a safety gap, and it was invisible because every unit test mocked the
-- realtime channel.
--
-- Realtime still enforces row level security: a subscriber only receives rows its SELECT
-- policies allow (a counsellor sees events of students who shared risk_events with them, a student
-- sees only their own notifications). Adding a table to the publication does not widen access.
-- ==============================================================================

DO $$
DECLARE
  t text;
BEGIN
  -- Plain Postgres (no Supabase) has no such publication: then there is nothing to do.
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'publication supabase_realtime not found: skipping';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['risk_events', 'risk_followups', 'notifications']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
