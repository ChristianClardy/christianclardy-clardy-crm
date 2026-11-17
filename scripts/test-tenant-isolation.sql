-- Proves two tenants cannot read or write each other's rows.
-- Runs against a local throwaway database. Does not connect to production.
--
--   sudo -u postgres createdb clardy_tenant_test
--   sudo -u postgres psql -d clardy_tenant_test -v ON_ERROR_STOP=1 -f scripts/test-tenant-isolation.sql

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid,
  role text,
  status text,
  is_owner boolean NOT NULL DEFAULT false,
  invited_email text,
  joined_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  email text NOT NULL,
  role text,
  token text,
  invited_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  organization_id uuid,
  phone text,
  email text,
  address text,
  website text,
  license_number text,
  is_active boolean DEFAULT true,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  role text,
  status text,
  organization_id uuid,
  user_id uuid
);

CREATE TABLE IF NOT EXISTS employee_company_assignments (
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, company_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  organization_id uuid,
  company_id uuid,
  status text
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  company_id uuid,
  amount_received numeric(14,2) NOT NULL,
  linked_job_id uuid
);

-- The archived import company. The migration may stamp organization_id.
-- It must not flip is_active or rename it.
INSERT INTO organizations (id, name, slug)
VALUES ('2c9485d2-9b17-48d4-bea7-72770c1e9eb9', 'Clardy Construction, LLC', 'clardy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO company_profiles (id, name, organization_id, is_active)
VALUES ('a7c41e00-0000-4000-8000-000000000325', 'Archived – March 2026 Lead Import', NULL, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-4111-8111-111111111111', 'christianclardy7@gmail.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_members (organization_id, user_id, role, status, is_owner)
VALUES ('2c9485d2-9b17-48d4-bea7-72770c1e9eb9', '11111111-1111-4111-8111-111111111111', 'admin', 'active', true);

INSERT INTO company_profiles (id, name, organization_id, is_active)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Principle Outdoor Living', '2c9485d2-9b17-48d4-bea7-72770c1e9eb9', true);

INSERT INTO leads (id, full_name, organization_id, company_id, status)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Holly Example', '2c9485d2-9b17-48d4-bea7-72770c1e9eb9', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'New Lead');

-- Untagged on purpose. Backfill must file it under Clardy and leave the name.
INSERT INTO leads (id, full_name, organization_id, status)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Untagged Lead', NULL, 'Contacted');

INSERT INTO payments (id, organization_id, company_id, amount_received)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '2c9485d2-9b17-48d4-bea7-72770c1e9eb9', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1250.00);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_full_access ON leads;
CREATE POLICY authenticated_full_access ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_full_access ON payments;
CREATE POLICY authenticated_full_access ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_full_access ON company_profiles;
CREATE POLICY authenticated_full_access ON company_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_full_access ON organizations;
CREATE POLICY authenticated_full_access ON organizations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_full_access ON organization_members;
CREATE POLICY authenticated_full_access ON organization_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

\ir ../supabase/migrations/065_multi_tenant_foundation.sql

-- Mirror production: non-staff see nothing on these tables.
DROP POLICY IF EXISTS staff_only ON leads;
CREATE POLICY staff_only ON leads AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()));
DROP POLICY IF EXISTS staff_only ON payments;
CREATE POLICY staff_only ON payments AS RESTRICTIVE FOR ALL TO public
  USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Backfill stamped the untagged lead and did not touch the payment amount
-- or the archived company's active flag.
DO $$
DECLARE
  stamped uuid;
  amount numeric;
  archived_active boolean;
  archived_name text;
BEGIN
  SELECT organization_id INTO stamped FROM leads WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  IF stamped IS DISTINCT FROM '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid THEN
    RAISE EXCEPTION 'untagged lead was not filed under Clardy (got %)', stamped;
  END IF;
  SELECT amount_received INTO amount FROM payments WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  IF amount <> 1250.00 THEN
    RAISE EXCEPTION 'payment amount changed to %', amount;
  END IF;
  SELECT is_active, name INTO archived_active, archived_name
  FROM company_profiles WHERE id = 'a7c41e00-0000-4000-8000-000000000325';
  IF archived_active IS DISTINCT FROM false OR archived_name IS DISTINCT FROM 'Archived – March 2026 Lead Import' THEN
    RAISE EXCEPTION 'archived import company was modified (% / %)', archived_name, archived_active;
  END IF;
  IF (SELECT organization_id FROM company_profiles WHERE id = 'a7c41e00-0000-4000-8000-000000000325')
     IS DISTINCT FROM '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid THEN
    RAISE EXCEPTION 'archived company was not kept on the founding tenant';
  END IF;
