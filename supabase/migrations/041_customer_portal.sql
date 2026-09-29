-- Customer Portal logins.
--
-- A customer login (customer_portal_users row) belongs to one client and sees
-- only that client's own projects: payments made, the payment schedule, a
-- simplified progress checklist, and the contracts they signed. It is not
-- staff, so every staff_only / portal_scope table stays closed to it; it reads
-- everything through the customer_portal_* functions below, which return
-- only the columns a homeowner should see (no costs, margins, internal notes,
-- sub info or crew assignments).
--
-- Access is turned off with active = false; rows are never deleted.
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS customer_portal_users (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  invited_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_portal_users_client_id ON customer_portal_users(client_id);

ALTER TABLE customer_portal_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access" ON customer_portal_users;
CREATE POLICY "authenticated_full_access" ON customer_portal_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "portal_scope" ON customer_portal_users;
CREATE POLICY "portal_scope" ON customer_portal_users AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()) OR user_id = auth.uid())
  WITH CHECK ((SELECT public.is_staff()));
DROP POLICY IF EXISTS "portal_no_delete" ON customer_portal_users;
CREATE POLICY "portal_no_delete" ON customer_portal_users AS RESTRICTIVE FOR DELETE TO public USING (false);
DROP TRIGGER IF EXISTS customer_portal_users_updated_at ON customer_portal_users;
CREATE TRIGGER customer_portal_users_updated_at BEFORE UPDATE ON customer_portal_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Who is calling ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_customer_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM customer_portal_users WHERE user_id = auth.uid());
$$;

-- A customer login is never staff, even if it somehow joined the staff org.
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
        AND organization_id = public.staff_org_id()
        AND COALESCE(status, 'active') = 'active'
    )
    AND NOT public.is_sub_user()
    AND NOT public.is_pm_user()
    AND NOT public.is_customer_user();
$$;

-- NULL when the caller isn't a customer, or their access has been turned off.
CREATE OR REPLACE FUNCTION public.portal_client_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM customer_portal_users WHERE user_id = auth.uid() AND active;
$$;

-- ── Read-only views for the customer ────────────────────────────────────────
-- Their projects, with the contract total and what's been paid.
CREATE OR REPLACE FUNCTION public.customer_portal_projects()
RETURNS TABLE (id uuid, name text, address text, status text, project_type text, project_manager text,
               start_date date, end_date date, actual_completion_date date, percent_complete numeric,
               contract_value numeric, change_orders_total numeric, paid_to_date numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.address, p.status::text, p.project_type::text, p.project_manager,
         p.start_date, p.end_date, p.actual_completion_date, COALESCE(p.percent_complete, 0)::numeric,
         COALESCE(p.contract_value, 0)::numeric,
         COALESCE((SELECT sum(co.amount) FROM change_orders co WHERE co.project_id = p.id AND lower(co.status) = 'approved'), 0)::numeric,
         COALESCE((SELECT sum(pay.amount_received) FROM payments pay WHERE pay.linked_job_id = p.id), 0)::numeric
  FROM projects p
  WHERE p.client_id = public.portal_client_id()
    AND p.status::text <> 'cancelled'
  ORDER BY p.start_date DESC NULLS LAST, p.name;
$$;

-- Payments received on their projects (no internal notes).
CREATE OR REPLACE FUNCTION public.customer_portal_payments()
RETURNS TABLE (id uuid, project_id uuid, payment_date date, amount numeric, payment_method text, reference_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pay.id, pay.linked_job_id, pay.payment_date, pay.amount_received, pay.payment_method, pay.reference_number
  FROM payments pay
  JOIN projects p ON p.id = pay.linked_job_id
  WHERE p.client_id = public.portal_client_id()
  ORDER BY pay.payment_date DESC NULLS LAST, pay.created_at DESC;
$$;

-- The payment schedule (draws) on their projects.
CREATE OR REPLACE FUNCTION public.customer_portal_draws()
RETURNS TABLE (id uuid, project_id uuid, draw_number integer, title text, amount numeric, status text, due_date date, paid_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.project_id, d.draw_number, d.title, d.amount, d.status::text, d.due_date, d.paid_date
  FROM draws d
  JOIN projects p ON p.id = d.project_id
  WHERE p.client_id = public.portal_client_id()
  ORDER BY d.project_id, d.draw_number NULLS LAST, d.due_date NULLS LAST;
$$;

-- The schedule rows for their projects, stripped to what a homeowner sees:
-- task/section names, status and dates. No notes, crews or subcontractors.
CREATE OR REPLACE FUNCTION public.customer_portal_schedule()
RETURNS TABLE (project_id uuid, rows jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.project_id,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'task', r->>'task',
                    'section', r->>'section',
                    'is_section_header', lower(COALESCE(r->>'is_section_header', '')) IN ('true', 't', '1'),
                    'status', r->>'status',
                    'start_date', r->>'start_date',
                    'end_date', r->>'end_date',
                    'is_milestone', lower(COALESCE(r->>'is_milestone', '')) IN ('true', 't', '1')
                  ) ORDER BY ord)
           FROM jsonb_array_elements(COALESCE(s.rows, '[]'::jsonb)) WITH ORDINALITY AS t(r, ord)
         ), '[]'::jsonb)
  FROM project_sheets s
  JOIN projects p ON p.id = s.project_id
  WHERE p.client_id = public.portal_client_id();
$$;

-- Signed contracts: contract files on their projects or held on the client
-- (where signed DocuSign packages are filed, see 035/036).
CREATE OR REPLACE FUNCTION public.customer_portal_documents()
RETURNS TABLE (id uuid, project_id uuid, filename text, url text, file_type text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         CASE WHEN lower(a.entity_type) = 'project' THEN a.entity_id END,
         a.filename, a.url, a.file_type, a.created_at
  FROM attachments a
  WHERE a.category = 'contract'
    AND public.portal_client_id() IS NOT NULL
    AND (
      (lower(a.entity_type) = 'project' AND a.entity_id IN (SELECT id FROM projects WHERE client_id = public.portal_client_id()))
      OR (lower(a.entity_type) = 'client' AND a.entity_id = public.portal_client_id())
    )
  ORDER BY a.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.customer_portal_projects()  FROM public, anon;
REVOKE ALL ON FUNCTION public.customer_portal_payments()  FROM public, anon;
REVOKE ALL ON FUNCTION public.customer_portal_draws()     FROM public, anon;
REVOKE ALL ON FUNCTION public.customer_portal_schedule()  FROM public, anon;
REVOKE ALL ON FUNCTION public.customer_portal_documents() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.customer_portal_projects()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_payments()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_draws()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_schedule()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_documents() TO authenticated;

NOTIFY pgrst, 'reload schema';
