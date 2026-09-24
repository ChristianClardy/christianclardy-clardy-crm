-- Auto-saved signed contracts: once a DocuSign envelope is completed, the
-- fully signed PDF (plus certificate of completion) is stored and linked here
-- and filed as a "contract" attachment on the lead/deal/estimate/project and
-- client it was sent for (api/_lib/docusign.js).
-- Run this in your Supabase SQL editor or via `supabase db push`

ALTER TABLE docusign_envelopes ADD COLUMN IF NOT EXISTS signed_document_url TEXT;
ALTER TABLE docusign_envelopes ADD COLUMN IF NOT EXISTS signed_saved_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
