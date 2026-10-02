-- Record of personal-data deletion requests carried out from the app
-- (Client Detail → Delete personal data, Subcontractors → Delete personal
-- data). Proof that a request was handled, what was erased and what was kept
-- for legal / tax reasons. Written by the server only (api/_lib/privacy.js);
-- staff can read it.
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS data_erasure_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL,        -- client | subcontractor
  entity_id    UUID NOT NULL,
  label        TEXT,                 -- the placeholder name left behind
  requested_by TEXT,                 -- staff email who ran it
  reason       TEXT,
  summary      JSONB NOT NULL DEFAULT '{}',
  erased_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE data_erasure_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_read" ON data_erasure_log;
CREATE POLICY "staff_read" ON data_erasure_log FOR SELECT TO authenticated USING ((SELECT public.is_staff()));

NOTIFY pgrst, 'reload schema';
