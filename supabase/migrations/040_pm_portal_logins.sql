-- Builder Portal-only logins for project managers.
--
-- A PM login (pm_portal_users row) is not staff: it can't see the CRM,
-- estimates, payments, clients, or any money. It can run the jobs it may
-- access: schedule (project_sheets), daily logs, punch list, inspections,
-- and booking subs onto those jobs. Projects and subcontractors are read
-- through functions that leave out money columns (contract value, costs,
-- billing, sub pay rates), and job status/dates change through
-- pm_update_project(), which only touches those fields.
--
-- Which jobs: the ones where projects.project_manager is the PM's employee
-- name, or every job when all_jobs is on. Access is turned off with
-- active = false; rows are never deleted.
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS pm_portal_users (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  email       TEXT,
  full_name   TEXT,
  all_jobs    BOOLEAN NOT NULL DEFAULT false,
  active      BOOLEAN NOT NULL DEFAULT true,
  invited_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pm_portal_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access" ON pm_portal_users;
CREATE POLICY "authenticated_full_access" ON pm_portal_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "portal_scope" ON pm_portal_users;
CREATE POLICY "portal_scope" ON pm_portal_users AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR user_id = auth.uid())
  WITH CHECK ((SELECT public.is_staff()));
DROP POLICY IF EXISTS "portal_no_delete" ON pm_portal_users;
CREATE POLICY "portal_no_delete" ON pm_portal_users AS RESTRICTIVE FOR DELETE TO public USING (false);
DROP TRIGGER IF EXISTS pm_portal_users_updated_at ON pm_portal_users;
CREATE TRIGGER pm_portal_users_updated_at BEFORE UPDATE ON pm_portal_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Who is calling ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_pm_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM pm_portal_users WHERE user_id = auth.uid());
$$;

-- A PM login is never staff, even if it somehow joined the staff org.
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
        AND organization_id = public.staff_org_id()
        AND COALESCE(status, 'active') = 'active'
    )
    AND NOT public.is_sub_user()
    AND NOT public.is_pm_user();
$$;

CREATE OR REPLACE FUNCTION public.pm_can_access_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pm_portal_users u
    LEFT JOIN employees e ON e.id = u.employee_id
    JOIN projects p ON p.id = pid
    WHERE u.user_id = auth.uid() AND u.active
      AND (u.all_jobs OR lower(trim(p.project_manager)) = lower(trim(COALESCE(e.full_name, u.full_name))))
  );
$$;

-- ── Tables a PM works in, limited to their jobs ─────────────────────────────
-- (Staff keep full access; subs keep exactly what 034 gave them.)
DROP POLICY IF EXISTS "staff_only" ON project_sheets;
DROP POLICY IF EXISTS "staff_or_pm" ON project_sheets;
CREATE POLICY "staff_or_pm" ON project_sheets AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR public.pm_can_access_project(project_id))
  WITH CHECK ((SELECT public.is_staff()) OR public.pm_can_access_project(project_id));

DROP POLICY IF EXISTS "staff_only" ON punch_list_items;
DROP POLICY IF EXISTS "staff_or_pm" ON punch_list_items;
CREATE POLICY "staff_or_pm" ON punch_list_items AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR public.pm_can_access_project(project_id))
  WITH CHECK ((SELECT public.is_staff()) OR public.pm_can_access_project(project_id));

DROP POLICY IF EXISTS "staff_only" ON permit_inspection_tasks;
DROP POLICY IF EXISTS "staff_or_pm" ON permit_inspection_tasks;
CREATE POLICY "staff_or_pm" ON permit_inspection_tasks AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR public.pm_can_access_project(project_id))
  WITH CHECK ((SELECT public.is_staff()) OR public.pm_can_access_project(project_id));

DROP POLICY IF EXISTS "portal_scope" ON barrier_daily_logs;
CREATE POLICY "portal_scope" ON barrier_daily_logs AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR public.sub_can_access_project(project_id) OR public.pm_can_access_project(project_id))
  WITH CHECK ((SELECT public.is_staff()) OR public.sub_can_access_project(project_id) OR public.pm_can_access_project(project_id));

-- PMs can see and add sub bookings on their jobs (not remove them).
DROP POLICY IF EXISTS "portal_scope" ON project_subcontractors;
CREATE POLICY "portal_scope" ON project_subcontractors AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR subcontractor_id = (SELECT public.portal_sub_id()) OR public.pm_can_access_project(project_id))
  WITH CHECK ((SELECT public.is_staff()) OR public.pm_can_access_project(project_id));

-- ── Read / write through functions (no money columns) ───────────────────────
CREATE OR REPLACE FUNCTION public.pm_portal_projects()
RETURNS TABLE (id uuid, name text, address text, status text, project_manager text, project_type text,
               company_id uuid, client_id uuid, client_name text, client_phone text, client_email text,
               start_date date, end_date date, baseline_end_date date, actual_completion_date date,
               percent_complete numeric, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.address, p.status::text, p.project_manager, p.project_type::text,
         p.company_id, p.client_id, c.name, c.phone, c.email,
         p.start_date, p.end_date, p.baseline_end_date, p.actual_completion_date,
         p.percent_complete::numeric, p.updated_at
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  WHERE public.pm_can_access_project(p.id)
  ORDER BY p.name;
$$;

-- Only status, dates and percent complete; never the PM, client, or money.
CREATE OR REPLACE FUNCTION public.pm_update_project(p_id uuid, p_patch jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_staff() OR public.pm_can_access_project(p_id)) THEN
    RAISE EXCEPTION 'Not allowed to update this job';
  END IF;
  UPDATE projects SET
    status                 = CASE WHEN p_patch ? 'status' THEN (p_patch->>'status')::project_status_enum ELSE status END,
    start_date             = CASE WHEN p_patch ? 'start_date' THEN (p_patch->>'start_date')::date ELSE start_date END,
    end_date               = CASE WHEN p_patch ? 'end_date' THEN (p_patch->>'end_date')::date ELSE end_date END,
    baseline_end_date      = CASE WHEN p_patch ? 'baseline_end_date' THEN (p_patch->>'baseline_end_date')::date ELSE baseline_end_date END,
    actual_completion_date = CASE WHEN p_patch ? 'actual_completion_date' THEN (p_patch->>'actual_completion_date')::date ELSE actual_completion_date END,
    percent_complete       = CASE WHEN p_patch ? 'percent_complete' THEN (p_patch->>'percent_complete')::numeric ELSE percent_complete END,
    updated_at             = now()
  WHERE id = p_id;
END $$;

-- Subcontractor directory without pay rates or notes.
CREATE OR REPLACE FUNCTION public.pm_subcontractors()
RETURNS TABLE (id uuid, name text, trade text, contact_person text, phone text, email text, status text,
               insurance_exp date, workers_comp_exp date, license_exp date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.trade, s.contact_person, s.phone, s.email, s.status::text,
         s.insurance_exp, s.workers_comp_exp, s.license_exp
  FROM subcontractors s
  WHERE public.is_staff()
     OR EXISTS (SELECT 1 FROM pm_portal_users WHERE user_id = auth.uid() AND active)
  ORDER BY s.name;
$$;

REVOKE ALL ON FUNCTION public.pm_portal_projects() FROM public, anon;
REVOKE ALL ON FUNCTION public.pm_update_project(uuid, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.pm_subcontractors() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pm_portal_projects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_update_project(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_subcontractors() TO authenticated;

NOTIFY pgrst, 'reload schema';
