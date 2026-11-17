-- Multi-tenant foundation. NOT applied to production by this change.
-- Christian reviews and runs it (on a copy first, if he wants).
--
-- A tenant is an organizations row. Clardy Construction
-- (2c9485d2-9b17-48d4-bea7-72770c1e9eb9) stays tenant 1. Companies stay
-- brands inside a tenant. staff_org_id() is still that founding tenant.
--
-- What changes for his team after this runs: nothing they can see.
--   * Their logins stay members of the same organization.
--   * is_owner, company assignments, and role permissions still decide
--     who sees which brand.
--   * Every existing row keeps its company, status, and amounts. The only
--     data write is filling a NULL organization_id with the founding
--     tenant. Rows that already have an organization_id are not updated.
--   * The archived March 2026 lead-import company
--     (a7c41e00-0000-4000-8000-000000000325) is not renamed, reactivated,
--     or refiled. If its organization_id is null it is stamped with the
--     founding tenant so his team can still open it. Its leads' company_id
--     is not touched. Payments are not recalculated.
--
-- Isolation is a RESTRICTIVE policy named tenant_isolation. It ANDs with
-- the policies already on each table (staff_only, brand guards, portals).
-- Staff of tenant A cannot read or write tenant B. Portal logins are not
-- staff; their existing policies stay in charge.
--
-- New module tables (distribution, install, purchasing, time tracking)
-- must include organization_id and call
--   SELECT public.attach_tenant_isolation('public.<table>');
-- at the end of their migration. attach_tenant_isolation is not granted
-- to the API. Until that call, a new table that only has staff_only would
-- be visible to every tenant's staff, because is_staff() is now "member
-- of the caller's own organization" rather than "member of Clardy only".
--
-- Rollback: scripts/rollback-065-multi-tenant.sql
-- Apply 062 (and 055, 057, 063 if those tables exist) before this file.

-- ── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.staff_org_id() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid;
$$;

-- app_metadata is set by the service role, never by the user. A bad value
-- is ignored. Membership is the source of truth either way.
CREATE OR REPLACE FUNCTION public.jwt_active_org_id() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  raw text;
BEGIN
  raw := NULLIF(auth.jwt() -> 'app_metadata' ->> 'active_organization_id', '');
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION WHEN invalid_text_representation OR undefined_function THEN
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.jwt_active_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jwt_active_org_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT om.organization_id
  FROM organization_members om
  WHERE om.user_id = auth.uid()
    AND COALESCE(om.status, 'active') = 'active'
    AND (
      om.organization_id = public.jwt_active_org_id()
      OR NOT EXISTS (
        SELECT 1 FROM organization_members preferred
        WHERE preferred.user_id = auth.uid()
          AND COALESCE(preferred.status, 'active') = 'active'
          AND preferred.organization_id = public.jwt_active_org_id()
      )
    )
  ORDER BY om.is_owner DESC NULLS LAST, om.joined_at ASC NULLS LAST, om.organization_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;

-- True when this login is a sub, PM, or customer portal. Missing portal
-- helpers (a database that has not run 034/040/041) count as not a portal.
CREATE OR REPLACE FUNCTION public.is_portal_login() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hit boolean;
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.is_sub_user()', 'public.is_pm_user()', 'public.is_customer_user()'] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE 'SELECT ' || fn INTO hit;
      IF hit THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.is_portal_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_portal_login() TO authenticated;

-- Staff = an active member of their own organization, and not a portal login.
-- The founding team still qualifies: their only membership is staff_org_id().
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_org_id() IS NOT NULL
    AND NOT public.is_portal_login();
$$;

CREATE OR REPLACE FUNCTION public.get_my_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_org_id();
$$;

REVOKE ALL ON FUNCTION public.get_my_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;

-- Owner of the organization they are currently in. Not every organization
-- they have ever joined.
CREATE OR REPLACE FUNCTION public.is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = public.current_org_id()
      AND COALESCE(status, 'active') = 'active'
      AND is_owner
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff() AND EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = public.current_org_id()
      AND role = 'admin'
      AND COALESCE(status, 'active') = 'active'
  );
$$;

