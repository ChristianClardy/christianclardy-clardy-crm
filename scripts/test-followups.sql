-- Proves 063 on top of the 062 that is on main (can_access_linked_entity(text, text),
-- attach_* helpers revoked). Throwaway database only. Not production.
--   createdb followup_test
--   psql -v ON_ERROR_STOP=1 -d followup_test -f scripts/test-followups.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'followup_test' THEN
    RAISE EXCEPTION 'Refusing to run on database %. Create a throwaway database named followup_test.', current_database();
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

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
  status text
);
CREATE TABLE IF NOT EXISTS company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  is_active boolean DEFAULT true,
  phone text,
  email text,
  website text
);
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  name text
);
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  client_id uuid,
  name text
);
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  full_name text
);
CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid
);
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid
);
CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  company_id uuid
);
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  start_datetime timestamp,
  company_id uuid
);
CREATE TABLE IF NOT EXISTS todo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  linked_client_id uuid,
  linked_project_id uuid
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  status text
);
CREATE TABLE IF NOT EXISTS message_opt_outs (
  channel text,
  address text,
  PRIMARY KEY (channel, address)
);

-- The bits of the app 062 calls. is_staff matches production: a member of the
-- staff org who is not a portal login. is_viewer is the view-only login.
CREATE OR REPLACE FUNCTION public.staff_org_id() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid $$;
CREATE OR REPLACE FUNCTION public.is_sub_user() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.is_pm_user() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.is_customer_user() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;
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
CREATE OR REPLACE FUNCTION public.is_viewer() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT auth.uid() = '33333333-3333-4333-8333-333333333333';
$$;
CREATE OR REPLACE FUNCTION public.block_viewer_writes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF public.is_viewer() THEN
    RAISE EXCEPTION 'View-only access' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_viewer_writes() TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'christianclardy7@gmail.com'),
  ('22222222-2222-4222-8222-222222222222', 'roofing@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'viewer@example.com');
INSERT INTO organization_members (organization_id, user_id, role, status) VALUES
  ('2c9485d2-9b17-48d4-bea7-72770c1e9eb9', '11111111-1111-4111-8111-111111111111', 'admin', 'active'),
  ('2c9485d2-9b17-48d4-bea7-72770c1e9eb9', '22222222-2222-4222-8222-222222222222', 'user', 'active'),
  ('2c9485d2-9b17-48d4-bea7-72770c1e9eb9', '33333333-3333-4333-8333-333333333333', 'user', 'active');
INSERT INTO employees (id, full_name, email, role, status) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Christian Clardy', 'christian@principleoutdoorliving.com', 'admin', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Roofing Bookkeeper', 'roofing@example.com', 'bookkeeper', 'active'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'View Only', 'viewer@example.com', 'office', 'active');
INSERT INTO company_profiles (id, name, is_active) VALUES
  ('687dd747-560c-4ce4-8d84-b181db5edbc4', 'Principle Outdoor Living ', true),
  ('98e7d9f3-32e1-409c-8b2d-8b1c14b428f8', 'Principle Roofing Solutions', true),
  ('a7c41e00-0000-4000-8000-000000000325', 'Archived – March 2026 Lead Import', false);

-- The file that is on main, then the follow-up migration.
\ir ../supabase/migrations/062_employee_company_access.sql
\ir ../supabase/migrations/063_followup_rules.sql

CREATE OR REPLACE FUNCTION public._expect(label text, got int, want int) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION '%: expected %, got %', label, want, got;
  END IF;
END $$;

-- Seven suggested rules for each active brand. None for the archived import.
-- Every rule is off, and each brand's master switch is off.
SELECT public._expect('outdoor rules', (
  SELECT count(*)::int FROM followup_rules WHERE company_id = '687dd747-560c-4ce4-8d84-b181db5edbc4'), 7);
SELECT public._expect('roofing rules', (
  SELECT count(*)::int FROM followup_rules WHERE company_id = '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8'), 7);
SELECT public._expect('archived rules', (
  SELECT count(*)::int FROM followup_rules WHERE company_id = 'a7c41e00-0000-4000-8000-000000000325'), 0);
SELECT public._expect('none enabled', (SELECT count(*)::int FROM followup_rules WHERE enabled), 0);
SELECT public._expect('settings off', (
  SELECT count(*)::int FROM followup_settings WHERE mode = 'off'), 2);
SELECT public._expect('no live mode', (
  SELECT count(*)::int FROM followup_settings WHERE mode <> 'off'), 0);

DO $$
BEGIN
  BEGIN
    INSERT INTO followup_rules (company_id, name, kind, lead_stage, idle_amount, idle_unit, create_todo, todo_title)
    VALUES ('a7c41e00-0000-4000-8000-000000000325', 'Nope', 'stage_idle', 'New Lead', 1, 'hours', true, 'x');
    RAISE EXCEPTION 'archived company should have been rejected';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

-- A brand added later gets the same off rules, and an archived name does not.
INSERT INTO company_profiles (id, name, is_active)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Turf''n Texas', true);
SELECT public._expect('new brand rules', (
  SELECT count(*)::int FROM followup_rules WHERE company_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND NOT enabled), 7);
