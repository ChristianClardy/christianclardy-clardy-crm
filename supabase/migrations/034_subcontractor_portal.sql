-- Access lockdown + subcontractor logins for the installable Builder Portal app.
--
-- WHO CAN SEE WHAT (enforced here, in the database — not just in the app UI):
--   Staff  = an active member of Christian's organization (staff_org_id()).
--            Full CRM access, exactly like today.
--   Sub    = a login with a subcontractor_portal_users row. Only the Builder
--            Portal data for jobs they're assigned to (project_subcontractors).
--   Anyone else (self sign-ups via the Login page's "Sign up", logged-out
--   visitors using the public anon key) = nothing.
--
-- Before this, every table let ANY logged-in user do anything, and sign-ups
-- are open, so any stranger could create an account and read the whole CRM.
-- Logged-out visitors could also read rows with no organization_id on
-- clients/leads/estimates/etc. (the leak 020_fix_anon_rls_leak.sql targeted).
--
-- Implemented with RESTRICTIVE policies, which AND with the existing
-- permissive ones, so staff behavior is unchanged and no existing policy is
-- rewritten. New staff come in through Settings → Invite User, which adds them
-- to the organization (api/invite.js). The old invite-token flow on the
-- onboarding screen no longer works, since it relied on open sign-up.
--
-- NOTE: any table created after this migration needs its own "staff_only"
-- policy (copy the loop below), or it will be readable by subs and sign-ups.
-- Run this in your Supabase SQL editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS subcontractor_portal_users (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subcontractor_id UUID REFERENCES subcontractors(id) ON DELETE SET NULL,
  email            TEXT,
  full_name        TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  invited_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_portal_users_sub ON subcontractor_portal_users(subcontractor_id);

CREATE TABLE IF NOT EXISTS project_subcontractors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_id UUID NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, subcontractor_id)
);

CREATE INDEX IF NOT EXISTS idx_project_subs_sub ON project_subcontractors(subcontractor_id);

-- ─── Helper functions (SECURITY DEFINER so policies can call them without
-- tripping RLS on the tables they read) ──────────────────────────────────────

-- The one organization whose members are CRM staff ("Clardy Construction").
CREATE OR REPLACE FUNCTION public.staff_org_id() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_sub_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM subcontractor_portal_users WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
        AND organization_id = public.staff_org_id()
        AND COALESCE(status, 'active') = 'active'
    )
    AND NOT public.is_sub_user();
$$;

-- NULL when the caller isn't a sub, or their access has been turned off.
CREATE OR REPLACE FUNCTION public.portal_sub_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT subcontractor_id FROM subcontractor_portal_users WHERE user_id = auth.uid() AND active;
$$;

CREATE OR REPLACE FUNCTION public.sub_can_access_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_subcontractors ps
    WHERE ps.project_id = pid AND ps.subcontractor_id = public.portal_sub_id()
  );
$$;

-- Assigned projects for the calling sub, without any money columns.
CREATE OR REPLACE FUNCTION public.sub_portal_projects()
RETURNS TABLE (id uuid, name text, address text, status text, project_manager text, company_id uuid, start_date date, end_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.address, p.status::text, p.project_manager, p.company_id, p.start_date, p.end_date
  FROM projects p
  JOIN project_subcontractors ps ON ps.project_id = p.id
  WHERE ps.subcontractor_id = public.portal_sub_id()
  ORDER BY p.name;
$$;

-- Server-only (api/invite.js): find an existing login by email so re-inviting
-- someone who already has an account just grants access instead of failing.
CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(p_email text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;

-- ─── organizations / organization_members had RLS OFF (readable and writable
-- by anyone, even logged out). Turn it on so the lockdown below applies. ─────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations', 'organization_members', 'subcontractor_portal_users', 'project_subcontractors'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'authenticated_full_access') THEN
      EXECUTE format('CREATE POLICY "authenticated_full_access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- ─── Staff only: every table except the portal tables handled below ────────
-- TO public covers both logged-in users and logged-out (anon) requests.

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND c.relname NOT IN ('barrier_daily_logs', 'subcontractor_barrier_acknowledgments', 'subcontractors', 'subcontractor_portal_users', 'project_subcontractors')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "staff_only" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "staff_only" ON %I AS RESTRICTIVE FOR ALL TO public USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()))',
      t
    );
  END LOOP;