-- Role switches are read from a company in THIS organization. Employees are
-- matched inside this organization too, so two tenants can employ the same
-- email without sharing a role.
CREATE OR REPLACE FUNCTION public.can_access_module(p_module text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_role  text;
  v_perms jsonb;
BEGIN
  IF public.is_admin() THEN RETURN true; END IF;
  IF NOT public.is_staff() THEN RETURN false; END IF;
  SELECT e.role::text INTO v_role
  FROM employees e
  JOIN auth.users u ON lower(u.email) = lower(e.email)
  WHERE u.id = auth.uid()
    AND COALESCE(e.status::text, 'active') <> 'inactive'
    AND (
      e.organization_id = public.current_org_id()
      OR (e.organization_id IS NULL AND public.current_org_id() = public.staff_org_id())
    )
  LIMIT 1;
  IF v_role IS NULL THEN RETURN false; END IF;
  SELECT settings->'role_permissions' INTO v_perms
  FROM company_profiles
  WHERE settings ? 'role_permissions'
    AND (
      organization_id = public.current_org_id()
      OR (organization_id IS NULL AND public.current_org_id() = public.staff_org_id())
    )
  ORDER BY created_at
  LIMIT 1;
  RETURN COALESCE((v_perms -> v_role ->> p_module)::boolean, false);
END $$;

CREATE OR REPLACE FUNCTION public.company_in_current_org(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_profiles c
    WHERE c.id = p_company
      AND (
        c.organization_id = public.current_org_id()
        OR (c.organization_id IS NULL AND public.current_org_id() = public.staff_org_id())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.company_in_current_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_in_current_org(uuid) TO authenticated;

-- Same brand rule as 062, plus the company has to belong to this tenant.
CREATE OR REPLACE FUNCTION public.can_access_company(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_company IS NULL THEN public.is_owner()
    ELSE public.company_in_current_org(p_company)
      AND (
        public.is_owner()
        OR EXISTS (
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
      )
  END;
$$;

CREATE OR REPLACE FUNCTION public.my_company_access() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'is_owner', public.is_owner(),
    'company_ids', COALESCE((
      SELECT jsonb_agg(DISTINCT a.company_id)
      FROM employee_company_assignments a
      JOIN employees e ON e.id = a.employee_id
      JOIN company_profiles c ON c.id = a.company_id
      WHERE COALESCE(e.status::text, 'active') = 'active'
        AND (
          c.organization_id = public.current_org_id()
          OR (c.organization_id IS NULL AND public.current_org_id() = public.staff_org_id())
        )
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

-- New hires start on the active brands of their own organization only.
-- Inactive companies, including the archived lead import, stay unassigned.
CREATE OR REPLACE FUNCTION public.assign_default_companies() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org uuid;
BEGIN
  org := COALESCE(NEW.organization_id, public.current_org_id());
  INSERT INTO employee_company_assignments (employee_id, company_id)
  SELECT NEW.id, c.id
  FROM company_profiles c
  WHERE COALESCE(c.is_active, true) = true
    AND c.id IS DISTINCT FROM 'a7c41e00-0000-4000-8000-000000000325'::uuid
    AND (
      c.organization_id = org
      OR (org = public.staff_org_id() AND c.organization_id IS NULL)
    )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- ── Catalog, subscription, and workspace configuration ─────────────────────

CREATE TABLE IF NOT EXISTS billing_plans (
  key              text PRIMARY KEY,
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  price_cents      integer NOT NULL DEFAULT 0,
  currency         text NOT NULL DEFAULT 'usd',
  billing_interval text NOT NULL DEFAULT 'month',
  seat_limit       integer,
  module_keys      text[] NOT NULL DEFAULT '{}',
  stripe_price_id  text,
  is_public        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0
);

INSERT INTO billing_plans (key, name, description, price_cents, seat_limit, module_keys, sort_order) VALUES
  ('starter', 'Starter', 'CRM, jobs, estimates, and invoices for a small crew.', 4900, 5,
    ARRAY['crm','projects','estimating','invoicing','documents','calendar'], 10),
  ('professional', 'Professional', 'The full construction workspace, including distribution when that module is installed.', 14900, 25,
    ARRAY['crm','projects','estimating','invoicing','documents','calendar','messaging','subcontractors','builder','distribution'], 20),
  ('enterprise', 'Enterprise', 'Every module, including purchasing, payroll-ready time tracking, and install tracking.', 0, NULL,
    ARRAY['crm','projects','estimating','invoicing','documents','calendar','messaging','subcontractors','builder','distribution','install','purchasing','time_tracking'], 30)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  seat_limit = EXCLUDED.seat_limit,
  module_keys = EXCLUDED.module_keys,
  sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  organization_id         uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan_key                text NOT NULL REFERENCES billing_plans(key),
  status                  text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','canceled','incomplete','comped')),
  trial_ends_at           timestamptz,
  current_period_end      timestamptz,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_modules (
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_key       text NOT NULL,
  enabled          boolean NOT NULL DEFAULT false,
  included_in_plan boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, module_key)
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  branding        jsonb NOT NULL DEFAULT '{}'::jsonb,
  numbering       jsonb NOT NULL DEFAULT '{}'::jsonb,
  locale          text NOT NULL DEFAULT 'en-US',
  currency        text NOT NULL DEFAULT 'USD',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_key     text NOT NULL DEFAULT 'leads',
  stage_key        text NOT NULL,
  label            text NOT NULL,
  sort_order       integer NOT NULL DEFAULT 0,
  color            text,
  is_won           boolean NOT NULL DEFAULT false,
  is_lost          boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pipeline_key, stage_key)
);

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type      text NOT NULL CHECK (entity_type IN ('lead','client','project','estimate','invoice')),
  field_key        text NOT NULL,
  label            text NOT NULL,
  field_type       text NOT NULL CHECK (field_type IN ('text','number','date','boolean','select','money')),
  options          jsonb NOT NULL DEFAULT '[]'::jsonb,
  required         boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  archived         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_type, field_key)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type      text NOT NULL,
  entity_id        uuid NOT NULL,
  field_key        text NOT NULL,
  value            jsonb,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_type, entity_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_entity
  ON custom_field_values (organization_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS price_lists (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  currency         text NOT NULL DEFAULT 'USD',
  is_default       boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  price_list_id    uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  name             text NOT NULL,
  sku              text,
  unit             text,
  unit_price       numeric(14,2) NOT NULL DEFAULT 0,
  material_id      uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_list_items_list ON price_list_items (price_list_id);

CREATE TABLE IF NOT EXISTS tax_rates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  rate             numeric(8,5) NOT NULL DEFAULT 0,
  is_default       boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform_admins IS
  'Clardy.io operators. They can list tenants and plans. They do not receive a bypass of tenant_isolation on business tables.';

-- Defined before the policies that call it. SECURITY DEFINER so the
-- organizations policy and this function do not recurse through RLS.
CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- ── Stamp organization_id where it is missing ───────────────────────────────
-- Only NULL organization_id values are filled. No other column is written.
-- The archived import company is included in the company_profiles stamp and
-- nowhere else.

DO $$
DECLARE
  t text;
  extra text[] := ARRAY[
    'allowances_templates','assemblies','barrier_daily_logs','calendar_feed_tokens',
    'contract_templates','cost_codes','customer_portal_users','data_erasure_log',
    'docusign_credentials','followup_log','followup_rules','followup_settings',
    'message_enrollments','message_opt_outs','message_sequence_steps','message_sequences',
    'message_settings','message_templates','messages','municipalities',
    'payment_schedule_rules','payment_schedule_templates','pm_portal_users',
    'pool_selections','project_subcontractors','punch_list_items',
    'quickbooks_connection','quickbooks_credentials','quickbooks_links',
    'scope_templates','subcontractor_barrier_acknowledgments','subcontractor_portal_users'
  ];
BEGIN
  FOREACH t IN ARRAY extra LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
       ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE',
        t
      );
    END IF;
  END LOOP;
END $$;

-- company_profiles and employees already have the column. Fill nulls first
-- so later tables can inherit from them.
DO $$
BEGIN
  IF to_regclass('public.company_profiles') IS NOT NULL THEN
    UPDATE company_profiles
    SET organization_id = public.staff_org_id()
    WHERE organization_id IS NULL;
  END IF;
  IF to_regclass('public.employees') IS NOT NULL THEN
    UPDATE employees
    SET organization_id = public.staff_org_id()
    WHERE organization_id IS NULL;
  END IF;
END $$;

-- Inherit from a parent row when that parent is already stamped. Payments
-- included: organization_id only. Amounts, status, and linked jobs stay.
DO $$
DECLARE
  r record;
  parent_col text;
  parent_table text;
  sql text;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      )
      AND c.relname NOT IN ('organizations','organization_members','company_profiles','employees')
  LOOP
    parent_col := NULL;
    parent_table := NULL;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.'||r.table_name) AND attname = 'company_id' AND NOT attisdropped) THEN
      parent_col := 'company_id'; parent_table := 'company_profiles';
    ELSIF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.'||r.table_name) AND attname = 'project_id' AND NOT attisdropped) THEN
      parent_col := 'project_id'; parent_table := 'projects';
    ELSIF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.'||r.table_name) AND attname = 'client_id' AND NOT attisdropped) THEN
      parent_col := 'client_id'; parent_table := 'clients';
    ELSIF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.'||r.table_name) AND attname = 'employee_id' AND NOT attisdropped) THEN
      parent_col := 'employee_id'; parent_table := 'employees';
    ELSIF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.'||r.table_name) AND attname = 'subcontractor_id' AND NOT attisdropped) THEN
      parent_col := 'subcontractor_id'; parent_table := 'subcontractors';
    END IF;

    IF parent_col IS NOT NULL AND to_regclass('public.'||parent_table) IS NOT NULL THEN
      sql := format(
        'UPDATE public.%I child SET organization_id = parent.organization_id
         FROM public.%I parent
         WHERE child.organization_id IS NULL
           AND child.%I = parent.id
           AND parent.organization_id IS NOT NULL',
        r.table_name, parent_table, parent_col
      );
      EXECUTE sql;
    END IF;

    -- Whatever is still untagged belonged to the only tenant that exists
    -- when this file runs. New tenants are created after this migration.
    EXECUTE format(
      'UPDATE public.%I SET organization_id = public.staff_org_id() WHERE organization_id IS NULL',
      r.table_name
    );
  END LOOP;
END $$;

-- ── Keep new rows inside the caller's organization ─────────────────────────

CREATE OR REPLACE FUNCTION public.assign_organization_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rowj jsonb := to_jsonb(NEW);
  parent_org uuid;
BEGIN
  IF NEW.organization_id IS NULL AND rowj ? 'company_id' AND NULLIF(rowj->>'company_id','') IS NOT NULL THEN
    SELECT organization_id INTO parent_org FROM company_profiles WHERE id = (rowj->>'company_id')::uuid;
    NEW.organization_id := parent_org;
  END IF;
  IF NEW.organization_id IS NULL AND rowj ? 'project_id' AND NULLIF(rowj->>'project_id','') IS NOT NULL
     AND to_regclass('public.projects') IS NOT NULL THEN
    SELECT organization_id INTO parent_org FROM projects WHERE id = (rowj->>'project_id')::uuid;
    NEW.organization_id := parent_org;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;
  IF auth.uid() IS NOT NULL AND public.is_staff()
     AND NEW.organization_id IS DISTINCT FROM public.current_org_id() THEN
    RAISE EXCEPTION 'Cannot write a record outside your organization' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.assign_organization_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_organization_id() TO authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      )
      AND c.relname NOT IN ('organization_members')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS assign_organization_id ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER assign_organization_id BEFORE INSERT OR UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.assign_organization_id()',
      r.table_name
    );
  END LOOP;
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.attach_tenant_isolation(p_table regclass) RETURNS void
LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  relname text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = p_table AND attname = 'organization_id' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'attach_tenant_isolation: % has no organization_id column', p_table;
  END IF;
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', p_table);
  EXECUTE format($policy$
    CREATE POLICY tenant_isolation ON %s AS RESTRICTIVE FOR ALL TO public
    USING (
      NOT (SELECT public.is_staff())
      OR organization_id = (SELECT public.current_org_id())
      OR (
        organization_id IS NULL
        AND (SELECT public.current_org_id()) = (SELECT public.staff_org_id())
      )
    )
    WITH CHECK (
      NOT (SELECT public.is_staff())
      OR organization_id = (SELECT public.current_org_id())
      OR (
        organization_id IS NULL
        AND (SELECT public.current_org_id()) = (SELECT public.staff_org_id())
      )
    )
  $policy$, p_table);
  SELECT c.relname INTO relname FROM pg_class c WHERE c.oid = p_table;
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %s (organization_id)',
    left('idx_' || relname || '_organization_id', 63),
    p_table
  );
END $$;

REVOKE ALL ON FUNCTION public.attach_tenant_isolation(regclass) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relrowsecurity
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      )
  LOOP
    PERFORM public.attach_tenant_isolation(r.rel);
  END LOOP;
