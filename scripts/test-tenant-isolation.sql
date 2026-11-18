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

-- Shapes taken from the live catalog (project fneasddxtejasvsojgcu).
-- client_id on the credential tables is text. deals.company_id points at
-- crm_companies, not company_profiles. estimates.client_id is uuid with no FK.
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  client_id text,
  organization_id uuid,
  company_id uuid REFERENCES company_profiles(id)
);

CREATE TABLE IF NOT EXISTS crm_companies (
  id uuid PRIMARY KEY,
  organization_id uuid,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id uuid PRIMARY KEY,
  organization_id uuid,
  type text NOT NULL,
  company_id uuid REFERENCES crm_companies(id)
);

CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY,
  organization_id uuid,
  title text NOT NULL,
  company_id uuid REFERENCES crm_companies(id),
  brand_company_id uuid
);

CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  client_id uuid,
  company_id uuid REFERENCES company_profiles(id),
  organization_id uuid
);

CREATE TABLE IF NOT EXISTS quickbooks_credentials (
  id integer PRIMARY KEY,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  environment text NOT NULL
);

CREATE TABLE IF NOT EXISTS docusign_credentials (
  id uuid PRIMARY KEY,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  environment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quickbooks_links (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  qb_type text NOT NULL,
  qb_id text NOT NULL,
  origin text NOT NULL
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

INSERT INTO organizations (id, name, slug)
VALUES ('99999999-9999-4999-8999-999999999999', 'Other Org', 'other');

INSERT INTO clients (id, name, client_id, organization_id, company_id)
VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'External Ref Client', 'EXT-100', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO crm_companies (id, organization_id, name)
VALUES ('f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0', NULL, 'CRM Customer Co');

INSERT INTO crm_activities (id, organization_id, type, company_id)
VALUES ('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1', NULL, 'call', 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0');

INSERT INTO deals (id, organization_id, title, company_id)
VALUES ('f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2', NULL, 'Pool deal', 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0');

-- client_id matches a client, but there is no FK, and that client will be
-- stamped from its company. The estimate must NOT inherit through client_id.
-- A second organization on the client would leak into the estimate if it did.
UPDATE clients SET organization_id = '99999999-9999-4999-8999-999999999999' WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

INSERT INTO estimates (id, title, client_id, company_id, organization_id)
VALUES ('f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3', 'No FK estimate', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', NULL, NULL);

INSERT INTO quickbooks_credentials (id, client_id, client_secret, environment)
VALUES (1, 'QB-APP-CLIENT', 'not-a-real-secret', 'sandbox');

INSERT INTO docusign_credentials (id, client_id, client_secret, environment)
VALUES ('f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f4f4', 'DS-INTEGRATION-KEY', 'not-a-real-secret', 'demo');

INSERT INTO quickbooks_links (id, entity_type, entity_id, qb_type, qb_id, origin)
VALUES ('f5f5f5f5-f5f5-45f5-85f5-f5f5f5f5f5f5', 'client', 'QB-CUST-1', 'Customer', '88', 'clardy');

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

ALTER TABLE quickbooks_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE docusign_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON quickbooks_credentials;
CREATE POLICY authenticated_full_access ON quickbooks_credentials FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_full_access ON docusign_credentials;
CREATE POLICY authenticated_full_access ON docusign_credentials FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_full_access ON deals;
CREATE POLICY authenticated_full_access ON deals FOR ALL TO authenticated USING (true) WITH CHECK (true);

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

  IF (SELECT client_id FROM quickbooks_credentials WHERE id = 1) IS DISTINCT FROM 'QB-APP-CLIENT'
     OR (SELECT organization_id FROM quickbooks_credentials WHERE id = 1)
        IS DISTINCT FROM '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid THEN
    RAISE EXCEPTION 'quickbooks_credentials was joined on its text client_id or left unstamped';
  END IF;
  IF (SELECT client_id FROM docusign_credentials WHERE id = 'f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f4f4') IS DISTINCT FROM 'DS-INTEGRATION-KEY'
     OR (SELECT organization_id FROM docusign_credentials WHERE id = 'f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f4f4')
        IS DISTINCT FROM '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid THEN
    RAISE EXCEPTION 'docusign_credentials was joined on its text client_id or left unstamped';
  END IF;
  IF (SELECT company_id FROM deals WHERE id = 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2')
       IS DISTINCT FROM 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0'::uuid
     OR (SELECT organization_id FROM deals WHERE id = 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2')
       IS DISTINCT FROM '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid THEN
    RAISE EXCEPTION 'deal company_id (a CRM customer) was treated as a brand';
  END IF;
  IF (SELECT organization_id FROM estimates WHERE id = 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3')
       IS DISTINCT FROM '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid THEN
    RAISE EXCEPTION 'estimate inherited organization_id through a client_id that has no foreign key';
  END IF;
  IF (SELECT client_id FROM clients WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') IS DISTINCT FROM 'EXT-100' THEN
    RAISE EXCEPTION 'clients.client_id text reference was rewritten';
  END IF;
  IF (SELECT entity_id FROM quickbooks_links WHERE id = 'f5f5f5f5-f5f5-45f5-85f5-f5f5f5f5f5f5') IS DISTINCT FROM 'QB-CUST-1' THEN
    RAISE EXCEPTION 'quickbooks_links.entity_id was rewritten';
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
  IF (SELECT count(*) FROM quickbooks_credentials) <> 0
     OR (SELECT count(*) FROM docusign_credentials) <> 0
     OR (SELECT count(*) FROM deals) <> 0 THEN
    RAISE EXCEPTION 'North Star can see Clardy integration credentials or deals';
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

-- Platform directory: Christian sees Clardy, North Star, and the fixture
-- organization used to prove a non-FK client_id is not followed. North Star does not.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.platform_tenant_directory();
  IF n <> 3 THEN RAISE EXCEPTION 'directory returned % tenants, expected 3', n; END IF;
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
