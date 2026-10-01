-- A subcontractor sees and works on nothing until their company has signed
-- the Subcontractor Agreement.
--
-- "Signed" = any subcontractor_barrier_acknowledgments row for the sub's
-- company: signed in the app, or recorded by staff (typed signature or an
-- attached signed copy). Until then:
--   - sub_portal_projects() returns no jobs
--   - sub_can_access_project() is false, which closes their daily logs
--     (barrier_daily_logs portal_scope policy) and schedule
--     (sub_portal_schedule())
-- They can still read their own company record and sign the agreement.
-- Staff and PM access is unchanged.
-- Run this in your Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.sub_has_signed_agreement() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM subcontractor_barrier_acknowledgments a
    WHERE a.subcontractor_id = public.portal_sub_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.sub_can_access_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.sub_has_signed_agreement() AND EXISTS (
    SELECT 1 FROM project_subcontractors ps
    WHERE ps.project_id = pid AND ps.subcontractor_id = public.portal_sub_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.sub_portal_projects()
RETURNS TABLE (id uuid, name text, address text, status text, project_manager text, company_id uuid, start_date date, end_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.address, p.status::text, p.project_manager, p.company_id, p.start_date, p.end_date
  FROM projects p
  JOIN project_subcontractors ps ON ps.project_id = p.id
  WHERE ps.subcontractor_id = public.portal_sub_id()
    AND public.sub_has_signed_agreement()
  ORDER BY p.name;
$$;

REVOKE ALL ON FUNCTION public.sub_has_signed_agreement() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sub_has_signed_agreement() TO authenticated;

NOTIFY pgrst, 'reload schema';
