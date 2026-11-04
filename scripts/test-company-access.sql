-- Behavioral checks for 062_employee_company_access.sql.
-- Run with scripts/test-company-access.sh, which first builds a database
-- from the production public-schema snapshot (column types and RLS policies).
-- Not run against production.

\set ON_ERROR_STOP on

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

-- deals has no authenticated_full_access policy in production: visibility also
-- requires organization_id = get_my_org_id().
INSERT INTO deals (id, lead_id, title, organization_id) VALUES
  ('ddddddd1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001', 'Outdoor deal', '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'),
  ('ddddddd1-0000-4000-8000-000000000002', NULL, 'Untagged deal', '2c9485d2-9b17-48d4-bea7-72770c1e9eb9');

INSERT INTO materials (id, name) VALUES
  ('eeeeeee1-0000-4000-8000-000000000001', 'Pavers'),
  ('eeeeeee1-0000-4000-8000-000000000002', 'Shingles');

INSERT INTO estimates (id, company_id, title) VALUES
  ('ffff1111-0000-4000-8000-000000000001', '687dd747-560c-4ce4-8d84-b181db5edbc4', 'Outdoor estimate');
INSERT INTO estimate_versions (id, linked_estimate_id) VALUES
  ('ffff2222-0000-4000-8000-000000000001', 'ffff1111-0000-4000-8000-000000000001');
INSERT INTO line_items (id, estimate_version_id, item_name) VALUES
  ('ffff3333-0000-4000-8000-000000000001', 'ffff2222-0000-4000-8000-000000000001', 'Pavers');

-- comments.entity_id is uuid. docusign_envelopes.entity_id is text. Both must
-- get a company_scope policy from the same migration.
INSERT INTO comments (id, entity_type, entity_id, content) VALUES
  ('c0c0c0c0-0000-4000-8000-000000000001', 'lead', 'aaaaaaa1-0000-4000-8000-000000000001', 'Outdoor note');

INSERT INTO docusign_envelopes (id, envelope_id, entity_type, entity_id, organization_id) VALUES
  ('d0d0d0d0-0000-4000-8000-000000000001', 'env-outdoor', 'lead', 'aaaaaaa1-0000-4000-8000-000000000001', '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'),
  ('d0d0d0d0-0000-4000-8000-000000000002', 'env-roof', 'lead', 'aaaaaaa1-0000-4000-8000-000000000002', '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'),
  ('d0d0d0d0-0000-4000-8000-000000000003', 'env-legacy', 'lead', 'not-a-uuid', '2c9485d2-9b17-48d4-bea7-72770c1e9eb9');

-- Apply as one transaction, then again, to prove a re-run does not error
-- and does not duplicate the seed.
BEGIN;
\ir ../supabase/migrations/062_employee_company_access.sql
COMMIT;

BEGIN;
\ir ../supabase/migrations/062_employee_company_access.sql
COMMIT;

SELECT CASE WHEN count(*) = 6 THEN 1 ELSE 1 / (count(*) - count(*)) END AS seed_assignments_once
FROM employee_company_assignments;

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
SELECT public._expect('owner comments', (SELECT count(*)::int FROM comments), 1);
SELECT public._expect('owner envelopes', (SELECT count(*)::int FROM docusign_envelopes), 3);
COMMIT;

-- Bookkeeper, after the owner removes Outdoor Living.
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
SELECT public._expect('client via job', (
  SELECT count(*)::int FROM clients WHERE id = 'bbbbbbb1-0000-4000-8000-000000000001'), 1);
SELECT public._expect('roofing deals', (SELECT count(*)::int FROM deals), 1);
SELECT public._expect('materials shared', (SELECT count(*)::int FROM materials), 2);
SELECT public._expect('roofing line items', (SELECT count(*)::int FROM line_items), 0);
SELECT public._expect('roofing hidden comment', (SELECT count(*)::int FROM comments), 0);
SELECT public._expect('roofing envelopes', (SELECT count(*)::int FROM docusign_envelopes), 2);
SELECT public._expect('roofing sees roof envelope', (
  SELECT count(*)::int FROM docusign_envelopes WHERE id = 'd0d0d0d0-0000-4000-8000-000000000002'), 1);
SELECT public._expect('roofing hidden outdoor envelope', (
  SELECT count(*)::int FROM docusign_envelopes WHERE id = 'd0d0d0d0-0000-4000-8000-000000000001'), 0);
COMMIT;

-- Can't file a lead under a brand they aren't assigned to.
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

-- A login that isn't staff sees nothing, even untagged.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT public._expect('stranger leads', (SELECT count(*)::int FROM leads), 0);
SELECT public._expect('stranger materials', (SELECT count(*)::int FROM materials), 0);
COMMIT;

-- Only the owner can change assignments.
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

-- A session with no user (service role shape) can still insert any brand.
INSERT INTO leads (id, company_id, full_name)
VALUES ('aaaaaaa1-0000-4000-8000-000000000098', '687dd747-560c-4ce4-8d84-b181db5edbc4', 'Job import');

-- New team member starts on every active brand, not the archived one.
INSERT INTO employees (id, full_name, email, role, status)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'New Hire', 'new@example.com', 'sales', 'active');
SELECT public._expect('new hire brands', (
  SELECT count(*)::int FROM employee_company_assignments
  WHERE employee_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 2);

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
DROP POLICY staff_only ON projects;
CREATE POLICY portal_scope ON projects AS RESTRICTIVE FOR ALL TO public
  USING (id = 'ccccccc1-0000-4000-8000-000000000001')
  WITH CHECK (id = 'ccccccc1-0000-4000-8000-000000000001');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT public._expect('portal still sees its job', (SELECT count(*)::int FROM projects), 1);
COMMIT;
