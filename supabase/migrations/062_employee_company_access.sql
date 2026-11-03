-- Staff see only the brands (company_profiles) they are assigned to.
--
-- Owner-wide access is a single flag: organization_members.is_owner.
-- Policies call is_owner() / can_access_company(). They never mention a
-- user id or email. The seed below sets the flag once for the current
-- owner login. To give someone else (or, later, each tenant's owner) the
-- same reach, set is_owner on their organization_members row and nothing
-- else. When brands are tied to an organization (company_profiles.organization_id
-- is unused today), teach can_access_company() to require that match —
-- this file is the only place that decision lives.
--
-- Company assignment is a staff rule. Subcontractor, Builder (PM), and
-- Customer portal logins are not staff (is_staff() is false). The new
-- policies are RESTRICTIVE and pass for non-staff, so the portal policies
-- already on those tables stay in charge. The service role has no user id,
-- skips the write guard, and bypasses RLS, so jobs and edge functions keep
-- working.
--
-- Rows with no brand (company_id / brand_company_id IS NULL) stay visible
-- to every staff login. Hundreds of clients, tasks, and estimates were
-- never tagged, and guessing a brand would file them under the wrong
-- company. New rows still get a brand from inherit_company_id(). A
-- non-owner cannot clear a brand or move a row to a company they are not
-- assigned to.
--
-- Seed: every employee is assigned to every active company, including
-- inactive employees (so turning them back on doesn't start them at zero).
-- The archived lead-import company is not included. Access only tightens
-- when the owner edits assignments in Settings → Team.
--
-- Not brand-scoped on purpose (shared across companies): materials, cost
-- codes, assemblies, subcontractors, employees, estimate templates,
-- project-sheet templates, CRM customer companies (crm_companies), team
-- chat, message opt-outs, QuickBooks and DocuSign credentials, calendar
-- feed tokens. Unlinked to-dos (no project and no client) stay shared.
-- Storage files stay as they are (staff can list; direct links are public).

-- ── Owner flag ──────────────────────────────────────────────────────────────

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_members.is_owner IS
  'Sees and manages every brand (company_profiles row) for this membership. The only switch for owner-wide company access. Policies call is_owner(); do not hardcode a user id or email.';

CREATE OR REPLACE FUNCTION public.is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND COALESCE(status, 'active') = 'active'
      AND is_owner
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

-- Only an owner (or a session with no user, i.e. migrations and the service
-- role) can grant or remove owner access.
CREATE OR REPLACE FUNCTION public.guard_owner_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_owner() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.is_owner THEN
    RAISE EXCEPTION 'Only the owner can grant owner access' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_owner IS DISTINCT FROM OLD.is_owner THEN
    RAISE EXCEPTION 'Only the owner can change owner access' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_owner_flag ON organization_members;
CREATE TRIGGER guard_owner_flag
  BEFORE INSERT OR UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_flag();

-- Current owner: the staff-org login for Christian Clardy. This email is
-- used only here, never by the app. If it doesn't match (the address
-- changed before this ran), fall back to the single active admin of the
-- staff org so someone can still manage assignments.
UPDATE organization_members om
SET is_owner = true
FROM auth.users u
WHERE om.user_id = u.id
  AND om.organization_id = public.staff_org_id()
  AND lower(u.email) = 'christianclardy7@gmail.com';

UPDATE organization_members
SET is_owner = true
WHERE organization_id = public.staff_org_id()
  AND role = 'admin'
  AND COALESCE(status, 'active') = 'active'
  AND NOT EXISTS (SELECT 1 FROM organization_members WHERE is_owner)
  AND (
    SELECT count(*) FROM organization_members
    WHERE organization_id = public.staff_org_id()
      AND role = 'admin'
      AND COALESCE(status, 'active') = 'active'
  ) = 1;

-- ── Who works which brand ───────────────────────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_email_lower ON employees (lower(email));

COMMENT ON COLUMN employees.user_id IS
  'Login this team member signs in with. Matched by email when they were invited; the owner row is linked by name because that login uses a different email than the employee record.';

-- Link logins to the employee with the same email.
UPDATE employees e
SET user_id = u.id
FROM auth.users u
WHERE e.user_id IS NULL
  AND e.email IS NOT NULL
  AND lower(e.email) = lower(u.email);

-- The owner's employee row uses a different email than his login.
UPDATE employees e
SET user_id = om.user_id
FROM organization_members om
WHERE e.user_id IS NULL
  AND om.is_owner
  AND lower(e.full_name) = 'christian clardy'
  AND lower(e.role::text) = 'admin';

CREATE TABLE IF NOT EXISTS employee_company_assignments (
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_company_assignments_company
  ON employee_company_assignments(company_id);

COMMENT ON TABLE employee_company_assignments IS
  'Brands a team member may see and work in. The owner (organization_members.is_owner) is not limited by this table. Portal logins are not staff and do not use it.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON employee_company_assignments TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON employee_company_assignments TO service_role;
  END IF;
END $$;

ALTER TABLE employee_company_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON employee_company_assignments;
CREATE POLICY "authenticated_full_access" ON employee_company_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "staff_only" ON employee_company_assignments;
CREATE POLICY "staff_only" ON employee_company_assignments
  AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff()))
  WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "owner_writes" ON employee_company_assignments;