END $$;

-- Brand assignments follow the company's tenant.
DO $$
BEGIN
  IF to_regclass('public.employee_company_assignments') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON employee_company_assignments';
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON employee_company_assignments AS RESTRICTIVE FOR ALL TO public
      USING (
        NOT (SELECT public.is_staff())
        OR (SELECT public.company_in_current_org(company_id))
      )
      WITH CHECK (
        NOT (SELECT public.is_staff())
        OR (SELECT public.company_in_current_org(company_id))
      )
    $policy$;
  END IF;
END $$;

-- New configuration tables: members of the org can read, admins can write.
-- custom_field_values are written by any staff member of the org (the value
-- sits on a lead or job). Viewers stay read-only when 055 is installed.

DO $$
DECLARE
  t text;
  admin_tables text[] := ARRAY[
    'tenant_modules','tenant_settings','pipeline_stages','custom_field_definitions',
    'price_lists','price_list_items','tax_rates'
  ];
BEGIN
  FOREACH t IN ARRAY admin_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_member_read ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_member_read ON public.%I FOR SELECT TO authenticated
       USING (organization_id = (SELECT public.current_org_id()))', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_admin_write ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_admin_write ON public.%I FOR ALL TO authenticated
       USING (organization_id = (SELECT public.current_org_id()) AND (SELECT public.is_admin()))
       WITH CHECK (organization_id = (SELECT public.current_org_id()) AND (SELECT public.is_admin()))', t);
    PERFORM public.attach_tenant_isolation(format('public.%I', t)::regclass);
    IF to_regprocedure('public.block_viewer_writes()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS viewer_read_only ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes()', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_member_read ON custom_field_values;
CREATE POLICY tenant_member_read ON custom_field_values FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_org_id()));
DROP POLICY IF EXISTS tenant_staff_write ON custom_field_values;
CREATE POLICY tenant_staff_write ON custom_field_values FOR ALL TO authenticated
  USING (organization_id = (SELECT public.current_org_id()) AND (SELECT public.is_staff()))
  WITH CHECK (organization_id = (SELECT public.current_org_id()) AND (SELECT public.is_staff()));
