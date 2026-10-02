-- Municipalities (permit portal logins, passwords, security answers) are
-- visible only to admins, plus any role an admin switches on in
-- Settings → Permissions (none by default). Enforced here, not just in the
-- menu, so no other login can read the table through the API.
--
--   is_admin()                — active admin member of the staff org
--   can_access_module('x')    — admin, or the caller's employee role has 'x'
--                               switched on in Settings → Permissions
--   only admins can change the saved role permissions themselves.
-- Run this in your Supabase SQL editor.

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

-- The saved switches live in company_profiles.settings.role_permissions
-- (Settings → Permissions). A role with nothing saved for a module is off.
CREATE OR REPLACE FUNCTION public.can_access_module(p_module text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_role  text;
  v_perms jsonb;
BEGIN
  IF public.is_admin() THEN RETURN true; END IF;
  IF NOT public.is_staff() THEN RETURN false; END IF;
  SELECT e.role INTO v_role
  FROM employees e JOIN auth.users u ON lower(u.email) = lower(e.email)
  WHERE u.id = auth.uid() AND COALESCE(e.status, 'active') <> 'inactive'
  LIMIT 1;
  IF v_role IS NULL THEN RETURN false; END IF;
  SELECT settings->'role_permissions' INTO v_perms
  FROM company_profiles WHERE settings ? 'role_permissions'
  ORDER BY created_at LIMIT 1;
  RETURN COALESCE((v_perms -> v_role ->> p_module)::boolean, false);
END $$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public, anon;
REVOKE ALL ON FUNCTION public.can_access_module(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_module(text) TO authenticated;

DROP POLICY IF EXISTS "module_access" ON municipalities;
CREATE POLICY "module_access" ON municipalities AS RESTRICTIVE FOR ALL TO public
  USING (public.can_access_module('municipalities'))
  WITH CHECK (public.can_access_module('municipalities'));

-- Only an admin can change who has access to what.
CREATE OR REPLACE FUNCTION public.protect_role_permissions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.settings -> 'role_permissions') IS DISTINCT FROM
         (CASE WHEN TG_OP = 'UPDATE' THEN OLD.settings -> 'role_permissions' END)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change role permissions.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_role_permissions ON company_profiles;
CREATE TRIGGER protect_role_permissions BEFORE INSERT OR UPDATE ON company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_permissions();

NOTIFY pgrst, 'reload schema';
