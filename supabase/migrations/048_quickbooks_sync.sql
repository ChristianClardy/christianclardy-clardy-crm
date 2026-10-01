-- QuickBooks Online: secure connection storage + two-way sync links.
--
-- quickbooks_connection: the one connected QuickBooks company. Its tokens
-- were previously stored in company_profiles.settings, which every staff
-- login can read; this table has RLS on and NO policies, so only the server
-- (service role, api/_lib/quickbooks.js) can read or write it.
--
-- quickbooks_links: which app record is which QuickBooks record
-- (client → Customer, project → sub-customer job, invoice → Invoice,
-- payment → Payment, sub invoice → Bill, vendor name → Vendor). `origin`
-- says which side created it, so a payment entered in QuickBooks isn't
-- pushed back. Staff can read it (to show "In QuickBooks" badges); only the
-- server writes it.
--
-- quickbooks_credentials gets the webhook verifier token Intuit gives you.
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS quickbooks_connection (
  id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  realm_id           TEXT NOT NULL,
  company_name       TEXT,
  access_token       TEXT NOT NULL,
  refresh_token      TEXT NOT NULL,
  expires_at         TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  settings           JSONB NOT NULL DEFAULT '{}',
  last_sync_at       TIMESTAMPTZ,
  last_sync_result   JSONB,
  connected_by       TEXT,
  connected_at       TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE quickbooks_connection ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS quickbooks_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,          -- client | project | invoice | payment | sub_invoice | vendor
  entity_id   TEXT NOT NULL,          -- app id (uuid), or a normalized vendor name
  qb_type     TEXT NOT NULL,          -- Customer | Invoice | Payment | Bill | Vendor
  qb_id       TEXT NOT NULL,
  sync_token  TEXT,
  origin      TEXT NOT NULL DEFAULT 'app' CHECK (origin IN ('app', 'qb')),
  synced_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (entity_type, entity_id),
  UNIQUE (qb_type, qb_id)
);
CREATE INDEX IF NOT EXISTS idx_quickbooks_links_entity ON quickbooks_links(entity_type, entity_id);
ALTER TABLE quickbooks_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_read" ON quickbooks_links;
CREATE POLICY "staff_read" ON quickbooks_links FOR SELECT TO authenticated USING ((SELECT public.is_staff()));

ALTER TABLE quickbooks_credentials ADD COLUMN IF NOT EXISTS webhook_verifier TEXT;

-- Tokens never connected through the old flow, but clear any that were.
UPDATE company_profiles SET settings = settings - 'quickbooks' WHERE settings ? 'quickbooks';

NOTIFY pgrst, 'reload schema';