SELECT public.attach_tenant_isolation('public.custom_field_values');

ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_member_read ON tenant_subscriptions;
CREATE POLICY tenant_member_read ON tenant_subscriptions FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_org_id()) OR (SELECT public.is_platform_admin()));
-- Status changes go through apply_subscription_status / platform_set_subscription.
DROP POLICY IF EXISTS tenant_no_direct_write ON tenant_subscriptions;
CREATE POLICY tenant_no_direct_write ON tenant_subscriptions AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (false);
DROP POLICY IF EXISTS tenant_no_direct_update ON tenant_subscriptions;
CREATE POLICY tenant_no_direct_update ON tenant_subscriptions AS RESTRICTIVE FOR UPDATE TO public
  USING (false);
DROP POLICY IF EXISTS tenant_no_direct_delete ON tenant_subscriptions;
CREATE POLICY tenant_no_direct_delete ON tenant_subscriptions AS RESTRICTIVE FOR DELETE TO public
  USING (false);

ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read ON billing_plans;
CREATE POLICY plans_read ON billing_plans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS plans_no_write ON billing_plans;
CREATE POLICY plans_no_write ON billing_plans AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);
DROP POLICY IF EXISTS plans_no_update ON billing_plans;
CREATE POLICY plans_no_update ON billing_plans AS RESTRICTIVE FOR UPDATE TO public USING (false);
DROP POLICY IF EXISTS plans_no_delete ON billing_plans;
CREATE POLICY plans_no_delete ON billing_plans AS RESTRICTIVE FOR DELETE TO public USING (false);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_admin_read ON platform_admins;
CREATE POLICY platform_admin_read ON platform_admins FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_platform_admin()));
DROP POLICY IF EXISTS platform_admin_no_insert ON platform_admins;
CREATE POLICY platform_admin_no_insert ON platform_admins AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (false);
DROP POLICY IF EXISTS platform_admin_no_update ON platform_admins;
CREATE POLICY platform_admin_no_update ON platform_admins AS RESTRICTIVE FOR UPDATE TO public
  USING (false);
