-- Proves 063_followup_rules.sql on a throwaway database. Not production.
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

CREATE TABLE IF NOT EXISTS company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  is_active boolean DEFAULT true,
  phone text,
  email text,
  website text
);
CREATE TABLE IF NOT EXISTS clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
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
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  start_datetime timestamp,
  company_id uuid
);
CREATE TABLE IF NOT EXISTS todo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text
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

CREATE TABLE IF NOT EXISTS test_access (
  user_id uuid PRIMARY KEY,
  is_staff boolean NOT NULL DEFAULT false,
  is_owner boolean NOT NULL DEFAULT false,
  is_viewer boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS user_company_access (
  user_id uuid,
  company_id uuid,
  PRIMARY KEY (user_id, company_id)
);

CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_staff FROM test_access WHERE user_id = auth.uid()), false);
$$;
CREATE OR REPLACE FUNCTION public.is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_owner FROM test_access WHERE user_id = auth.uid()), false);
$$;
CREATE OR REPLACE FUNCTION public.is_viewer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_viewer FROM test_access WHERE user_id = auth.uid()), false);
$$;
CREATE OR REPLACE FUNCTION public.can_access_company(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner() OR EXISTS (
    SELECT 1 FROM user_company_access WHERE user_id = auth.uid() AND company_id = p_company
  );
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

CREATE OR REPLACE FUNCTION public.guard_brand_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() OR public.is_owner() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL OR NOT public.can_access_company(NEW.company_id) THEN
    RAISE EXCEPTION 'You are not assigned to that company' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.attach_company_scope(p_table text, p_using text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS company_scope ON public.%I', p_table);
  EXECUTE format(
    'CREATE POLICY company_scope ON public.%I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)',
    p_table, p_using, p_using
  );
END $$;
CREATE OR REPLACE FUNCTION public.attach_brand_guard(p_table text, p_shared_null boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS zz_guard_brand ON public.%I', p_table);
  EXECUTE format(
    'CREATE TRIGGER zz_guard_brand BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_brand_write(%L)',
    p_table, CASE WHEN p_shared_null THEN 'true' ELSE 'false' END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_company(uuid) TO authenticated;

INSERT INTO company_profiles (id, name, is_active) VALUES
  ('687dd747-560c-4ce4-8d84-b181db5edbc4', 'Principle Outdoor Living ', true),
  ('98e7d9f3-32e1-409c-8b2d-8b1c14b428f8', 'Principle Roofing Solutions', true),
  ('a7c41e00-0000-4000-8000-000000000325', 'Archived – March 2026 Lead Import', false);

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

-- Company access: the owner sees every brand. Roofing does not see outdoor rules.
INSERT INTO test_access (user_id, is_staff, is_owner) VALUES
  ('11111111-1111-4111-8111-111111111111', true, true),
  ('22222222-2222-4222-8222-222222222222', true, false),
  ('33333333-3333-4333-8333-333333333333', true, false);
INSERT INTO user_company_access (user_id, company_id)
VALUES ('22222222-2222-4222-8222-222222222222', '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8');
UPDATE test_access SET is_viewer = true WHERE user_id = '33333333-3333-4333-8333-333333333333';
INSERT INTO user_company_access (user_id, company_id)
VALUES ('33333333-3333-4333-8333-333333333333', '98e7d9f3-32e1-409c-8b2d-8b1c14b428f8');

GRANT SELECT ON test_access, user_company_access TO authenticated;

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