END $$;

-- Second tenant, signed up through the same function the app calls.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('22222222-2222-4222-8222-222222222222', 'owner@northstar.test', '{"full_name":"North Owner"}');

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","app_metadata":{}}', false);
SET ROLE authenticated;
SELECT public.create_tenant('North Star Pools', '{"phone":"555-0100"}'::jsonb);
RESET ROLE;

-- Their own lead and payment, written as that tenant.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;
INSERT INTO leads (full_name, status) VALUES ('North Customer', 'New Lead');
INSERT INTO payments (amount_received) VALUES (80.00);
RESET ROLE;

-- Clardy sees two leads and one payment. Not North Star's $80.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","app_metadata":{}}', false);
SET ROLE authenticated;
DO $$
DECLARE
  lead_count int;
  pay_count int;
  pay_sum numeric;
BEGIN
  SELECT count(*) INTO lead_count FROM leads;
  SELECT count(*), COALESCE(sum(amount_received), 0) INTO pay_count, pay_sum FROM payments;
  IF lead_count <> 2 THEN
    RAISE EXCEPTION 'Clardy saw % leads, expected 2', lead_count;
  END IF;
  IF pay_count <> 1 OR pay_sum <> 1250.00 THEN
    RAISE EXCEPTION 'Clardy saw % payments totaling %', pay_count, pay_sum;
  END IF;
END $$;
RESET ROLE;

-- North Star sees only its own lead and its own $80 payment.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;
DO $$
DECLARE
  lead_count int;
  pay_sum numeric;
  changed int;
BEGIN
  SELECT count(*) INTO lead_count FROM leads;
  SELECT COALESCE(sum(amount_received), 0) INTO pay_sum FROM payments;
  IF lead_count <> 1 THEN
    RAISE EXCEPTION 'North Star saw % leads, expected 1', lead_count;
  END IF;
  IF pay_sum <> 80.00 THEN
    RAISE EXCEPTION 'North Star saw payments totaling %', pay_sum;
  END IF;
  UPDATE payments SET amount_received = 1
  WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN
    RAISE EXCEPTION 'North Star updated Clardy''s payment';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  amount numeric;
BEGIN
  SELECT amount_received INTO amount FROM payments WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  IF amount <> 1250.00 THEN
    RAISE EXCEPTION 'Clardy payment is now %', amount;
  END IF;
END $$;

-- A login with no organization sees nothing.
INSERT INTO auth.users (id, email) VALUES ('33333333-3333-4333-8333-333333333333', 'stranger@example.com');
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM leads;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger saw % leads', n; END IF;
  SELECT count(*) INTO n FROM payments;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger saw % payments', n; END IF;
END $$;
RESET ROLE;

-- Platform directory: Christian sees both tenants. North Star does not.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.platform_tenant_directory();
  IF n <> 2 THEN RAISE EXCEPTION 'directory returned % tenants, expected 2', n; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM public.platform_tenant_directory();
  RAISE EXCEPTION 'North Star was allowed to list tenants';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;

-- Founding subscription is comped enterprise, so his modules stay on.
DO $$
DECLARE
  st text;
  plan text;
  mods int;
BEGIN
  SELECT status, plan_key INTO st, plan FROM tenant_subscriptions
  WHERE organization_id = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9';
  IF st IS DISTINCT FROM 'comped' OR plan IS DISTINCT FROM 'enterprise' THEN
    RAISE EXCEPTION 'founding subscription is % / %', plan, st;
  END IF;
  SELECT count(*) INTO mods FROM tenant_modules
  WHERE organization_id = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' AND enabled;
  IF mods < 13 THEN
    RAISE EXCEPTION 'founding tenant has only % modules enabled', mods;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenant_modules
    WHERE organization_id = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'
      AND module_key IN ('distribution','install') AND enabled
  ) THEN
    RAISE EXCEPTION 'distribution or install is off for the founding tenant';
  END IF;
END $$;