DROP POLICY IF EXISTS platform_admin_no_delete ON platform_admins;
CREATE POLICY platform_admin_no_delete ON platform_admins AS RESTRICTIVE FOR DELETE TO public
  USING (false);

-- organizations is keyed by id, not organization_id. A platform admin may
-- read every tenant's name and plan. They still cannot write another
-- tenant's row, and this policy does not cover business tables.
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.organizations';
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON public.organizations AS RESTRICTIVE FOR ALL TO public
      USING (
        NOT (SELECT public.is_staff())
        OR id = (SELECT public.current_org_id())
        OR (SELECT public.is_platform_admin())
      )
      WITH CHECK (
        NOT (SELECT public.is_staff())
        OR id = (SELECT public.current_org_id())
      )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON billing_plans, tenant_subscriptions, tenant_modules, tenant_settings,
      pipeline_stages, custom_field_definitions, custom_field_values, price_lists,
      price_list_items, tax_rates, platform_admins TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON tenant_modules, tenant_settings, pipeline_stages,
      custom_field_definitions, custom_field_values, price_lists, price_list_items, tax_rates
      TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_plans, tenant_subscriptions, tenant_modules,
      tenant_settings, pipeline_stages, custom_field_definitions, custom_field_values,
      price_lists, price_list_items, tax_rates, platform_admins TO service_role;
  END IF;
