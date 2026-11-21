-- Regression test: the crisis queue depends on Realtime, so the tables it listens to must be in
-- the supabase_realtime publication (they were not: the publication was empty and the queue
-- never received a live update).
BEGIN;
SELECT plan(4);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'),
  'the supabase_realtime publication exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'risk_events'),
  'risk_events is published (counsellor queue live updates)'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'risk_followups'),
  'risk_followups is published (step changes reach the queue)'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'),
  'notifications is published (in-app alerts)'
);

SELECT * FROM finish();
ROLLBACK;