INSERT INTO company_profiles (id, name, is_active)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Archived side pile', false);
SELECT public._expect('inactive brand skipped', (
  SELECT count(*)::int FROM followup_rules WHERE company_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 0);

-- Turning a rule on stamps enabled_at. Turning it off and on again refreshes it.
UPDATE followup_rules SET enabled = true
WHERE company_id = '687dd747-560c-4ce4-8d84-b181db5edbc4' AND name = 'New lead, no contact';
SELECT public._expect('enabled_at set', (
  SELECT count(*)::int FROM followup_rules
  WHERE name = 'New lead, no contact' AND company_id = '687dd747-560c-4ce4-8d84-b181db5edbc4' AND enabled_at IS NOT NULL), 1);

-- Same message cannot be claimed twice. A dry run does not use up the live key.
SELECT public._expect('first claim', (
  SELECT count(*)::int FROM public.claim_followup_dispatch(
    'live:rule:lead:1:anchor:email', '687dd747-560c-4ce4-8d84-b181db5edbc4', NULL, NULL, NULL, NULL,
    'email', 'a@example.com', 'Hi', 'Body', 'queued', NULL, true, NULL)), 1);
SELECT public._expect('second claim', (
  SELECT count(*)::int FROM public.claim_followup_dispatch(
    'live:rule:lead:1:anchor:email', '687dd747-560c-4ce4-8d84-b181db5edbc4', NULL, NULL, NULL, NULL,
    'email', 'a@example.com', 'Hi', 'Body', 'queued', NULL, true, NULL)), 0);
SELECT public._expect('dry run is separate', (
  SELECT count(*)::int FROM public.claim_followup_dispatch(
    'dry_run:rule:lead:1:anchor:email', '687dd747-560c-4ce4-8d84-b181db5edbc4', NULL, NULL, NULL, NULL,
    'email', 'a@example.com', 'Hi', 'Body', 'dry_run', 'Dry run', true, NULL)), 1);
SELECT public._expect('dry run once', (
  SELECT count(*)::int FROM public.claim_followup_dispatch(
    'dry_run:rule:lead:1:anchor:email', '687dd747-560c-4ce4-8d84-b181db5edbc4', NULL, NULL, NULL, NULL,
    'email', 'a@example.com', 'Hi', 'Body', 'dry_run', 'Dry run', true, NULL)), 0);

-- An expired quiet-hours hold is skipped instead of sending the next morning.
INSERT INTO followup_log (dedupe_key, company_id, channel, status, expires_at)
VALUES ('live:old', '687dd747-560c-4ce4-8d84-b181db5edbc4', 'sms', 'queued', now() - interval '1 hour');
SELECT public.expire_followup_dispatches();
SELECT public._expect('expired hold skipped', (
  SELECT count(*)::int FROM followup_log WHERE dedupe_key = 'live:old' AND status = 'skipped'), 1);

-- Live 062: linked-entity check is (text, text), and the attach helpers are
-- not granted to staff. 063 still installed its rules without calling them.
SELECT public._expect('linked entity is (text, text)', (
  SELECT count(*)::int FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'can_access_linked_entity'
    AND pg_get_function_identity_arguments(p.oid) = 'p_type text, p_id text'), 1);
SELECT public._expect('attach helper not granted to staff', (
  SELECT count(*)::int FROM information_schema.routine_privileges
  WHERE routine_schema = 'public' AND routine_name = 'attach_company_scope' AND grantee = 'authenticated'), 0);

-- 062 assigns every employee to every active brand. Leave roofing on roofing only.
DELETE FROM employee_company_assignments
WHERE employee_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  AND company_id <> '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT public._expect('owner rules', (SELECT count(*)::int FROM followup_rules), 21);
SELECT public._expect('owner settings', (SELECT count(*)::int FROM followup_settings), 3);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT public._expect('roofing rules only', (SELECT count(*)::int FROM followup_rules), 7);
SELECT public._expect('roofing cannot see outdoor', (
  SELECT count(*)::int FROM followup_rules WHERE company_id = '687dd747-560c-4ce4-8d84-b181db5edbc4'), 0);
SELECT public._expect('roofing log hidden', (
  SELECT count(*)::int FROM followup_log WHERE company_id = '687dd747-560c-4ce4-8d84-b181db5edbc4'), 0);
DO $$
BEGIN
  UPDATE followup_rules SET name = 'Stolen'
  WHERE company_id = '687dd747-560c-4ce4-8d84-b181db5edbc4';
  IF FOUND THEN RAISE EXCEPTION 'roofing updated an outdoor rule'; END IF;
  BEGIN
    INSERT INTO followup_rules (company_id, name, kind, lead_stage, idle_amount, idle_unit, create_todo, todo_title)
    VALUES ('687dd747-560c-4ce4-8d84-b181db5edbc4', 'Not mine', 'stage_idle', 'New Lead', 1, 'hours', true, 'x');
    RAISE EXCEPTION 'roofing insert should have failed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
DO $$
BEGIN
  UPDATE followup_settings SET mode = 'live' WHERE company_id = '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8';
  RAISE EXCEPTION 'viewer write should have failed';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
COMMIT;

SELECT public._expect('viewer did not go live', (
  SELECT count(*)::int FROM followup_settings WHERE company_id = '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8' AND mode = 'off'), 1);

-- The owner can still save a rule. Trigger functions have to be executable
-- by the person writing the row, or the save fails closed.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
INSERT INTO followup_rules (company_id, name, kind, lead_stage, idle_amount, idle_unit, create_todo, todo_title)
VALUES ('98e7d9f3-32e1-409c-8b2d-8b1c14b428f8', 'Owner added', 'stage_idle', 'New Lead', 6, 'hours', true, 'Call {{full_name}}');
COMMIT;
SELECT public._expect('owner can add a rule', (
  SELECT count(*)::int FROM followup_rules WHERE name = 'Owner added'), 1);