END $$;

-- ── Who is a platform operator ──────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO platform_admins (user_id)
    SELECT id FROM auth.users WHERE lower(email) = 'christianclardy7@gmail.com'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ── Defaults for a tenant ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_tenant_defaults(p_org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan text;
BEGIN
  SELECT COALESCE(
    (SELECT s.plan_key FROM tenant_subscriptions s WHERE s.organization_id = p_org),
    (SELECT o.plan FROM organizations o WHERE o.id = p_org),
    'professional'
  ) INTO v_plan;

  INSERT INTO tenant_modules (organization_id, module_key, enabled, included_in_plan)
  SELECT p_org, cat.key,
    cat.key = ANY (COALESCE((SELECT bp.module_keys FROM billing_plans bp WHERE bp.key = v_plan), ARRAY[]::text[])),
    cat.key = ANY (COALESCE((SELECT bp.module_keys FROM billing_plans bp WHERE bp.key = v_plan), ARRAY[]::text[]))
  FROM (VALUES
    ('crm'),('projects'),('estimating'),('invoicing'),('documents'),('calendar'),
    ('messaging'),('subcontractors'),('builder'),('distribution'),('install'),
    ('purchasing'),('time_tracking')
  ) AS cat(key)
  ON CONFLICT (organization_id, module_key) DO NOTHING;

  INSERT INTO tenant_settings (organization_id, branding, numbering)
  VALUES (
    p_org,
    jsonb_build_object(
      'logo_url', '',
      'primary_color', '#3d3530',
      'accent_color', '#b5965a',
      'font_family', 'Georgia'
    ),
    jsonb_build_object(
      'invoice', jsonb_build_object('prefix','INV-','next',1,'padding',4),
      'estimate', jsonb_build_object('prefix','EST-','next',1,'padding',4),
      'project', jsonb_build_object('prefix','JOB-','next',1,'padding',4)
    )
  )
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO pipeline_stages (organization_id, pipeline_key, stage_key, label, sort_order, is_won, is_lost)
  SELECT p_org, 'leads', slug, label, ord, won, lost
  FROM (VALUES
    (10, 'new-lead', 'New Lead', false, false),
    (20, 'contact-attempted', 'Contact Attempted', false, false),
    (30, 'contacted', 'Contacted', false, false),
    (40, 'appointment-scheduled', 'Appointment Scheduled', false, false),
    (50, 'site-visit-complete', 'Site Visit Complete', false, false),
    (60, 'design-appointment-scheduled', 'Design Appointment Scheduled', false, false),
    (70, 'in-design', 'In Design', false, false),
    (80, 'estimate-in-progress', 'Estimate In Progress', false, false),
    (90, 'quote-delivered', 'Quote Delivered/Price Locked', false, false),
    (100, 'in-financing', 'In Financing', false, false),
    (110, 'negotiating', 'Negotiating/Revising Scope', false, false),
    (120, 'won', 'Contract Signed/Deposit Collected (Won)', true, false),
    (130, 'lost', 'Lost/No Decision', false, true)
  ) AS stage(ord, slug, label, won, lost)
  ON CONFLICT (organization_id, pipeline_key, stage_key) DO NOTHING;

  INSERT INTO tax_rates (organization_id, name, rate, is_default, is_active)
  SELECT p_org, 'No tax', 0, true, true
  WHERE NOT EXISTS (SELECT 1 FROM tax_rates WHERE organization_id = p_org);

  INSERT INTO price_lists (organization_id, name, currency, is_default, is_active)
  SELECT p_org, 'Default', 'USD', true, true
  WHERE NOT EXISTS (SELECT 1 FROM price_lists WHERE organization_id = p_org);
END $$;

REVOKE ALL ON FUNCTION public.seed_tenant_defaults(uuid) FROM PUBLIC, anon, authenticated;

-- Founding tenant: every module on, subscription comped, so the app does
-- not start gating his team. distribution and install are on so the
-- Turf'n Texas module is available to him when its tables land.
INSERT INTO tenant_subscriptions (organization_id, plan_key, status)
SELECT id, 'enterprise', 'comped' FROM organizations WHERE id = public.staff_org_id()
ON CONFLICT (organization_id) DO NOTHING;

UPDATE organizations SET plan = 'enterprise' WHERE id = public.staff_org_id() AND (plan IS NULL OR plan = '');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM organizations WHERE id = public.staff_org_id()) THEN
    PERFORM public.seed_tenant_defaults(public.staff_org_id());
    UPDATE tenant_modules
    SET enabled = true, included_in_plan = true
    WHERE organization_id = public.staff_org_id();
  END IF;
