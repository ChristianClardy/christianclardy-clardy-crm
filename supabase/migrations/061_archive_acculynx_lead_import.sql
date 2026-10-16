-- Archives the stale lead batch bulk-imported on 2026-03-25 under the old
-- AccuLynx/"Edwards Design and Construction" organization_id. These ~198
-- leads never got a company_id, so they were hidden whenever a company was
-- picked in the sidebar switcher but flooded the New Lead column on any
-- device left on "All" (e.g. the phone).
--
-- Instead of deleting them, they move under a new inactive (archived)
-- company. The app leaves archived companies' records out of "All" and
-- lists the company under "Archived" in the switcher, so they're still
-- there when someone picks it.
--
-- Scoped tightly: only untagged "New Lead" rows from that one import day
-- under that org. Holly Chuculate (2026-05-01) and Stephen Setian
-- (2026-03-30) are not touched.
--
-- Run the SELECTs first to sanity-check, then run the rest.
-- Run this in your Supabase SQL editor.

-- ── Sanity check ───────────────────────────────────────────────────────────
-- Expect roughly 198.
SELECT count(*) AS to_archive
FROM leads
WHERE organization_id = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'
  AND company_id IS NULL
  AND status = 'New Lead'
  AND created_at >= '2026-03-25' AND created_at < '2026-03-26';

-- Same import batch sitting in other stages (NOT moved below — review).
SELECT status, count(*)
FROM leads
WHERE organization_id = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'
  AND company_id IS NULL
  AND status IS DISTINCT FROM 'New Lead'
  AND created_at >= '2026-03-25' AND created_at < '2026-03-26'
GROUP BY status;

-- ── Archived company ───────────────────────────────────────────────────────
INSERT INTO company_profiles (id, name, is_active)
VALUES ('a7c41e00-0000-4000-8000-000000000325', 'Archived – March 2026 Lead Import', false)
ON CONFLICT (id) DO NOTHING;

-- ── Move the leads ─────────────────────────────────────────────────────────
UPDATE leads
SET company_id = 'a7c41e00-0000-4000-8000-000000000325'
WHERE organization_id = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'
  AND company_id IS NULL
  AND status = 'New Lead'
  AND created_at >= '2026-03-25' AND created_at < '2026-03-26';

-- ── Added after review: archive the same batch's Lost/No Decision leads ────
-- (~247). The 22 Contract Signed/Deposit Collected leads and the 1
-- Contacted lead look like real business and stay where they are.
UPDATE leads
SET company_id = 'a7c41e00-0000-4000-8000-000000000325'
WHERE organization_id = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'
  AND company_id IS NULL
  AND status = 'Lost/No Decision'
  AND created_at >= '2026-03-25' AND created_at < '2026-03-26';
