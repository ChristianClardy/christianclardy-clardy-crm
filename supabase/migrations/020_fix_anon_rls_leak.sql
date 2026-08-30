-- Fixes an anon-key data leak found 2026-08-30: the public/anon Supabase key
-- shipped to the browser could read leads, calendar_events, estimates,
-- notifications, and clients (and WRITE clients) with no login at all,
-- despite 001_initial_schema.sql's policy nominally restricting access to
-- the `authenticated` role. RLS was likely toggled off (or a stray
-- permissive policy added) directly in the Supabase dashboard, outside any
-- tracked migration.
--
-- Re-enabling RLS is idempotent/safe even if it was never actually
-- disabled. Every existing policy on these 5 tables is dropped and replaced
-- with the single intended "authenticated_full_access" policy, regardless
-- of what it's currently named, so this is safe to run even if the actual
-- cause turns out to be a stray extra policy rather than RLS being off.
--
-- Confirmed NOT needed by any pre-login flow: the public lead-capture form
-- (src/components/public/PublicLeadCaptureForm.jsx) posts to
-- /api/public-lead, a backend function using the service-role key, not the
-- browser's anon key — so locking `leads` back down does not break it.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['leads', 'calendar_events', 'estimates', 'notifications', 'clients'];
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON %I
       FOR ALL TO authenticated
       USING (true)
       WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
