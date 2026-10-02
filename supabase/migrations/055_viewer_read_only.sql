-- Viewer (read-only) role, for owners and executives who should see the
-- business but never change it. Set someone's employee role to Viewer in
-- Settings → Employees (or invite them as Viewer).
--
--   is_viewer()          — signed-in, not an admin, employee role 'viewer'
--                          (active or not)
--   block_viewer_writes  — refuses every INSERT / UPDATE / DELETE a viewer
--                          sends, on every table in public (one trigger per
--                          table, once per statement), including through
--                          SECURITY DEFINER functions. Marking their own
--                          notifications read is the one write allowed.
--   storage              — viewers can't upload, replace or delete files.
--
-- Server code using the service role key isn't affected (no signed-in user),
-- and the API refuses a viewer's sends and uploads itself (api/_lib/staffAuth.js).
-- A table created later needs the trigger too: re-running this file adds it.
--
-- Also adds the roles from Settings → Roles & Permissions that the employee
-- role list was missing (bookkeeper, sales, designer), so those save.
-- Run this in your Supabase SQL editor.

ALTER TYPE employee_role_enum ADD VALUE IF NOT EXISTS 'bookkeeper';
ALTER TYPE employee_role_enum ADD VALUE IF NOT EXISTS 'sales';
ALTER TYPE employee_role_enum ADD VALUE IF NOT EXISTS 'designer';
ALTER TYPE employee_role_enum ADD VALUE IF NOT EXISTS 'viewer';

CREATE OR REPLACE FUNCTION public.is_viewer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM employees e JOIN auth.users u ON lower(u.email) = lower(e.email)
      WHERE u.id = auth.uid()
        AND e.role::text = 'viewer'   -- inactive too: never falls back to write access
    )
    AND NOT public.is_admin();
$$;
REVOKE ALL ON FUNCTION public.is_viewer() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO authenticated;

CREATE OR REPLACE FUNCTION public.block_viewer_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'notifications' AND TG_OP = 'UPDATE' THEN RETURN NULL; END IF;
  IF public.is_viewer() THEN
    RAISE EXCEPTION 'View-only access: your login can see everything but can''t make changes.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS viewer_read_only ON public.%I', t);
    EXECUTE format('CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes()', t);
  END LOOP;
END $$;

-- File uploads go straight from the browser to storage.
DROP POLICY IF EXISTS "viewer_no_upload" ON storage.objects;
CREATE POLICY "viewer_no_upload" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_viewer());
DROP POLICY IF EXISTS "viewer_no_update" ON storage.objects;
CREATE POLICY "viewer_no_update" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_viewer());
DROP POLICY IF EXISTS "viewer_no_delete" ON storage.objects;
CREATE POLICY "viewer_no_delete" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_viewer());

NOTIFY pgrst, 'reload schema';
