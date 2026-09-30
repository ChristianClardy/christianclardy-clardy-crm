-- Change orders you can send for signature from a project's Change Orders tab.
--
-- change_orders already exists (001). This adds:
--   number         CO-1, CO-2… per project, set by the app when created
--   schedule_days  workdays the change adds to the schedule (0 = none)
--   signed_at / signed_document_url
--                  set automatically when the DocuSign envelope for the
--                  change order is fully signed (api/_lib/docusign.js), which
--                  also marks the change order approved
-- Run this in your Supabase SQL editor.

ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS number              INTEGER;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS schedule_days       INTEGER DEFAULT 0;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS signed_at           TIMESTAMPTZ;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS signed_document_url TEXT;

CREATE INDEX IF NOT EXISTS idx_change_orders_project_id ON change_orders(project_id);

NOTIFY pgrst, 'reload schema';