CREATE POLICY "owner_writes" ON employee_company_assignments
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((SELECT public.is_owner()));

DROP POLICY IF EXISTS "owner_updates" ON employee_company_assignments;
CREATE POLICY "owner_updates" ON employee_company_assignments
  AS RESTRICTIVE FOR UPDATE TO public
  USING ((SELECT public.is_owner()))
  WITH CHECK ((SELECT public.is_owner()));

DROP POLICY IF EXISTS "owner_deletes" ON employee_company_assignments;
CREATE POLICY "owner_deletes" ON employee_company_assignments
  AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.is_owner()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'block_viewer_writes') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS viewer_read_only ON employee_company_assignments';
    EXECUTE 'CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON employee_company_assignments
             FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes()';
  END IF;
END $$;

-- Every current employee starts on every active brand. The owner edits this
-- in Settings → Team. Inactive companies (the archived lead import) are left
-- out; the owner can assign them later.
INSERT INTO employee_company_assignments (employee_id, company_id)
SELECT e.id, c.id
FROM employees e
CROSS JOIN company_profiles c
WHERE COALESCE(c.is_active, true) = true
ON CONFLICT DO NOTHING;

-- A new team member starts on every active brand too, so adding someone
-- doesn't lock them out. The owner can uncheck brands in the same dialog.
CREATE OR REPLACE FUNCTION public.assign_default_companies() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO employee_company_assignments (employee_id, company_id)
  SELECT NEW.id, c.id
  FROM company_profiles c
  WHERE COALESCE(c.is_active, true) = true
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assign_default_companies ON employees;
CREATE TRIGGER assign_default_companies
  AFTER INSERT ON employees
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_companies();

-- ── Access checks (the only place the rule is decided) ─────────────────────

