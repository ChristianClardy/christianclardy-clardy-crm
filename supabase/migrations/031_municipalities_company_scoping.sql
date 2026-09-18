-- Municipalities previously stayed global (see 010_company_scoping.sql) on
-- the assumption it was shared reference data. In practice the login
-- portal/credentials per city differ by company, and the existing rows were
-- leftover cruft from the old "Edwards Design and Construction" setup that
-- should have been wiped along with that bogus client. Wipe them and scope
-- the table going forward so each company builds its own list.
-- Run this in your Supabase SQL editor or via `supabase db push`

DELETE FROM municipalities;

ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_municipalities_company_id ON municipalities(company_id);