END $$;

-- ── Signup, invites, gating, operator tools ────────────────────────────────

CREATE OR REPLACE FUNCTION public.tenant_has_module(p_module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.current_org_id() IS NULL THEN false
    -- Migration applied but the founding subscription row was not seeded:
    -- do not lock Clardy Construction out of the product.
    WHEN public.current_org_id() = public.staff_org_id()
      AND NOT EXISTS (SELECT 1 FROM tenant_subscriptions WHERE organization_id = public.staff_org_id())
      THEN true
    ELSE EXISTS (
      SELECT 1
      FROM tenant_modules m
      JOIN tenant_subscriptions s ON s.organization_id = m.organization_id
      WHERE m.organization_id = public.current_org_id()
        AND m.module_key = p_module
        AND m.enabled
        AND s.status IN ('trialing','active','comped')
        AND (s.status <> 'trialing' OR s.trial_ends_at IS NULL OR s.trial_ends_at > now())
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.tenant_has_module(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_module(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tenant_isolation_enabled() RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;

REVOKE ALL ON FUNCTION public.tenant_isolation_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_isolation_enabled() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_tenant(p_name text, p_profile jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  org_id uuid := gen_random_uuid();
  v_slug text;
  base_slug text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF public.is_portal_login() THEN
    RAISE EXCEPTION 'Portal logins cannot create a workspace' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = uid) THEN
    RAISE EXCEPTION 'This login is already tied to a workspace. Ask an admin to restore access.' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(p_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Enter a company name';
  END IF;

  base_slug := trim(both '-' FROM regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  IF base_slug = '' THEN base_slug := 'workspace'; END IF;
  v_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM organizations o WHERE o.slug = v_slug) LOOP
    v_slug := base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  END LOOP;

  INSERT INTO organizations (id, name, slug, plan)
  VALUES (org_id, trim(p_name), v_slug, 'professional');

  INSERT INTO organization_members (organization_id, user_id, role, status, is_owner, joined_at)
  VALUES (org_id, uid, 'admin', 'active', true, now());

  INSERT INTO company_profiles (name, organization_id, phone, email, address, website, license_number, is_active)
  VALUES (
    trim(p_name),
    org_id,
    NULLIF(p_profile->>'phone', ''),
    NULLIF(p_profile->>'email', ''),
    NULLIF(p_profile->>'address', ''),
    NULLIF(p_profile->>'website', ''),
    NULLIF(p_profile->>'license_number', ''),
    true
  );

  INSERT INTO tenant_subscriptions (organization_id, plan_key, status, trial_ends_at)
  VALUES (org_id, 'professional', 'trialing', now() + interval '14 days');

  PERFORM public.seed_tenant_defaults(org_id);

  IF to_regclass('public.employees') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'user_id'
     ) THEN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_role_enum') THEN
      INSERT INTO employees (full_name, email, role, status, organization_id, user_id)
      SELECT
        COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1), 'Owner'),
        u.email,
        'admin'::employee_role_enum,
        'active'::employee_status_enum,
        org_id,
        uid
      FROM auth.users u
      WHERE u.id = uid;
    ELSE
      INSERT INTO employees (full_name, email, role, status, organization_id, user_id)
      SELECT
        COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1), 'Owner'),
        u.email,
        'admin',
        'active',
        org_id,
        uid
      FROM auth.users u
      WHERE u.id = uid;
    END IF;
  END IF;

  RETURN org_id;
END $$;