CREATE OR REPLACE FUNCTION public.can_access_company(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner()
    OR (
      p_company IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM employee_company_assignments a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.company_id = p_company
          AND COALESCE(e.status::text, 'active') = 'active'
          AND (
            e.user_id = auth.uid()
            OR (
              e.user_id IS NULL
              AND e.email IS NOT NULL
              AND lower(e.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
            )
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner()
    OR p_id IS NULL
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_id
        AND (p.company_id IS NULL OR public.can_access_company(p.company_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_lead(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner()
    OR p_id IS NULL
    OR EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = p_id
        AND (l.company_id IS NULL OR public.can_access_company(l.company_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_estimate(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner()
    OR p_id IS NULL
    OR EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = p_id
        AND (e.company_id IS NULL OR public.can_access_company(e.company_id))
    );
$$;

-- A client filed under one brand is also visible when the caller can see a
-- job that client hired another brand for (the job's company wins).
CREATE OR REPLACE FUNCTION public.can_access_client(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner()
    OR p_id IS NULL
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = p_id
        AND (
          c.company_id IS NULL
          OR public.can_access_company(c.company_id)
          OR EXISTS (
            SELECT 1 FROM projects p
            WHERE p.client_id = c.id
              AND public.can_access_company(p.company_id)
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_invoice(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner()
    OR p_id IS NULL
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = p_id
        AND (i.company_id IS NULL OR public.can_access_company(i.company_id))
    );
$$;

-- What the signed-in person may use. is_owner is the whole-business switch.
-- company_ids are the brands their employee row is assigned to (empty for a
-- login that isn't tied to an employee). The sidebar reads this; RLS does
-- not trust it.
CREATE OR REPLACE FUNCTION public.my_company_access() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'is_owner', public.is_owner(),
    'company_ids', COALESCE((
      SELECT jsonb_agg(DISTINCT a.company_id)
      FROM employee_company_assignments a
      JOIN employees e ON e.id = a.employee_id
      WHERE COALESCE(e.status::text, 'active') = 'active'
        AND (
          e.user_id = auth.uid()
          OR (
            e.user_id IS NULL
            AND e.email IS NOT NULL
            AND lower(e.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
          )
        )
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_lead(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_estimate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_company_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_estimate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_company_access() TO authenticated;

-- Non-owners can't blank a brand or point a row at a company they aren't
-- assigned to. p_shared_null = true: a null brand means "every company"
-- (message drips, scope templates). Only the owner may write those rows.
-- auth.uid() IS NULL (migrations, service role) and non-staff (portals) skip.
CREATE OR REPLACE FUNCTION public.guard_brand_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  shared_when_null boolean := COALESCE(TG_ARGV[0], 'false') = 'true';
  brand uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() OR public.is_owner() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    brand := OLD.company_id;
    IF brand IS NULL AND shared_when_null THEN
      RAISE EXCEPTION 'Only the owner can change records shared across companies' USING ERRCODE = '42501';
    END IF;
    IF brand IS NOT NULL AND NOT public.can_access_company(brand) THEN
      RAISE EXCEPTION 'You are not assigned to that company' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN
    IF shared_when_null AND OLD.company_id IS NULL THEN
      RAISE EXCEPTION 'Only the owner can change records shared across companies' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Choose a company you are assigned to' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_company(NEW.company_id) THEN
    RAISE EXCEPTION 'You are not assigned to that company' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.company_id IS NOT NULL AND NOT public.can_access_company(OLD.company_id) THEN
    RAISE EXCEPTION 'You are not assigned to that company' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.guard_brand_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_brand_write() TO authenticated;

-- ── Deals get a brand ───────────────────────────────────────────────────────
-- deals.company_id stays the CRM customer (crm_companies). The Pipeline
-- board is scoped with brand_company_id → company_profiles.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'deals' AND c.relkind = 'r') THEN
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS brand_company_id uuid REFERENCES company_profiles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_deals_brand_company_id ON deals(brand_company_id);
    COMMENT ON COLUMN deals.brand_company_id IS
      'Brand (company_profiles) this deal belongs to. company_id remains the CRM customer company.';
    UPDATE deals d
    SET brand_company_id = l.company_id
    FROM leads l
    WHERE d.lead_id = l.id
      AND d.brand_company_id IS NULL
      AND l.company_id IS NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_access_deal(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner()
    OR p_id IS NULL
    OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = p_id
        AND (d.brand_company_id IS NULL OR public.can_access_company(d.brand_company_id))
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_deal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_deal(uuid) TO authenticated;

-- Comments, files, DocuSign envelopes, and notifications point at a parent
-- with entity_type + entity_id. Unknown types stay visible so a new kind of
-- record isn't hidden until this function learns it.
CREATE OR REPLACE FUNCTION public.can_access_linked_entity(p_type text, p_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  kind text := lower(COALESCE(p_type, ''));
  brand uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() OR public.is_owner() THEN
    RETURN true;
  END IF;
  IF p_id IS NULL OR kind = '' THEN
    RETURN true;
  END IF;

  IF kind IN ('project', 'job') THEN
    RETURN public.can_access_project(p_id);
  ELSIF kind = 'lead' THEN
    RETURN public.can_access_lead(p_id);
  ELSIF kind IN ('client', 'contact') THEN
    RETURN public.can_access_client(p_id);
  ELSIF kind = 'estimate' THEN
    RETURN public.can_access_estimate(p_id);
  ELSIF kind = 'invoice' THEN
    RETURN public.can_access_invoice(p_id);
  ELSIF kind = 'deal' THEN
    RETURN public.can_access_deal(p_id);
  ELSIF kind = 'task' THEN
    SELECT company_id INTO brand FROM tasks WHERE id = p_id;
    IF NOT FOUND THEN RETURN false; END IF;
    RETURN brand IS NULL OR public.can_access_company(brand);
  ELSIF kind = 'document' THEN
    SELECT company_id INTO brand FROM documents WHERE id = p_id;
    IF NOT FOUND THEN RETURN false; END IF;
    RETURN brand IS NULL OR public.can_access_company(brand);
  ELSIF kind IN ('change_order', 'changeorder') THEN
    SELECT company_id INTO brand FROM change_orders WHERE id = p_id;
    IF NOT FOUND THEN RETURN false; END IF;
    RETURN brand IS NULL OR public.can_access_company(brand);
  ELSIF kind IN ('subcontractor', 'employee', 'material') THEN
    RETURN true;
  ELSE
    RETURN true;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.can_access_linked_entity(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_linked_entity(text, uuid) TO authenticated;

-- ── Policies ────────────────────────────────────────────────────────────────
-- RESTRICTIVE, so they AND with staff_only / portal_scope. Non-staff pass
-- through and the portal rules still apply. A null brand stays visible.

CREATE OR REPLACE FUNCTION public.attach_company_scope(p_table text, p_using text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p_table AND c.relkind = 'r'
  ) THEN
    RETURN;
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS company_scope ON public.%I', p_table);
  EXECUTE format(
    'CREATE POLICY company_scope ON public.%I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)',
    p_table, p_using, p_using
  );
END $$;

CREATE OR REPLACE FUNCTION public.attach_brand_guard(p_table text, p_shared_null boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'company_id'
  ) THEN
    RETURN;
  END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS zz_guard_brand ON public.%I', p_table);
  EXECUTE format(
    'CREATE TRIGGER zz_guard_brand BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_brand_write(%L)',
    p_table, CASE WHEN p_shared_null THEN 'true' ELSE 'false' END
  );
END $$;

-- Direct brand column. Null stays visible (see the header).
SELECT public.attach_company_scope(t, $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR company_id IS NULL
  OR (SELECT public.can_access_company(company_id))
$policy$)
FROM (VALUES
  ('leads'), ('projects'), ('estimates'), ('invoices'), ('payments'),
  ('calendar_events'), ('tasks'), ('change_orders'), ('draws'), ('sub_invoices'),
  ('designs'), ('documents'), ('municipalities'), ('barrier_daily_logs'),
  ('punch_list_items'), ('subcontractor_barrier_acknowledgments'),
  ('contract_templates'), ('payment_schedule_templates'), ('allowances_templates'),
  ('payment_schedule_rules'), ('scope_templates'),
  ('message_settings'), ('message_templates'), ('message_sequences'),
  ('message_enrollments'), ('messages')
) AS names(t);

-- Clients: also visible when the caller can see one of that client's jobs.
SELECT public.attach_company_scope('clients', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR company_id IS NULL
  OR (SELECT public.can_access_company(company_id))
  OR EXISTS (
    SELECT 1 FROM projects p
    WHERE p.client_id = clients.id
      AND (SELECT public.can_access_company(p.company_id))
  )
$policy$);

-- The brand list itself. The sidebar only offers rows this policy returns.
-- Deleting a brand is owner-only (a bookkeeper can still edit their own).
SELECT public.attach_company_scope('company_profiles', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (SELECT public.can_access_company(id))
$policy$);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'company_profiles') THEN
    EXECUTE 'DROP POLICY IF EXISTS company_profile_owner_delete ON company_profiles';
    EXECUTE $policy$
      CREATE POLICY company_profile_owner_delete ON company_profiles
      AS RESTRICTIVE FOR DELETE TO public
      USING (NOT (SELECT public.is_staff()) OR (SELECT public.is_owner()))
    $policy$;
  END IF;
END $$;

-- Pipeline deals. Null brand stays visible, same as other untagged rows.
SELECT public.attach_company_scope('deals', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR brand_company_id IS NULL
  OR (SELECT public.can_access_company(brand_company_id))
$policy$);

-- Children reached through a job, lead, estimate, or polymorphic parent.
SELECT public.attach_company_scope(t, $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR project_id IS NULL
  OR (SELECT public.can_access_project(project_id))
$policy$)
FROM (VALUES
  ('job_cost_breakdowns'), ('permit_inspection_tasks'), ('permit_updates'),
  ('pool_selections'), ('project_photos'), ('project_sheets'),
  ('project_subcontractors'), ('reminders'), ('selection_allowances')
) AS names(t);

SELECT public.attach_company_scope('lead_follow_ups', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR lead_id IS NULL
  OR (SELECT public.can_access_lead(lead_id))
$policy$);

SELECT public.attach_company_scope('contact_history', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (linked_lead_id IS NULL AND linked_client_id IS NULL)
  OR (linked_lead_id IS NOT NULL AND (SELECT public.can_access_lead(linked_lead_id)))
  OR (linked_client_id IS NOT NULL AND (SELECT public.can_access_client(linked_client_id)))
$policy$);

SELECT public.attach_company_scope('site_visits', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (project_id IS NULL AND lead_id IS NULL)
  OR (project_id IS NOT NULL AND (SELECT public.can_access_project(project_id)))
  OR (lead_id IS NOT NULL AND (SELECT public.can_access_lead(lead_id)))
$policy$);

SELECT public.attach_company_scope('estimate_versions', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (linked_estimate_id IS NULL AND project_id IS NULL)
  OR (linked_estimate_id IS NOT NULL AND (SELECT public.can_access_estimate(linked_estimate_id)))
  OR (project_id IS NOT NULL AND (SELECT public.can_access_project(project_id)))
$policy$);

SELECT public.attach_company_scope('line_items', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR estimate_version_id IS NULL
  OR EXISTS (
    SELECT 1 FROM estimate_versions v
    WHERE v.id = line_items.estimate_version_id
      AND (
        (v.linked_estimate_id IS NULL AND v.project_id IS NULL)
        OR (v.linked_estimate_id IS NOT NULL AND (SELECT public.can_access_estimate(v.linked_estimate_id)))
        OR (v.project_id IS NOT NULL AND (SELECT public.can_access_project(v.project_id)))
      )
  )
$policy$);

SELECT public.attach_company_scope(t, $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.can_access_linked_entity(entity_type, entity_id))
$policy$)
FROM (VALUES
  ('comments'), ('attachments'), ('docusign_envelopes'), ('notifications')
) AS names(t);

-- A to-do with no job and no client is a personal/team list and stays shared.
SELECT public.attach_company_scope('todo_items', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (linked_project_id IS NULL AND linked_client_id IS NULL)
  OR (linked_project_id IS NOT NULL AND (SELECT public.can_access_project(linked_project_id)))
  OR (linked_project_id IS NULL AND linked_client_id IS NOT NULL AND (SELECT public.can_access_client(linked_client_id)))
$policy$);

SELECT public.attach_company_scope('crm_activities', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR (
    (lead_id IS NULL OR (SELECT public.can_access_lead(lead_id)))
    AND (deal_id IS NULL OR (SELECT public.can_access_deal(deal_id)))
  )
$policy$);

-- Drip steps follow their sequence. Steps of an all-companies drip (null
-- brand) are owner-only; everyone can still read steps for their brands.
SELECT public.attach_company_scope('message_sequence_steps', $policy$
  NOT (SELECT public.is_staff())
  OR (SELECT public.is_owner())
  OR EXISTS (
    SELECT 1 FROM message_sequences s
    WHERE s.id = message_sequence_steps.sequence_id
      AND s.company_id IS NOT NULL
      AND (SELECT public.can_access_company(s.company_id))
  )
$policy$);

-- Stop the non-owner from clearing a brand or writing a shared (null) row.
SELECT public.attach_brand_guard(t, false)
FROM (VALUES
  ('leads'), ('clients'), ('projects'), ('estimates'), ('invoices'), ('payments'),
  ('calendar_events'), ('tasks'), ('change_orders'), ('draws'), ('sub_invoices'),
  ('designs'), ('documents'), ('municipalities'), ('barrier_daily_logs'),
  ('punch_list_items'), ('subcontractor_barrier_acknowledgments'),
  ('contract_templates'), ('payment_schedule_templates'), ('allowances_templates'),
  ('payment_schedule_rules'), ('message_settings'), ('message_enrollments'), ('messages')
) AS names(t);

-- Null brand on these means "every company". Only the owner writes those.
SELECT public.attach_brand_guard(t, true)
FROM (VALUES
  ('message_templates'), ('message_sequences'), ('scope_templates')
) AS names(t);

-- Deals use brand_company_id, not company_id, so the generic guard doesn't fit.
CREATE OR REPLACE FUNCTION public.guard_deal_brand() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() OR public.is_owner() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.brand_company_id IS NOT DISTINCT FROM OLD.brand_company_id THEN
    RETURN NEW;
  END IF;
  -- A new deal, or a brand change, has to land on a company they work in.
  -- Leaving an existing unbranded deal's brand blank (so it can still be
  -- edited) is handled above, where the brand did not change.
  IF NEW.brand_company_id IS NULL OR NOT public.can_access_company(NEW.brand_company_id) THEN
    RAISE EXCEPTION 'You are not assigned to that company' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.brand_company_id IS NOT NULL AND NOT public.can_access_company(OLD.brand_company_id) THEN
    RAISE EXCEPTION 'You are not assigned to that company' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.guard_deal_brand() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_deal_brand() TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'brand_company_id'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS zz_guard_deal_brand ON deals';
    EXECUTE 'CREATE TRIGGER zz_guard_deal_brand BEFORE INSERT OR UPDATE OR DELETE ON deals
             FOR EACH ROW EXECUTE FUNCTION public.guard_deal_brand()';
  END IF;
END $$;

-- Helpers for this migration only. Not part of the app API.
REVOKE ALL ON FUNCTION public.attach_company_scope(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_brand_guard(text, boolean) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