END $$;

-- ─── Portal tables: staff get everything, subs get their own slice ─────────

-- Daily logs: subs read/create/update on assigned projects only; never delete.
DROP POLICY IF EXISTS "portal_scope" ON barrier_daily_logs;
CREATE POLICY "portal_scope" ON barrier_daily_logs AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR public.sub_can_access_project(project_id))
  WITH CHECK ((SELECT public.is_staff()) OR public.sub_can_access_project(project_id));
DROP POLICY IF EXISTS "portal_staff_delete" ON barrier_daily_logs;
CREATE POLICY "portal_staff_delete" ON barrier_daily_logs AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.is_staff()));

-- Policy acknowledgments: subs read + sign their own; no edits/deletes once signed.
DROP POLICY IF EXISTS "portal_scope" ON subcontractor_barrier_acknowledgments;
CREATE POLICY "portal_scope" ON subcontractor_barrier_acknowledgments AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR subcontractor_id = (SELECT public.portal_sub_id()))
  WITH CHECK ((SELECT public.is_staff()) OR subcontractor_id = (SELECT public.portal_sub_id()));
DROP POLICY IF EXISTS "portal_staff_update" ON subcontractor_barrier_acknowledgments;
CREATE POLICY "portal_staff_update" ON subcontractor_barrier_acknowledgments AS RESTRICTIVE FOR UPDATE TO public
  USING ((SELECT public.is_staff()));
DROP POLICY IF EXISTS "portal_staff_delete" ON subcontractor_barrier_acknowledgments;
CREATE POLICY "portal_staff_delete" ON subcontractor_barrier_acknowledgments AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.is_staff()));

-- Subcontractors: a sub reads only its own company record; staff-only writes.
DROP POLICY IF EXISTS "portal_scope" ON subcontractors;
CREATE POLICY "portal_scope" ON subcontractors AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR id = (SELECT public.portal_sub_id()))
  WITH CHECK ((SELECT public.is_staff()));
DROP POLICY IF EXISTS "portal_staff_delete" ON subcontractors;
CREATE POLICY "portal_staff_delete" ON subcontractors AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.is_staff()));

-- Portal users: a sub reads only its own row. Nobody deletes rows through the
-- API (that would turn a locked-down login back into a plain sign-up and lose
-- the audit trail) — turn access off with active=false instead.
DROP POLICY IF EXISTS "portal_scope" ON subcontractor_portal_users;
CREATE POLICY "portal_scope" ON subcontractor_portal_users AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR user_id = auth.uid())
  WITH CHECK ((SELECT public.is_staff()));
DROP POLICY IF EXISTS "portal_no_delete" ON subcontractor_portal_users;
CREATE POLICY "portal_no_delete" ON subcontractor_portal_users AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- Job assignments: a sub reads its own; staff-only writes.
DROP POLICY IF EXISTS "portal_scope" ON project_subcontractors;
CREATE POLICY "portal_scope" ON project_subcontractors AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR subcontractor_id = (SELECT public.portal_sub_id()))
  WITH CHECK ((SELECT public.is_staff()));
DROP POLICY IF EXISTS "portal_staff_delete" ON project_subcontractors;
CREATE POLICY "portal_staff_delete" ON project_subcontractors AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.is_staff()));

DROP TRIGGER IF EXISTS subcontractor_portal_users_updated_at ON subcontractor_portal_users;
CREATE TRIGGER subcontractor_portal_users_updated_at BEFORE UPDATE ON subcontractor_portal_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS project_subcontractors_updated_at ON project_subcontractors;
CREATE TRIGGER project_subcontractors_updated_at BEFORE UPDATE ON project_subcontractors FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
