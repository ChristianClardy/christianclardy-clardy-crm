-- Rolls back the access-model changes in 065_multi_tenant_foundation.sql.
-- Does not run unless you run it. Does not clear organization_id values
-- and does not drop organization_id columns: those stamps are how rows
-- stay attached to Clardy Construction if you apply 065 again.
--
-- After this file:
--   * is_staff() is the Clardy-only check from 041 again.
--   * Brand access matches 062 again.
--   * The new workspace / billing tables are dropped.
--   * Tenant isolation policies are removed, so a second tenant created
--     in between would be able to see Clardy data. Don't create tenants
--     and then roll this back on production.
--
-- Run in the Supabase SQL editor. Take a backup first.
--
-- The forward file's parent-backfill only follows a uuid foreign key. That
-- check lives in 065 and is not a separate object, so this rollback does
-- not drop or recreate it.

DROP POLICY IF EXISTS tenant_isolation ON organizations;
DROP POLICY IF EXISTS tenant_isolation ON employee_company_assignments;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.relname);
    EXECUTE format('DROP TRIGGER IF EXISTS assign_organization_id ON public.%I', r.relname);
  END LOOP;
END $$;

DROP TABLE IF EXISTS
  price_list_items, price_lists, tax_rates, custom_field_values, custom_field_definitions,
  pipeline_stages, tenant_settings, tenant_modules, tenant_subscriptions, billing_plans,
  platform_admins
CASCADE;

DROP FUNCTION IF EXISTS public.apply_subscription_status(uuid, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.platform_set_subscription(uuid, text, text);
DROP FUNCTION IF EXISTS public.platform_tenant_directory();
DROP FUNCTION IF EXISTS public.accept_org_invite(text);
DROP FUNCTION IF EXISTS public.create_tenant(text, jsonb);
DROP FUNCTION IF EXISTS public.seed_tenant_defaults(uuid);
DROP FUNCTION IF EXISTS public.tenant_has_module(text);
DROP FUNCTION IF EXISTS public.tenant_isolation_enabled();
DROP FUNCTION IF EXISTS public.attach_tenant_isolation(regclass);
DROP FUNCTION IF EXISTS public.assign_organization_id();
DROP FUNCTION IF EXISTS public.company_in_current_org(uuid);
DROP FUNCTION IF EXISTS public.is_portal_login();
DROP FUNCTION IF EXISTS public.current_org_id();
DROP FUNCTION IF EXISTS public.jwt_active_org_id();

-- 041: staff is a member of Clardy Construction, and not a portal login.
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

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff() AND EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = public.staff_org_id()
      AND role = 'admin'
      AND COALESCE(status, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND COALESCE(status, 'active') = 'active'
      AND is_owner
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_module(p_module text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_role  text;
  v_perms jsonb;
BEGIN
  IF public.is_admin() THEN RETURN true; END IF;
  IF NOT public.is_staff() THEN RETURN false; END IF;
  SELECT e.role::text INTO v_role
  FROM employees e JOIN auth.users u ON lower(u.email) = lower(e.email)
  WHERE u.id = auth.uid() AND COALESCE(e.status::text, 'active') <> 'inactive'
  LIMIT 1;
  IF v_role IS NULL THEN RETURN false; END IF;
  SELECT settings->'role_permissions' INTO v_perms
  FROM company_profiles WHERE settings ? 'role_permissions'
  ORDER BY created_at LIMIT 1;
  RETURN COALESCE((v_perms -> v_role ->> p_module)::boolean, false);
END $$;

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
