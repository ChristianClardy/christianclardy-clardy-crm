-- Subcontractor compliance + pay details for Settings → Team & Subcontractors.
--
-- The existing insurance_exp column is treated as general liability; workers'
-- comp and license expirations are tracked separately. coi_url is the
-- uploaded certificate of insurance. W-9s are only flagged as received, never
-- uploaded: they carry SSN/EIN and the Attachements bucket is public.
--
-- Note: a subcontractor's portal login can read its own row (portal_scope in
-- 034_subcontractor_portal.sql), so nothing here should be staff-secret.

ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS license_exp      DATE;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS workers_comp_exp DATE;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS coi_url          TEXT;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_on_file       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS hourly_rate      NUMERIC(10,2);
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS payment_terms    TEXT;

-- Trade values are keys ("other"), one legacy row was saved as "Other".
UPDATE subcontractors SET trade = lower(trade) WHERE trade <> lower(trade);

NOTIFY pgrst, 'reload schema';
