-- Per-company Stripe Invoicing (test mode only).
--
-- NOT APPLIED. Do not run this file until the owner approves it and a
-- backup has been taken. The app treats the tables as missing until then:
-- Connect, draft invoices, and the invoicing webhook no-op or explain that
-- this file has not been applied. Nothing here sends email or text.
--
-- Choice: Stripe Connect Standard (OAuth). Each company connects its own
-- Stripe account (Turf'n Texas is separate from the Clardy.io SaaS account).
-- The platform secret key stays in the server environment. API calls send
-- Stripe-Account: acct_... . This table stores the account id only.
-- OAuth access tokens and restricted secret keys are not stored.
--
-- Tax is a manual Stripe tax rate (default 8.25% of the subtotal, and the
-- subtotal includes shipping). automatic_tax is not used.
--
-- Invoices are created as drafts (auto_advance false, collection_method
-- send_invoice). Staff review them in Clardy, then Finalize & Send.
-- public.payments remains the record of money received. Stripe ids on a
-- payment are identifiers, not secrets.
--
-- Requires 065 (organizations, attach_tenant_isolation, is_staff).
-- 066 and 067 may still be unapplied: links to turf_* and distribution_*
-- are plain uuid columns, and the foreign key is added only when that
-- table already exists.
--
-- ROLLBACK (run by hand only to undo this file; do not append it to apply):
--   DROP TABLE IF EXISTS public.stripe_webhook_events;
--   DROP TABLE IF EXISTS public.stripe_customers;
--   DROP TABLE IF EXISTS public.stripe_invoices;
--   DROP TABLE IF EXISTS public.company_stripe_connections;
--   ALTER TABLE public.payments
--     DROP COLUMN IF EXISTS stripe_object_id,
--     DROP COLUMN IF EXISTS stripe_invoice_id,
--     DROP COLUMN IF EXISTS stripe_charge_id,
--     DROP COLUMN IF EXISTS stripe_payment_intent_id,
--     DROP COLUMN IF EXISTS stripe_account_id,
--     DROP COLUMN IF EXISTS stripe_event_id,
--     DROP COLUMN IF EXISTS stripe_customer_id;
--   ALTER TABLE public.invoices
--     DROP COLUMN IF EXISTS stripe_invoice_id,
--     DROP COLUMN IF EXISTS stripe_hosted_invoice_url,
--     DROP COLUMN IF EXISTS stripe_status,
--     DROP COLUMN IF EXISTS stripe_kind,
--     DROP COLUMN IF EXISTS stripe_account_id,
--     DROP COLUMN IF EXISTS stripe_subtotal,
--     DROP COLUMN IF EXISTS stripe_shipping,
--     DROP COLUMN IF EXISTS stripe_tax,
--     DROP COLUMN IF EXISTS turf_order_id,
--     DROP COLUMN IF EXISTS distribution_order_id;

-- ── Requires migration 065 ───────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL
     OR to_regprocedure('public.attach_tenant_isolation(regclass)') IS NULL THEN
    RAISE EXCEPTION 'Apply supabase/migrations/065_multi_tenant_foundation.sql before 068_company_stripe_invoicing.sql';
  END IF;
  IF to_regprocedure('public.can_access_company(uuid)') IS NULL
     OR to_regprocedure('public.is_staff()') IS NULL
     OR to_regprocedure('public.is_owner()') IS NULL THEN
    RAISE EXCEPTION 'Apply supabase/migrations/062_employee_company_access.sql before 068_company_stripe_invoicing.sql';
  END IF;
END $$;

-- ── One Connect account per company. No secret columns. ─────────────────

CREATE TABLE IF NOT EXISTS company_stripe_connections (
  organization_id   uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  company_id        uuid PRIMARY KEY REFERENCES company_profiles(id) ON DELETE CASCADE,
  stripe_account_id text,
  status            text NOT NULL DEFAULT 'disconnected',
  livemode          boolean NOT NULL DEFAULT false,
  charges_enabled   boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  tax_rate          numeric(8,6) NOT NULL DEFAULT 0.082500,
  stripe_tax_rate_id text,
  days_until_due    integer NOT NULL DEFAULT 14,
  connected_at      timestamptz,
  disconnected_at   timestamptz,
  connected_by      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_stripe_status CHECK (status IN ('disconnected', 'pending', 'connected')),
  CONSTRAINT company_stripe_test_mode CHECK (livemode = false),
  CONSTRAINT company_stripe_tax_rate CHECK (tax_rate >= 0 AND tax_rate < 1),
  CONSTRAINT company_stripe_days CHECK (days_until_due >= 1 AND days_until_due <= 365)
);

COMMENT ON TABLE company_stripe_connections IS
  'Stripe Connect Standard account for one company. stripe_account_id is acct_... and is not a secret. OAuth tokens and API keys are not stored.';
COMMENT ON COLUMN company_stripe_connections.tax_rate IS
  'Decimal rate applied to the taxable subtotal. 0.082500 is 8.25%. Shipping is part of that subtotal. Not Stripe Tax automatic_tax.';
COMMENT ON COLUMN company_stripe_connections.stripe_tax_rate_id IS
  'Stripe tax rate id (txr_...) on the connected account. Not a secret.';

CREATE UNIQUE INDEX IF NOT EXISTS company_stripe_account_uid
  ON company_stripe_connections (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL AND status = 'connected';

-- ── Stripe Customer per company + client (or turf/distribution customer). ─

CREATE TABLE IF NOT EXISTS stripe_customers (
  organization_id          uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  source_key               text NOT NULL,
  client_id                uuid REFERENCES clients(id) ON DELETE SET NULL,
  turf_customer_id         uuid,
  distribution_customer_id uuid,
  stripe_customer_id       text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_customers_source UNIQUE (company_id, source_key)
);

COMMENT ON TABLE stripe_customers IS
  'Maps a Clardy client (or turf/distribution customer) to a Stripe Customer on that company''s connected account. The customer id is not a secret.';

CREATE UNIQUE INDEX IF NOT EXISTS stripe_customers_client_uid
  ON stripe_customers (company_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stripe_customers_stripe_uid
  ON stripe_customers (company_id, stripe_customer_id);

-- ── Draft and sent Stripe invoices. ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS stripe_invoices (
  organization_id       uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  kind                  text NOT NULL,
  source_key            text NOT NULL,
  invoice_id            uuid REFERENCES invoices(id) ON DELETE SET NULL,
  project_id            uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_id             uuid REFERENCES clients(id) ON DELETE SET NULL,
  turf_install_job_id   uuid,
  operations_job_id     uuid,
  turf_order_id         uuid,
  distribution_order_id uuid,
  stripe_invoice_id     text,
  stripe_customer_id    text,
  stripe_account_id     text,
  hosted_invoice_url    text,
  status                text NOT NULL DEFAULT 'draft',
  subtotal              numeric(14,2) NOT NULL DEFAULT 0,
  shipping              numeric(14,2) NOT NULL DEFAULT 0,
  tax                   numeric(14,2) NOT NULL DEFAULT 0,
  total                 numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate              numeric(8,6) NOT NULL DEFAULT 0.082500,
  days_until_due        integer NOT NULL DEFAULT 14,
  idempotency_key       text NOT NULL,
  finalized_at          timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_invoices_kind CHECK (kind IN ('deposit', 'final', 'distribution')),
  CONSTRAINT stripe_invoices_status CHECK (status IN ('draft', 'open', 'paid', 'payment_failed', 'void', 'uncollectible')),
  CONSTRAINT stripe_invoices_source UNIQUE (company_id, kind, source_key)
);

COMMENT ON TABLE stripe_invoices IS
  'Stripe invoice for a deposit, final balance, or distribution/turf order. Created as a draft. Finalize & Send is a separate staff action. hosted_invoice_url is the customer Pay now page.';

CREATE UNIQUE INDEX IF NOT EXISTS stripe_invoices_stripe_uid
  ON stripe_invoices (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stripe_invoices_company ON stripe_invoices (company_id, created_at DESC);

-- ── Webhook idempotency. Event id only; the payload is not stored. ──────

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  organization_id   uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  event_id          text PRIMARY KEY,
  company_id        uuid REFERENCES company_profiles(id) ON DELETE SET NULL,
  stripe_account_id text,
  event_type        text NOT NULL,
  processed_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE stripe_webhook_events IS
  'Stripe event ids already applied to payments. Storing the id makes retries a no-op. The body is not stored.';

CREATE INDEX IF NOT EXISTS stripe_webhook_events_company ON stripe_webhook_events (company_id, processed_at DESC);

-- ── Payments stay the record of money. Stripe columns are ids. ──────────

ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_object_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_invoice_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_charge_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_account_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_event_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_object_uid
  ON payments (stripe_object_id) WHERE stripe_object_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_stripe_invoice ON payments (stripe_invoice_id);

COMMENT ON COLUMN payments.stripe_object_id IS
  'Stripe id this row represents (in_, ccsbtxn_, or refund:ch_). Unique so a retried webhook updates the same payment. Not a secret.';

-- ── Clardy invoice row staff already review on Payments. ────────────────

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_hosted_invoice_url text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_status text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_kind text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_account_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_subtotal numeric(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_shipping numeric(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_tax numeric(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS turf_order_id uuid;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS distribution_order_id uuid;

CREATE INDEX IF NOT EXISTS invoices_stripe_invoice ON invoices (stripe_invoice_id);

COMMENT ON COLUMN invoices.stripe_hosted_invoice_url IS
  'Stripe hosted invoice (Pay now) when this company''s Stripe account is connected. QuickBooks pay links stay in qb_payment_link for companies that are not connected.';

-- Optional foreign keys. Skipped when 066 or 067 has not been applied.

DO $$
BEGIN
  IF to_regclass('public.turf_customers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_customers_turf_customer_fk') THEN
    ALTER TABLE stripe_customers
      ADD CONSTRAINT stripe_customers_turf_customer_fk
      FOREIGN KEY (turf_customer_id) REFERENCES turf_customers(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.distribution_customers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_customers_distribution_customer_fk') THEN
    ALTER TABLE stripe_customers
      ADD CONSTRAINT stripe_customers_distribution_customer_fk
      FOREIGN KEY (distribution_customer_id) REFERENCES distribution_customers(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.turf_install_jobs') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_invoices_turf_job_fk') THEN
    ALTER TABLE stripe_invoices
      ADD CONSTRAINT stripe_invoices_turf_job_fk
      FOREIGN KEY (turf_install_job_id) REFERENCES turf_install_jobs(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.operations_jobs') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_invoices_operations_job_fk') THEN
    ALTER TABLE stripe_invoices
      ADD CONSTRAINT stripe_invoices_operations_job_fk
      FOREIGN KEY (operations_job_id) REFERENCES operations_jobs(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.turf_orders') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_invoices_turf_order_fk') THEN
    ALTER TABLE stripe_invoices
      ADD CONSTRAINT stripe_invoices_turf_order_fk
      FOREIGN KEY (turf_order_id) REFERENCES turf_orders(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.distribution_orders') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_invoices_distribution_order_fk') THEN
    ALTER TABLE stripe_invoices
      ADD CONSTRAINT stripe_invoices_distribution_order_fk
      FOREIGN KEY (distribution_order_id) REFERENCES distribution_orders(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.turf_orders') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_turf_order_fk') THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_turf_order_fk
      FOREIGN KEY (turf_order_id) REFERENCES turf_orders(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.distribution_orders') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_distribution_order_fk') THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_distribution_order_fk
      FOREIGN KEY (distribution_order_id) REFERENCES distribution_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_stripe_connections', 'stripe_customers', 'stripe_invoices']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  IF to_regprocedure('public.assign_organization_id()') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['company_stripe_connections', 'stripe_customers', 'stripe_invoices', 'stripe_webhook_events']
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS assign_organization_id ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER assign_organization_id BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.assign_organization_id()',
        t
      );
    END LOOP;
  END IF;
END $$;

-- ── Who can see it ─────────────────────────────────────────────────────────
-- Staff assigned to the company, or the owner, can read. The browser cannot
-- insert or update these rows: Connect, drafts, and webhooks use the service
-- role after a staff check (webhooks after the Stripe signature check).
-- A forged stripe_account_id from the client is rejected by the lack of a
-- write policy.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_stripe_connections', 'stripe_customers', 'stripe_invoices', 'stripe_webhook_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS stripe_select ON %I', t);
    EXECUTE format('CREATE POLICY stripe_select ON %I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_only ON %I', t);
    EXECUTE format($p$CREATE POLICY staff_only ON %I AS RESTRICTIVE FOR ALL TO public USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()))$p$, t);
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
  policy text := $policy$
    NOT (SELECT public.is_staff())
    OR (SELECT public.is_owner())
    OR (SELECT public.can_access_company(company_id))
  $policy$;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_stripe_connections', 'stripe_customers', 'stripe_invoices', 'stripe_webhook_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON %I', t);
    EXECUTE format(
      'CREATE POLICY company_scope ON %I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)',
      t, policy, policy
    );
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'block_viewer_writes') THEN
    FOREACH t IN ARRAY ARRAY[
      'company_stripe_connections', 'stripe_customers', 'stripe_invoices', 'stripe_webhook_events'
    ]
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS viewer_read_only ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes()',
        t
      );
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON
      company_stripe_connections, stripe_customers, stripe_invoices, stripe_webhook_events
      TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      company_stripe_connections, stripe_customers, stripe_invoices, stripe_webhook_events
      TO service_role;
  END IF;
END $$;

SELECT public.attach_tenant_isolation('public.company_stripe_connections');
SELECT public.attach_tenant_isolation('public.stripe_customers');
SELECT public.attach_tenant_isolation('public.stripe_invoices');
SELECT public.attach_tenant_isolation('public.stripe_webhook_events');

NOTIFY pgrst, 'reload schema';
