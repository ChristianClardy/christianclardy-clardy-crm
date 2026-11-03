-- Proves 062_employee_company_access.sql against a throwaway database.
-- Not run in production. Usage: psql -v ON_ERROR_STOP=1 -f scripts/test-company-access.sql

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, anon;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  role text,
  status text
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  email text,
  role text,
  status text,
  organization_id uuid
);

CREATE TABLE IF NOT EXISTS company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_profiles(id),
  full_name text
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_profiles(id),
  name text
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_profiles(id),
  client_id uuid REFERENCES clients(id),
  name text
);

CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_profiles(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_profiles(id)
);

CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id),
  company_id uuid,
  title text
);

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);

CREATE TABLE IF NOT EXISTS estimate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_estimate_id uuid,
  project_id uuid
);

CREATE TABLE IF NOT EXISTS line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id uuid
);

-- Empty tables so every policy expression in the migration is parsed.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payments','calendar_events','tasks','change_orders','draws','sub_invoices',
    'designs','documents','municipalities','barrier_daily_logs','punch_list_items',
    'subcontractor_barrier_acknowledgments','contract_templates','payment_schedule_templates',
    'allowances_templates','payment_schedule_rules','scope_templates','message_settings',
    'message_templates','message_sequences','message_enrollments','messages',
    'job_cost_breakdowns','permit_inspection_tasks','permit_updates','pool_selections',
    'project_photos','project_sheets','project_subcontractors','reminders','selection_allowances',
    'lead_follow_ups','contact_history','site_visits','comments','attachments',
    'docusign_envelopes','notifications','todo_items','crm_activities','message_sequence_steps'
  ] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id uuid PRIMARY KEY DEFAULT gen_random_uuid())', t);
  END LOOP;
  -- Columns the policies read. ADD IF NOT EXISTS isn't valid; ignore duplicates.
  BEGIN ALTER TABLE payments ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE calendar_events ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE tasks ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE change_orders ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE draws ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE sub_invoices ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE designs ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE documents ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE municipalities ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE barrier_daily_logs ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE punch_list_items ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE subcontractor_barrier_acknowledgments ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE contract_templates ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payment_schedule_templates ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE allowances_templates ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payment_schedule_rules ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE scope_templates ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE message_settings ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE message_templates ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE message_sequences ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE message_enrollments ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE messages ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE job_cost_breakdowns ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE permit_inspection_tasks ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE permit_updates ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE pool_selections ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE project_photos ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE project_sheets ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE project_subcontractors ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE reminders ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE selection_allowances ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE lead_follow_ups ADD COLUMN lead_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE contact_history ADD COLUMN linked_lead_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE contact_history ADD COLUMN linked_client_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE site_visits ADD COLUMN project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE site_visits ADD COLUMN lead_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE comments ADD COLUMN entity_type text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE comments ADD COLUMN entity_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE attachments ADD COLUMN entity_type text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE attachments ADD COLUMN entity_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE docusign_envelopes ADD COLUMN entity_type text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE docusign_envelopes ADD COLUMN entity_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE notifications ADD COLUMN entity_type text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE notifications ADD COLUMN entity_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE todo_items ADD COLUMN linked_project_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE todo_items ADD COLUMN linked_client_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE crm_activities ADD COLUMN lead_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE crm_activities ADD COLUMN deal_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE message_sequence_steps ADD COLUMN sequence_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE OR REPLACE FUNCTION public.staff_org_id() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid $$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND COALESCE(status, 'active') = 'active'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- Same shape as production: a permissive allow plus a restrictive staff check.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','clients','projects','estimates','invoices','deals','materials','company_profiles','organization_members','employees','estimate_versions','line_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON %I', t);
    EXECUTE format('CREATE POLICY authenticated_full_access ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_only ON %I', t);
    EXECUTE format('CREATE POLICY staff_only ON %I AS RESTRICTIVE FOR ALL TO public USING (public.is_staff()) WITH CHECK (public.is_staff())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;

-- Fixture people and brands. The migration seeds assignments and the owner flag.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'christianclardy7@gmail.com'),
  ('22222222-2222-4222-8222-222222222222', 'roofing@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'inactive@example.com'),
  ('44444444-4444-4444-8444-444444444444', 'stranger@example.com');

INSERT INTO organization_members (organization_id, user_id, role, status) VALUES
  ('2c9485d2-9b17-48d4-bea7-72770c1e9eb9', '11111111-1111-4111-8111-111111111111', 'admin', 'active'),
  ('2c9485d2-9b17-48d4-bea7-72770c1e9eb9', '22222222-2222-4222-8222-222222222222', 'user', 'active'),
  ('2c9485d2-9b17-48d4-bea7-72770c1e9eb9', '33333333-3333-4333-8333-333333333333', 'user', 'active');

INSERT INTO employees (id, full_name, email, role, status) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Christian Clardy', 'christian@principleoutdoorliving.com', 'admin', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Roofing Bookkeeper', 'roofing@example.com', 'bookkeeper', 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Former Crew', 'inactive@example.com', 'field', 'inactive');

INSERT INTO company_profiles (id, name, is_active) VALUES
  ('687dd747-560c-4ce4-8d84-b181db5edbc4', 'Principle Outdoor Living', true),
  ('98e7d9f3-32e1-409c-8b2d-8b1c14b428f8', 'Principle Roofing Solutions', true),
  ('053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Archived Import', false);

INSERT INTO leads (id, company_id, full_name) VALUES
  ('aaaaaaa1-0000-4000-8000-000000000001', '687dd747-560c-4ce4-8d84-b181db5edbc4', 'Outdoor lead'),
  ('aaaaaaa1-0000-4000-8000-000000000002', '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8', 'Roofing lead'),
  ('aaaaaaa1-0000-4000-8000-000000000003', NULL, 'Untagged lead'),
  ('aaaaaaa1-0000-4000-8000-000000000004', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Archived lead');

INSERT INTO clients (id, company_id, name) VALUES
  ('bbbbbbb1-0000-4000-8000-000000000001', '687dd747-560c-4ce4-8d84-b181db5edbc4', 'Shared client');

INSERT INTO projects (id, company_id, client_id, name) VALUES
  ('ccccccc1-0000-4000-8000-000000000001', '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8', 'bbbbbbb1-0000-4000-8000-000000000001', 'Roofing job');

INSERT INTO deals (id, lead_id, title) VALUES
  ('ddddddd1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001', 'Outdoor deal'),
  ('ddddddd1-0000-4000-8000-000000000002', NULL, 'Untagged deal');

INSERT INTO materials (id, name) VALUES
  ('eeeeeee1-0000-4000-8000-000000000001', 'Pavers'),
  ('eeeeeee1-0000-4000-8000-000000000002', 'Shingles');

INSERT INTO estimates (id, company_id) VALUES
  ('ffff1111-0000-4000-8000-000000000001', '687dd747-560c-4ce4-8d84-b181db5edbc4');
INSERT INTO estimate_versions (id, linked_estimate_id) VALUES
  ('ffff2222-0000-4000-8000-000000000001', 'ffff1111-0000-4000-8000-000000000001');
INSERT INTO line_items (id, estimate_version_id) VALUES
  ('ffff3333-0000-4000-8000-000000000001', 'ffff2222-0000-4000-8000-000000000001');

\ir ../supabase/migrations/062_employee_company_access.sql

-- Seed gives every employee every active brand. Tighten the bookkeeper to
-- roofing only, which is what the owner does in Settings → Team.
DELETE FROM employee_company_assignments
WHERE employee_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  AND company_id <> '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8';

CREATE OR REPLACE FUNCTION public._expect(label text, got int, want int) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION '%: expected %, got %', label, want, got;
  END IF;
END $$;

-- Owner sees every brand, including the archived one and untagged rows.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT public._expect('owner leads', (SELECT count(*)::int FROM leads), 4);
SELECT public._expect('owner companies', (SELECT count(*)::int FROM company_profiles), 3);
SELECT public._expect('owner is_owner', (SELECT CASE WHEN public.is_owner() THEN 1 ELSE 0 END), 1);
SELECT public._expect('owner deals', (SELECT count(*)::int FROM deals), 2);
SELECT public._expect('owner line items', (SELECT count(*)::int FROM line_items), 1);
COMMIT;

-- Bookkeeper, after the owner removes Outdoor Living, sees roofing + untagged.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT public._expect('roofing leads', (SELECT count(*)::int FROM leads), 2);
SELECT public._expect('roofing sees roofing lead', (
  SELECT count(*)::int FROM leads WHERE id = 'aaaaaaa1-0000-4000-8000-000000000002'), 1);
SELECT public._expect('roofing hidden outdoor', (
  SELECT count(*)::int FROM leads WHERE id = 'aaaaaaa1-0000-4000-8000-000000000001'), 0);
SELECT public._expect('roofing companies', (SELECT count(*)::int FROM company_profiles), 1);
SELECT public._expect('roofing not owner', (SELECT CASE WHEN public.is_owner() THEN 1 ELSE 0 END), 0);
-- The outdoor client is visible because they have a roofing job.
SELECT public._expect('client via job', (
  SELECT count(*)::int FROM clients WHERE id = 'bbbbbbb1-0000-4000-8000-000000000001'), 1);
-- Outdoor deal was branded from its lead, so it is hidden. The untagged deal stays.
SELECT public._expect('roofing deals', (SELECT count(*)::int FROM deals), 1);
-- Shared price book is not brand-scoped.
SELECT public._expect('materials shared', (SELECT count(*)::int FROM materials), 2);
-- Line items follow the estimate's brand, not a company_id of their own.
SELECT public._expect('roofing line items', (SELECT count(*)::int FROM line_items), 0);
COMMIT;

-- Can't file a lead under a brand they aren't assigned to, or clear a brand
-- onto the untagged pile. Editing an untagged lead's other fields still works.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO leads (id, company_id, full_name)
    VALUES ('aaaaaaa1-0000-4000-8000-000000000099', '687dd747-560c-4ce4-8d84-b181db5edbc4', 'Nope');
    RAISE EXCEPTION 'insert of another brand should have failed';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
    IF SQLERRM = 'insert of another brand should have failed' THEN RAISE; END IF;
  END;
  UPDATE leads SET full_name = 'Still untagged' WHERE id = 'aaaaaaa1-0000-4000-8000-000000000003';
  IF NOT FOUND THEN RAISE EXCEPTION 'should be able to edit an untagged lead'; END IF;
  BEGIN
    UPDATE leads SET company_id = '687dd747-560c-4ce4-8d84-b181db5edbc4'
    WHERE id = 'aaaaaaa1-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'move to another brand should have failed';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
    IF SQLERRM = 'move to another brand should have failed' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

-- Inactive employee login is staff but their assignments don't apply.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT public._expect('inactive branded hidden', (
  SELECT count(*)::int FROM leads WHERE company_id IS NOT NULL), 0);
