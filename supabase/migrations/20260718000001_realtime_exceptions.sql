-- Broadcast exceptions changes to the dashboard (Supabase Realtime).
-- RLS still applies: authenticated users only receive events for rows
-- their org's shops own (exceptions_select policy).

alter publication supabase_realtime add table public.exceptions;