REVOKE ALL ON FUNCTION public.create_tenant(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_org_invite(p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  inv organization_invitations%ROWTYPE;
  email text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = uid AND COALESCE(status,'active') = 'active') THEN
    RAISE EXCEPTION 'This login already belongs to a workspace' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO inv FROM organization_invitations
  WHERE token = trim(p_token) AND accepted_at IS NULL AND (expires_at IS NULL OR expires_at > now());
  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found or expired';
  END IF;
  SELECT lower(u.email) INTO email FROM auth.users u WHERE u.id = uid;
  IF inv.email IS NOT NULL AND lower(inv.email) <> COALESCE(email, '') THEN
    RAISE EXCEPTION 'This invite was sent to a different email' USING ERRCODE = '42501';
  END IF;
  INSERT INTO organization_members (organization_id, user_id, role, status, is_owner, invited_email, joined_at)
  VALUES (inv.organization_id, uid, COALESCE(inv.role, 'user'), 'active', false, email, now());
  UPDATE organization_invitations SET accepted_at = now() WHERE id = inv.id;
  RETURN inv.organization_id;
END $$;

REVOKE ALL ON FUNCTION public.accept_org_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_org_invite(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_tenant_directory()
RETURNS TABLE (
  organization_id uuid,
  name text,
  slug text,
  plan_key text,
  status text,
  trial_ends_at timestamptz,
  member_count bigint,
  enabled_modules integer,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    s.plan_key,
    s.status,
    s.trial_ends_at,
    (SELECT count(*) FROM organization_members m WHERE m.organization_id = o.id AND COALESCE(m.status,'active') = 'active'),
    (SELECT count(*)::integer FROM tenant_modules tm WHERE tm.organization_id = o.id AND tm.enabled),
    o.created_at
  FROM organizations o
  LEFT JOIN tenant_subscriptions s ON s.organization_id = o.id
  ORDER BY o.created_at NULLS LAST, o.name;
END $$;

REVOKE ALL ON FUNCTION public.platform_tenant_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_tenant_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_subscription(p_org uuid, p_plan text, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE key = p_plan) THEN
    RAISE EXCEPTION 'Unknown plan';
  END IF;
  IF p_status NOT IN ('trialing','active','past_due','canceled','incomplete','comped') THEN
    RAISE EXCEPTION 'Unknown status';
  END IF;
  INSERT INTO tenant_subscriptions (organization_id, plan_key, status)
  VALUES (p_org, p_plan, p_status)
  ON CONFLICT (organization_id) DO UPDATE
    SET plan_key = EXCLUDED.plan_key, status = EXCLUDED.status, updated_at = now();
  UPDATE organizations SET plan = p_plan WHERE id = p_org;
  PERFORM public.seed_tenant_defaults(p_org);
  UPDATE tenant_modules tm
  SET included_in_plan = tm.module_key = ANY (bp.module_keys),
      enabled = CASE
        WHEN tm.module_key = ANY (bp.module_keys) THEN tm.enabled
        ELSE false
      END,
      updated_at = now()
  FROM billing_plans bp
  WHERE bp.key = p_plan AND tm.organization_id = p_org;
END $$;

REVOKE ALL ON FUNCTION public.platform_set_subscription(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_subscription(uuid, text, text) TO authenticated;

-- Called by the Stripe webhook with the service role after the signature
-- check in api/_lib/billing.js. Does not touch job payments.
CREATE OR REPLACE FUNCTION public.apply_subscription_status(
  p_org uuid,
  p_status text,
  p_stripe_customer text DEFAULT NULL,
  p_stripe_subscription text DEFAULT NULL,
  p_period_end timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('trialing','active','past_due','canceled','incomplete','comped') THEN
    RAISE EXCEPTION 'Unknown status';
  END IF;
  UPDATE tenant_subscriptions
  SET status = p_status,
      stripe_customer_id = COALESCE(p_stripe_customer, stripe_customer_id),
      stripe_subscription_id = COALESCE(p_stripe_subscription, stripe_subscription_id),
      current_period_end = COALESCE(p_period_end, current_period_end),
      updated_at = now()
  WHERE organization_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription for that organization';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.apply_subscription_status(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.apply_subscription_status(uuid, text, text, text, timestamptz) TO service_role;
  END IF;
END $$;

COMMENT ON FUNCTION public.attach_tenant_isolation(regclass) IS
  'Call at the end of a module migration after organization_id exists. Reserved module keys: distribution, install, purchasing, time_tracking. The Turf''n Texas distribution work should use distribution (inventory/deliveries) and install (job installs).';