SELECT public._expect('inactive still sees untagged', (SELECT count(*)::int FROM leads), 1);
COMMIT;

-- A login that isn't staff (portal / stranger) sees nothing, even untagged.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT public._expect('stranger leads', (SELECT count(*)::int FROM leads), 0);
SELECT public._expect('stranger materials', (SELECT count(*)::int FROM materials), 0);
COMMIT;

-- Only the owner can change assignments. A service-style session (no user)
-- can still insert a lead for any brand: jobs and edge functions.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
DECLARE n int;
BEGIN
  DELETE FROM employee_company_assignments WHERE employee_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'non-owner deleted % assignments', n; END IF;
  BEGIN
    UPDATE organization_members SET is_owner = true
    WHERE user_id = '22222222-2222-4222-8222-222222222222';
    RAISE EXCEPTION 'non-owner should not grant owner access';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
COMMIT;

INSERT INTO leads (id, company_id, full_name)
VALUES ('aaaaaaa1-0000-4000-8000-000000000098', '687dd747-560c-4ce4-8d84-b181db5edbc4', 'Job import');

-- New team member starts on every active brand, not the archived one.
INSERT INTO employees (id, full_name, email, role, status)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'New Hire', 'new@example.com', 'sales', 'active');
SELECT public._expect('new hire brands', (
  SELECT count(*)::int FROM employee_company_assignments
  WHERE employee_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 2);

-- Owner flag landed on the owner login, and his employee row is linked
-- even though the emails differ.
SELECT public._expect('owner flag', (
  SELECT count(*)::int FROM organization_members
  WHERE user_id = '11111111-1111-4111-8111-111111111111' AND is_owner), 1);
SELECT public._expect('owner employee link', (
  SELECT count(*)::int FROM employees
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND user_id = '11111111-1111-4111-8111-111111111111'), 1);
SELECT public._expect('deal brand copied from lead', (
  SELECT count(*)::int FROM deals
  WHERE id = 'ddddddd1-0000-4000-8000-000000000001'
    AND brand_company_id = '687dd747-560c-4ce4-8d84-b181db5edbc4'), 1);

-- A non-staff login that a portal policy allows must still get through.
-- company_scope passes for anyone who is not staff; it does not replace
-- the subcontractor / PM / customer rules.
DROP POLICY staff_only ON projects;
CREATE POLICY portal_scope ON projects AS RESTRICTIVE FOR ALL TO public
  USING (id = 'ccccccc1-0000-4000-8000-000000000001')
  WITH CHECK (id = 'ccccccc1-0000-4000-8000-000000000001');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT public._expect('portal still sees its job', (SELECT count(*)::int FROM projects), 1);
COMMIT;
