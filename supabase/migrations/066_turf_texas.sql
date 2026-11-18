-- Turf'n Texas: install jobs and wholesale distribution.
--
-- NOT applied to production by this change. Do not run it until it is reviewed.
-- 065 (the fixed file on cursor/fix-org-backfill-types-f20e, PR #6) is already
-- applied. This file is 066 and uses that schema: organization_id on every
-- new table, assign_organization_id, and attach_tenant_isolation.
-- Merge order: PR #6 first, then this branch.
--
-- Every table carries organization_id, backfilled to Clardy Construction
-- (2c9485d2-9b17-48d4-bea7-72770c1e9eb9). attach_tenant_isolation at the
-- end keeps another tenant's staff out. staff_only alone is not enough
-- once 065 makes is_staff() true for every organization.
--
-- Rows are also pinned to the Turf'n Texas company
-- (053ff852-852b-4709-8b3b-3fb27c43c0ab). The price catalog and the
-- Extreme Exteriors Midland draft order are seeded. Install jobs and
-- dated deliveries are not; those examples live only in the local preview.
--
-- It does not update existing payments, leads, projects, or the archived
-- March 2026 import. It does not insert a lead or a project, so it does
-- not enroll anyone in a message drip.
--
-- Customer payments stay on the payments table (turf_order_id /
-- turf_install_job_id). A blank price stays blank. Do not guess it.

-- ── Requires migration 065 ───────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL
     OR to_regprocedure('public.attach_tenant_isolation(regclass)') IS NULL THEN
    RAISE EXCEPTION 'Apply supabase/migrations/065_multi_tenant_foundation.sql before 066_turf_texas.sql';
  END IF;
END $$;

-- ── Orders, catalog, install jobs ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS turf_settings (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  company_id       uuid PRIMARY KEY REFERENCES company_profiles(id) ON DELETE CASCADE,
  company_name     text NOT NULL DEFAULT 'Turf''N Texas',
  remit_name       text NOT NULL DEFAULT 'Christian Clardy',
  remit_address    text,
  thank_you        text,
  signature_name   text NOT NULL DEFAULT 'Christian Clardy',
  tax_rate         numeric(8,6) NOT NULL DEFAULT 0.082500,
  default_delivery numeric(12,2) NOT NULL DEFAULT 400,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turf_settings_brand CHECK (company_id = '053ff852-852b-4709-8b3b-3fb27c43c0ab')
);

CREATE TABLE IF NOT EXISTS turf_customers (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  name            text NOT NULL,
  contact_name    text,
  phone           text,
  email           text,
  bill_to_address text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turf_customers_brand CHECK (company_id = '053ff852-852b-4709-8b3b-3fb27c43c0ab')
);

CREATE TABLE IF NOT EXISTS turf_products (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category      text,
  unit          text,
  pack          text,
  supplier_name text,
  cost          numeric(12,4),
  sell_price    numeric(12,4),
  cost_unknown  boolean NOT NULL DEFAULT false,
  sell_unknown  boolean NOT NULL DEFAULT false,
  notes         text,
  sort_order    integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turf_products_brand CHECK (company_id = '053ff852-852b-4709-8b3b-3fb27c43c0ab'),
  CONSTRAINT turf_products_name UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS turf_orders (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES turf_customers(id) ON DELETE RESTRICT,
  order_number     text NOT NULL,
  status           text NOT NULL DEFAULT 'quote',
  contact_name     text,
  bill_to_name     text,
  bill_to_address  text,
  deliver_to       text,
  delivery_fee     numeric(12,2) NOT NULL DEFAULT 400,
  tax_rate         numeric(8,6) NOT NULL DEFAULT 0.082500,
  payment_method   text NOT NULL DEFAULT 'Check',
  invoice_date     date,
  schedule_date    date,
  crew             text,
  next_action      text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turf_orders_brand CHECK (company_id = '053ff852-852b-4709-8b3b-3fb27c43c0ab'),
  CONSTRAINT turf_orders_status CHECK (status IN ('quote', 'ordered', 'delivered', 'invoiced', 'paid'))
);

CREATE TABLE IF NOT EXISTS turf_order_lines (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES turf_orders(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES turf_products(id) ON DELETE SET NULL,
  description   text NOT NULL,
  detail        text,
  unit          text,
  qty           numeric(12,3) NOT NULL DEFAULT 0,
  rate          numeric(12,4),
  unit_cost     numeric(12,4),
  rate_unknown  boolean NOT NULL DEFAULT false,
  cost_unknown  boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS turf_supplier_purchases (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  order_id      uuid REFERENCES turf_orders(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  po_number     text,
  status        text NOT NULL DEFAULT 'needed',
  amount        numeric(14,2),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turf_purchases_brand CHECK (company_id = '053ff852-852b-4709-8b3b-3fb27c43c0ab'),
  CONSTRAINT turf_purchases_status CHECK (status IN ('needed', 'ordered', 'picked_up', 'paid'))
);

CREATE TABLE IF NOT EXISTS turf_install_jobs (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  lead_id                uuid REFERENCES leads(id) ON DELETE SET NULL,
  project_id             uuid REFERENCES projects(id) ON DELETE SET NULL,
  distribution_order_id  uuid REFERENCES turf_orders(id) ON DELETE SET NULL,
  name                   text NOT NULL,
  customer_name          text,
  address                text,
  stage                  text NOT NULL DEFAULT 'lead',
  crew                   text,
  scheduled_on           date,
  materials              text,
  next_action            text,
  notes                  text,
  sell_amount            numeric(14,2),
  cost_amount            numeric(14,2),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turf_jobs_brand CHECK (company_id = '053ff852-852b-4709-8b3b-3fb27c43c0ab'),
  CONSTRAINT turf_jobs_stage CHECK (stage IN ('lead', 'bid_sent', 'approved', 'scheduled', 'installed', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_turf_customers_company ON turf_customers (company_id);
CREATE INDEX IF NOT EXISTS idx_turf_products_company ON turf_products (company_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_turf_orders_company ON turf_orders (company_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_turf_orders_customer ON turf_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_turf_lines_order ON turf_order_lines (order_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_turf_purchases_company ON turf_supplier_purchases (company_id, status);
CREATE INDEX IF NOT EXISTS idx_turf_jobs_company ON turf_install_jobs (company_id, scheduled_on);
CREATE INDEX IF NOT EXISTS idx_turf_jobs_lead ON turf_install_jobs (lead_id);
CREATE INDEX IF NOT EXISTS idx_turf_jobs_project ON turf_install_jobs (project_id);

-- Payments remain the record of money collected. New nullable links only.
-- No existing payment row is updated.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS turf_order_id uuid;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS turf_install_job_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_turf_order_fk') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_turf_order_fk
      FOREIGN KEY (turf_order_id) REFERENCES turf_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_turf_install_fk') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_turf_install_fk
      FOREIGN KEY (turf_install_job_id) REFERENCES turf_install_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_turf_order ON payments (turf_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_turf_install ON payments (turf_install_job_id);

COMMENT ON COLUMN payments.turf_order_id IS
  'Turf''n Texas distribution order this customer payment applies to. Null on every other payment. Existing rows are not backfilled.';
COMMENT ON COLUMN payments.turf_install_job_id IS
  'Turf''n Texas install job this customer payment applies to. Null on every other payment. Existing rows are not backfilled.';
COMMENT ON COLUMN turf_orders.schedule_date IS
  'Delivery or pickup date. Null means the order is unscheduled.';
COMMENT ON COLUMN turf_install_jobs.scheduled_on IS
  'Install date. Null means the job is unscheduled.';
COMMENT ON COLUMN turf_products.sell_unknown IS
  'True when no sell price is on file. The app must not invent one.';
COMMENT ON COLUMN turf_products.cost_unknown IS
  'True when no supplier cost is on file. The app must not invent one.';

-- Filing a turf payment forces the payment onto Turf'n Texas.
-- Other payments (both new columns null) are left unchanged.
CREATE OR REPLACE FUNCTION public.turf_payment_brand() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  brand uuid;
  org uuid;
BEGIN
  IF NEW.turf_order_id IS NOT NULL THEN
    SELECT company_id, organization_id INTO brand, org FROM turf_orders WHERE id = NEW.turf_order_id;
    IF brand IS NULL THEN
      RAISE EXCEPTION 'That distribution order is not on file';
    END IF;
    NEW.company_id := brand;
    NEW.organization_id := org;
  ELSIF NEW.turf_install_job_id IS NOT NULL THEN
    SELECT company_id, organization_id INTO brand, org FROM turf_install_jobs WHERE id = NEW.turf_install_job_id;
    IF brand IS NULL THEN
      RAISE EXCEPTION 'That install job is not on file';
    END IF;
    NEW.company_id := brand;
    NEW.organization_id := org;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS turf_payment_brand ON payments;
CREATE TRIGGER turf_payment_brand
  BEFORE INSERT OR UPDATE OF turf_order_id, turf_install_job_id, company_id
  ON payments
  FOR EACH ROW EXECUTE FUNCTION public.turf_payment_brand();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'turf_settings', 'turf_customers', 'turf_products', 'turf_orders',
    'turf_order_lines', 'turf_supplier_purchases', 'turf_install_jobs'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END $$;

-- ── Who can see it ─────────────────────────────────────────────────────────
-- Same company-access rule as the rest of the app: staff assigned to
-- Turf'n Texas, or the owner. Portal logins are not staff and do not pass
-- staff_only. A row cannot name another company (the brand check above).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'turf_settings', 'turf_customers', 'turf_products', 'turf_orders',
    'turf_order_lines', 'turf_supplier_purchases', 'turf_install_jobs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON %I', t);
    EXECUTE format('CREATE POLICY authenticated_full_access ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
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
    'turf_settings', 'turf_customers', 'turf_products', 'turf_orders',
    'turf_supplier_purchases', 'turf_install_jobs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON %I', t);
    EXECUTE format('CREATE POLICY company_scope ON %I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)', t, policy, policy);
  END LOOP;
END $$;

DROP POLICY IF EXISTS company_scope ON turf_order_lines;
CREATE POLICY company_scope ON turf_order_lines
  AS RESTRICTIVE FOR ALL TO public
  USING (
    NOT (SELECT public.is_staff())
    OR (SELECT public.is_owner())
    OR EXISTS (
      SELECT 1 FROM turf_orders o
      WHERE o.id = turf_order_lines.order_id
        AND (SELECT public.can_access_company(o.company_id))
    )
  )
  WITH CHECK (
    NOT (SELECT public.is_staff())
    OR (SELECT public.is_owner())
    OR EXISTS (
      SELECT 1 FROM turf_orders o
      WHERE o.id = turf_order_lines.order_id
        AND (SELECT public.can_access_company(o.company_id))
    )
  );

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'guard_brand_write') THEN
    FOREACH t IN ARRAY ARRAY[
      'turf_settings', 'turf_customers', 'turf_products', 'turf_orders',
      'turf_supplier_purchases', 'turf_install_jobs'
    ]
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS zz_guard_brand ON %I', t);
      EXECUTE format('CREATE TRIGGER zz_guard_brand BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.guard_brand_write(%L)', t, 'false');
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'block_viewer_writes') THEN
    FOREACH t IN ARRAY ARRAY[
      'turf_settings', 'turf_customers', 'turf_products', 'turf_orders',
      'turf_order_lines', 'turf_supplier_purchases', 'turf_install_jobs'
    ]
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS viewer_read_only ON %I', t);
      EXECUTE format('CREATE TRIGGER viewer_read_only BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION public.block_viewer_writes()', t);
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      turf_settings, turf_customers, turf_products, turf_orders,
      turf_order_lines, turf_supplier_purchases, turf_install_jobs
      TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      turf_settings, turf_customers, turf_products, turf_orders,
      turf_order_lines, turf_supplier_purchases, turf_install_jobs
      TO service_role;
  END IF;
END $$;

-- ── Seed ───────────────────────────────────────────────────────────────────
-- Skipped when this database has no Turf'n Texas company row. Re-running
-- does not overwrite a price someone has already edited.


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM company_profiles WHERE id = '053ff852-852b-4709-8b3b-3fb27c43c0ab'
  ) THEN
    RAISE NOTICE 'Turf''n Texas company was not found. Tables exist; catalog and the Midland order were not inserted.';
    RETURN;
  END IF;

  INSERT INTO turf_settings (
    company_id, company_name, remit_name, remit_address, thank_you, signature_name, tax_rate, default_delivery
  ) VALUES (
    '053ff852-852b-4709-8b3b-3fb27c43c0ab',
    'Turf''N Texas',
    'Christian Clardy',
    E'5882 Caruth Haven Ln\nApt 1302\nDallas, TX 75206',
    'We appreciate your business. Please find your invoice details here. Feel free to contact us if you have any questions.',
    'Christian Clardy',
    0.082500,
    400
  ) ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO turf_customers (id, company_id, name, contact_name, phone, bill_to_address, notes) VALUES
    ('a5f20000-0000-4000-8000-000000000001', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Extreme Exteriors', 'Jayesh', NULL, E'5111 E Hwy 80\nMidland, TX 79705', 'Wholesale. Midland and Abilene. Pays by check.'),
    ('a5f20000-0000-4000-8000-000000000002', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Spanish Oaks Landscapes', 'Dale Garner', '(210) 383-3214', E'635 TX-46\nBoerne, TX 78006', 'Wholesale. Boerne.'),
    ('a5f20000-0000-4000-8000-000000000003', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Kingdom Driven', NULL, NULL, NULL, 'Wholesale turf customer.'),
    ('a5f20000-0000-4000-8000-000000000004', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'PoolCorp / NPT', NULL, NULL, NULL, 'National Pool Tile / PoolCorp.')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO turf_products (
    id, company_id, name, category, unit, pack, supplier_name, cost, sell_price, cost_unknown, sell_unknown, notes, sort_order
  ) VALUES
    ('a5f10000-0000-4000-8000-000000000001', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Kentucky Pro (2" pile, 80 oz face / 108 oz total, Apple/Olive)', 'Turf', 'SF', '15'' wide rolls (invoiced 15x100, 15x68, 15x82...)', 'Unconfirmed (no supplier invoice names it)', NULL, 1.86, true, false, 'CONFLICT: sold at 4 different rates ($1.79/$1.80/$1.86/$1.99). Cost not found in any email/file - spec matches Realturf Absolute/Highland 80 (2"/80oz/107oz) but name match NOT confirmed. Seeded sell is the $1.86 standard invoice rate, not the $1.79 price-sheet rate. Cost was not found.', 0),
    ('a5f10000-0000-4000-8000-000000000002', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Jade 80 (2", 80 oz / 107 oz, Chant green bi-color)', 'Turf', 'SF', NULL, 'Unconfirmed', NULL, 1.79, true, false, 'No supplier cost found.', 1),
    ('a5f10000-0000-4000-8000-000000000003', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Destin (1.25", 60/90 oz)', 'Turf', 'SF', NULL, 'Unconfirmed', NULL, 1.65, true, false, 'No supplier cost found.', 2),
    ('a5f10000-0000-4000-8000-000000000004', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Silva (1.25", 75/102 oz)', 'Turf', 'SF', NULL, 'Unconfirmed', NULL, 1.90, true, false, 'No supplier cost found.', 3),
    ('a5f10000-0000-4000-8000-000000000005', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Austin 60 (1.34", 60/87 oz)', 'Turf', 'SF', NULL, 'Unconfirmed', NULL, 1.65, true, false, 'No supplier cost found. Hunter Tatum''s 6/15/25 email calls it ''Austin 50''; PDF says Austin 60.', 4),
    ('a5f10000-0000-4000-8000-000000000006', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Viridian (1.69", 84/124 oz)', 'Turf', 'SF', NULL, 'Unconfirmed', NULL, 1.90, true, false, 'No supplier cost found.', 5),
    ('a5f10000-0000-4000-8000-000000000007', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Oasis Pro (1.75", 85/125 oz)', 'Turf', 'SF', NULL, 'Unconfirmed', NULL, 2.00, true, false, 'No supplier cost found.', 6),
    ('a5f10000-0000-4000-8000-000000000008', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Woodlands (2", 90/120 oz)', 'Turf', 'SF', NULL, 'Unconfirmed', NULL, 2.05, true, false, 'No supplier cost found.', 7),
    ('a5f10000-0000-4000-8000-000000000009', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Tour Putt - putting green (1", 50/77 oz)', 'Putting green', 'SF', '15''x100''', 'Realturf Dallas', 2.09, 2.05, false, false, 'CONFLICT: NPT sell $2.05 is BELOW Realturf 2026 list cost $2.09. SA list $2.21 = 5.4% on list cost. Realturf actually billed $1.89 on 10/14/26.', 8),
    ('a5f10000-0000-4000-8000-000000000010', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Multi-sport (1.18", 70/97 oz)', 'Sports turf', 'SF', '15''x100'' (yellow 7.5''x100'')', 'Realturf Dallas (Multisport green)', 1.45, 1.90, false, false, 'Name/spec match to Realturf Multisport (1-3/16", 70/97 oz) - confirm. Realturf yellow $2.15, colors $1.95.', 9),
    ('a5f10000-0000-4000-8000-000000000011', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Meridian', 'Turf', 'SF', NULL, 'Unknown', NULL, NULL, true, true, 'No email, price sheet, proposal or invoice mentions Meridian.', 10),
    ('a5f10000-0000-4000-8000-000000000012', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Absolute (2", 80/107 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.39, 1.51, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost. Realturf invoices confirm $1.39 (INVDL/2026/01996 8/18/26 Brownwood Lake; 02328 9/23/26 Spicewood; 02485 10/10/26).', 11),
    ('a5f10000-0000-4000-8000-000000000013', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Plush (2", 80/107 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.46, 1.31, false, false, 'CONFLICT: SA list sell $1.31 is BELOW Realturf 2026 cost $1.46 (Realturf billed $1.46 on S-DAL02661 10/14/26). Likely a typo/old cost - fix before sending.', 12),
    ('a5f10000-0000-4000-8000-000000000014', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Emerald (1-11/16", 84/111 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.29, 1.41, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost. (Emerald spec sheet was also sent to Derek Koen, Extreme Exteriors, Apr 28 2026.)', 13),
    ('a5f10000-0000-4000-8000-000000000015', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Deluxe (1-9/16", 70/97 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.54, 1.66, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 14),
    ('a5f10000-0000-4000-8000-000000000016', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'All Natural (1-9/16", 60/87 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.42, 1.54, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 15),
    ('a5f10000-0000-4000-8000-000000000017', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'All Seasons (1-9/16", 60/87 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.42, 1.54, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 16),
    ('a5f10000-0000-4000-8000-000000000018', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Evergreen (1-9/16", 60/87 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.19, 1.31, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 17),
    ('a5f10000-0000-4000-8000-000000000019', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Eco D (1-9/16", 55/82 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.09, 1.21, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 18),
    ('a5f10000-0000-4000-8000-000000000020', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Highland Light (1-5/8", 65/92 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.39, 1.51, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 19),
    ('a5f10000-0000-4000-8000-000000000021', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Texans Supreme (1-3/4", 85/112 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.44, 1.56, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 20),
    ('a5f10000-0000-4000-8000-000000000022', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Eco H (1-3/4", 90/117 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.29, 1.41, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 21),
    ('a5f10000-0000-4000-8000-000000000023', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Forte (1-1/2", 60/87 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.09, 1.21, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost. Spec mismatch: SA list shows 56/83 oz; Realturf lists Forte 60/87 oz (Elite is 56/83 oz).', 22),
    ('a5f10000-0000-4000-8000-000000000024', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Eco C (1-1/4", 75/102 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.59, 1.71, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 23),
    ('a5f10000-0000-4000-8000-000000000025', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Pet Premium (1-1/4", 60/87 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.45, 1.57, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 24),
    ('a5f10000-0000-4000-8000-000000000026', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Pet Turf (1", 60/87 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.35, 1.47, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 25),
    ('a5f10000-0000-4000-8000-000000000027', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'GOLF - Golf Putt (9/16", 46/73 oz)', 'Putting green', 'SF', '15''x100''', 'Realturf Dallas', 1.39, 1.51, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 26),
    ('a5f10000-0000-4000-8000-000000000028', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'GOLF - Natural Putt (1/2", 46/73 oz)', 'Putting green', 'SF', '15''x100''', 'Realturf Dallas', 1.79, 1.91, false, false, 'Markup is a flat +$0.12/SF over Realturf 2026 cost.', 27),
    ('a5f10000-0000-4000-8000-000000000029', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Altitude (1-3/4", 80/107 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.79, NULL, false, true, 'No Turf''N Texas sell price found.', 28),
    ('a5f10000-0000-4000-8000-000000000030', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Comfort (1-3/8", 90/117 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.89, NULL, false, true, 'No Turf''N Texas sell price found. Realturf billed $1.89 on INVDL/2026/02485 (10/10/26).', 29),
    ('a5f10000-0000-4000-8000-000000000031', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Dura Turf (1-9/16", 95/122 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.89, NULL, false, true, 'No Turf''N Texas sell price found.', 30),
    ('a5f10000-0000-4000-8000-000000000032', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Elite (1-1/2", 56/83 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.09, NULL, false, true, 'No Turf''N Texas sell price found.', 31),
    ('a5f10000-0000-4000-8000-000000000033', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Highland 80 (2", 80/107 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.69, NULL, false, true, 'No Turf''N Texas sell price found.', 32),
    ('a5f10000-0000-4000-8000-000000000034', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Basic (13/16", 18/50 oz)', 'Turf', 'SF', '13''x82''', 'Realturf Dallas', 0.59, NULL, false, true, 'No Turf''N Texas sell price found.', 33),
    ('a5f10000-0000-4000-8000-000000000035', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Moss (1-3/8", 38/65 oz)', 'Turf', 'SF', '15''x150''', 'Realturf Dallas', 0.89, NULL, false, true, 'No Turf''N Texas sell price found.', 34),
    ('a5f10000-0000-4000-8000-000000000036', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Spring (1-1/4", 35/62 oz)', 'Turf', 'SF', '15''x150''', 'Realturf Dallas', 0.79, NULL, false, true, 'No Turf''N Texas sell price found.', 35),
    ('a5f10000-0000-4000-8000-000000000037', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Nylon Turf (1-1/4", 62/89 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 3.49, NULL, false, true, 'No Turf''N Texas sell price found.', 36),
    ('a5f10000-0000-4000-8000-000000000038', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'GOLF - Golf Pro (5/8", 53/80 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.89, NULL, false, true, 'No Turf''N Texas sell price found. Realturf billed $1.89 on INVDL/2026/02485 (10/10/26).', 37),
    ('a5f10000-0000-4000-8000-000000000039', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'GOLF - Golf Nylon (1/2", 44/71 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 2.99, NULL, false, true, 'No Turf''N Texas sell price found.', 38),
    ('a5f10000-0000-4000-8000-000000000040', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Gym & Sports (black/blue) (1/2", 44/71 oz)', 'Turf', 'SF', '15''x100''', 'Realturf Dallas', 1.65, NULL, false, true, 'No Turf''N Texas sell price found.', 39),
    ('a5f10000-0000-4000-8000-000000000041', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Padel Pro Green (1/2", 44/71 oz)', 'Turf', 'SF', '10''x69''', 'Realturf Dallas', 1.65, NULL, false, true, 'No Turf''N Texas sell price found.', 40),
    ('a5f10000-0000-4000-8000-000000000042', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Padel Pro Colors', 'Turf', 'SF', '16''x47''', 'Realturf Dallas', 1.85, NULL, false, true, 'No Turf''N Texas sell price found.', 41),
    ('a5f10000-0000-4000-8000-000000000043', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Field Pro (1-3/4", 55/79 oz)', 'Turf', 'SF', '15''x235''', 'Realturf Dallas', 1.29, NULL, false, true, 'No Turf''N Texas sell price found.', 42),
    ('a5f10000-0000-4000-8000-000000000044', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Field Pro Brown/Clay (1-3/4", 55/79 oz)', 'Turf', 'SF', '15''x235''', 'Realturf Dallas', 1.43, NULL, false, true, 'No Turf''N Texas sell price found.', 43),
    ('a5f10000-0000-4000-8000-000000000045', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Xtreme 50 (2", 40/78 oz)', 'Turf', 'SF', '15''x235''', 'Realturf Dallas', 1.29, NULL, false, true, 'No Turf''N Texas sell price found.', 44),
    ('a5f10000-0000-4000-8000-000000000046', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'SportBlend PGPN (slit-film athletic)', 'Sports turf', 'SF', NULL, 'Synthetic Turf Resources (Abraham Garcia)', 1.89, NULL, false, true, 'Athletic fields. Azle fields quote 10/14/26 not priced here.', 45),
    ('a5f10000-0000-4000-8000-000000000047', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'PGPE PE Thatch - Red Clay', 'Sports turf', 'SF', '15''2" wide, ordered 180 LF', 'Synthetic Turf Resources', 1.89, NULL, false, true, NULL, 46),
    ('a5f10000-0000-4000-8000-000000000048', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Adhesive 1-Part 1.5 gal (covers ~45 LF)', 'Adhesive', 'Bucket', '1.5 gal', 'Realturf Dallas', 89.00, 89.00, false, false, '0% margin - selling at Realturf cost.', 47),
    ('a5f10000-0000-4000-8000-000000000049', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Adhesive 2-Part 1.5 gal (covers ~45 LF)', 'Adhesive', 'Bucket', '1.5 gal', 'Realturf Dallas', 59.00, 59.00, false, false, '0% margin.', 48),
    ('a5f10000-0000-4000-8000-000000000050', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Adhesive 2-Part 4 gal (covers ~120 LF)', 'Adhesive', 'Bucket', '4 gal', 'Realturf Dallas', 89.00, NULL, false, true, NULL, 49),
    ('a5f10000-0000-4000-8000-000000000051', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Turf Claw 75 adhesive 1 gal pail', 'Adhesive', 'Pail', '1 gal', 'TurfHub (Turf Claw Original 1 gal $65)', 65.00, 89.00, false, false, 'Cost is for ''Turf Claw Original'' - confirm it is the same as ''Turf Claw 75''.', 50),
    ('a5f10000-0000-4000-8000-000000000052', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Seaming tape 12" x 330 LF', 'Seam tape', 'Roll', '330 LF x 12"', 'Realturf Dallas', 119.00, 134.00, false, false, 'NPT PDF typo says ''12'' Wide''.', 51),
    ('a5f10000-0000-4000-8000-000000000053', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Seaming tape 12" x 125 LF', 'Seam tape', 'Roll', '125 LF x 12"', 'Unconfirmed', NULL, 98.75, true, false, 'Realturf sells 65''x8" $44 and 1,000''x12" $275; TurfHub 100'' $34 / 250'' $79 (2025).', 52),
    ('a5f10000-0000-4000-8000-000000000054', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Silica sand 50 lb (12/20, 16/30, 30/50)', 'Infill', 'Bag', '50 lb; 60 bags/pallet', 'Realturf Dallas', 4.50, 5.50, false, false, 'CONFLICT: NPT list shows $5.25/bag vs $5.50 invoiced. TurfHub 2025: $6.00 single / $5.25 pallet.', 53),
    ('a5f10000-0000-4000-8000-000000000055', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'T-Cool / Hydrochill 50 lb', 'Infill (cooling)', 'Bag', '50 lb; 56 bags/pallet', 'Realturf Dallas', 23.00, 19.00, false, false, 'CONFLICT: NPT sell $19 is BELOW Realturf 2026 cost $23. TurfHub 2025 T-Cool $16.50 pallet / $17.25 bag. Installed proposals use $1.70/SF (Pricing&Install 7/16/26).', 54),
    ('a5f10000-0000-4000-8000-000000000056', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Envirofill 12/20 50 lb', 'Infill', 'Bag', '50 lb; 62 bags/pallet', 'Realturf Dallas', 17.00, 16.50, false, false, 'CONFLICT: sell below 2026 cost. TurfHub 2025 $15.25 pallet / $16.25 bag.', 55),
    ('a5f10000-0000-4000-8000-000000000057', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Envirofill 16/30 50 lb', 'Infill', 'Bag', '50 lb; 62 bags/pallet', 'Realturf Dallas', 18.00, 17.50, false, false, 'CONFLICT: sell below 2026 cost.', 56),
    ('a5f10000-0000-4000-8000-000000000058', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Envirofill 30/50 50 lb', 'Infill', 'Bag', '50 lb; 62 bags/pallet', 'Realturf Dallas', 19.00, 18.50, false, false, 'CONFLICT: sell below 2026 cost. TurfHub 2025 $18.75 pallet / $19.75 bag.', 57),
    ('a5f10000-0000-4000-8000-000000000059', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Sod staples 5" (8 ga) box of 1,000', 'Fastener', 'Box', '1,000', 'Realturf Dallas', 59.00, 66.50, false, false, NULL, 58),
    ('a5f10000-0000-4000-8000-000000000060', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Nails 40D 5" / 60D 6" common, 50 lb box', 'Fastener', 'Box', '50 lb (~1,000 SF)', 'Realturf Dallas', 55.00, 74.00, false, false, NULL, 59),
    ('a5f10000-0000-4000-8000-000000000061', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Bend-a-Board edging 1x4x20''', 'Edging', 'Each', '20 ft', 'Realturf Dallas', 27.00, 33.00, false, false, 'TurfHub 2025 $24.95-$29.95.', 60),
    ('a5f10000-0000-4000-8000-000000000062', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Edging stakes 12" (box of 100)', 'Edging', 'Box', '100', 'Realturf Dallas', 89.00, 95.99, false, false, NULL, 61),
    ('a5f10000-0000-4000-8000-000000000063', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Golf cup 4" aluminum', 'Golf accessory', 'Each', NULL, 'Realturf Dallas', 20.00, 22.00, false, false, NULL, 62),
    ('a5f10000-0000-4000-8000-000000000064', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Golf cup 6" aluminum', 'Golf accessory', 'Each', NULL, 'Realturf Dallas', 25.00, 27.00, false, false, NULL, 63),
    ('a5f10000-0000-4000-8000-000000000065', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Golf cup 6" plastic', 'Golf accessory', 'Each', NULL, 'Realturf Dallas', 10.00, 12.00, false, false, NULL, 64),
    ('a5f10000-0000-4000-8000-000000000066', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Flag 6x8 (solid/checkered)', 'Golf accessory', 'Each', NULL, 'Realturf Dallas', 12.00, 11.00, false, false, 'CONFLICT: sell below 2026 cost. TurfHub 2025 solid $9.50 / checkered $14.', 65),
    ('a5f10000-0000-4000-8000-000000000067', '053ff852-852b-4709-8b3b-3fb27c43c0ab', '30" aluminum pole w/ ball retriever', 'Golf accessory', 'Each', NULL, 'Realturf Dallas', 15.00, 16.00, false, false, NULL, 66),
    ('a5f10000-0000-4000-8000-000000000068', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Cup cover', 'Golf accessory', 'Each', NULL, 'Realturf Dallas', 12.00, NULL, false, true, NULL, 67),
    ('a5f10000-0000-4000-8000-000000000069', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Brush & Go (gasoline)', 'Tool', 'Each', NULL, 'Realturf Dallas', 750.00, 850.00, false, false, NULL, 68),
    ('a5f10000-0000-4000-8000-000000000070', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'STIHL power broom', 'Tool', 'Each', NULL, 'Realturf Dallas', 999.00, 999.00, false, false, '0% margin.', 69),
    ('a5f10000-0000-4000-8000-000000000071', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Weed barrier 6''x300'' (1,800 SF)', 'Base/underlay', 'Roll', '1,800 SF', 'Realturf Dallas', 99.00, NULL, false, true, 'Woven black $109.', 70),
    ('a5f10000-0000-4000-8000-000000000072', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Air Drain panel 32"x32"x1" (~7 SF)', 'Drainage', 'Panel', '~7 SF', 'Realturf Dallas', 18.00, NULL, false, true, 'TurfHub 2025 $10.50/panel.', 71),
    ('a5f10000-0000-4000-8000-000000000073', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Play Pad 50 (2" x 39"x78", ~20.5 SF)', 'Playground pad', 'Sheet', '~20.5 SF', 'Realturf Dallas', 75.00, NULL, false, true, 'Play Pad 30 (1.25") $60. ProPlay spec sheets sent to Derek Koen May 5 2026, no price found.', 72),
    ('a5f10000-0000-4000-8000-000000000074', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'ProPlay 20mm pad (2.95x7.38, 21.77 SF)', 'Playground pad', 'Panel', '21.77 SF; 57/pallet', 'TurfHub', 32.00, NULL, false, true, '2025 price - confirm.', 73),
    ('a5f10000-0000-4000-8000-000000000075', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Foam shock pad 8mm', 'Pad', 'SF', '5''x100''', 'Realturf Dallas', 0.85, NULL, false, true, 'TurfHub 8mm perforated $0.69/SF (2025).', 74),
    ('a5f10000-0000-4000-8000-000000000076', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Rubber infill supersack', 'Infill', 'Supersack', '2,000 lb', 'Realturf Dallas', 600.00, NULL, false, true, 'TurfHub crumb rubber 2,200 lb $650 (2025).', 75),
    ('a5f10000-0000-4000-8000-000000000077', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Road base / crushed concrete', 'Base', 'Ton/Yd?', NULL, 'Clear Fork Materials', NULL, NULL, true, true, 'No unit rate in emails.', 76),
    ('a5f10000-0000-4000-8000-000000000078', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Pad', 'Pad', 'SF', NULL, NULL, NULL, NULL, true, true, 'Square-foot pad on the Midland draft. No cost or sell price on file. Do not guess.', 77),
    ('a5f10000-0000-4000-8000-000000000079', '053ff852-852b-4709-8b3b-3fb27c43c0ab', 'Adhesive 5 Gal Bucket', 'Adhesive', 'Bucket', '5 gal', NULL, NULL, NULL, true, true, '5-gal adhesive on the Midland draft. Catalog has 1.5 gal and 4 gal only. Price not guessed.', 78)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO turf_orders (
    id, company_id, customer_id, order_number, status, contact_name, bill_to_name, bill_to_address,
    delivery_fee, tax_rate, payment_method, invoice_date, schedule_date, crew, next_action, notes
  ) VALUES (
    'a5f30000-0000-4000-8000-000000000001',
    '053ff852-852b-4709-8b3b-3fb27c43c0ab',
    'a5f20000-0000-4000-8000-000000000001',
    'EE-MID-2026-11',
    'quote',
    'Jayesh',
    'Extreme Exteriors',
    E'5111 E Hwy 80\nMidland, TX 79705',
    400,
    0.082500,
    'Check',
    DATE '2026-11-17',
    NULL,
    NULL,
    'Price the pad and the 5-gal adhesive',
    'Draft invoice. Pad and 5-gal adhesive are not priced. Do not guess those rates.'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO turf_order_lines (
    id, order_id, product_id, description, detail, unit, qty, rate, unit_cost, rate_unknown, cost_unknown, sort_order
  )
  SELECT v.id, v.order_id, p.id, v.description, v.detail, v.unit, v.qty, v.rate, p.cost, v.rate_unknown, (p.cost IS NULL), v.sort_order
  FROM (VALUES
    ('a5f40000-0000-4000-8000-000000000001'::uuid, 'a5f30000-0000-4000-8000-000000000001'::uuid, 'Kentucky Pro%', 'Kentucky Pro', 'Turf, per SF', 'SF', 3000::numeric, 1.86::numeric, false, 1),
    ('a5f40000-0000-4000-8000-000000000002'::uuid, 'a5f30000-0000-4000-8000-000000000001'::uuid, 'Pad', 'Pad', 'per SF', 'SF', 2306::numeric, NULL::numeric, true, 2),
    ('a5f40000-0000-4000-8000-000000000003'::uuid, 'a5f30000-0000-4000-8000-000000000001'::uuid, 'Nails 40D%', 'Nails 40D 5"', '50 lb box', 'Box', 4::numeric, 74::numeric, false, 3),
    ('a5f40000-0000-4000-8000-000000000004'::uuid, 'a5f30000-0000-4000-8000-000000000001'::uuid, 'Seaming tape 12" x 330%', 'Seaming Tape 330''', '330 feet long (12" wide)', 'Roll', 1::numeric, 134::numeric, false, 4),
    ('a5f40000-0000-4000-8000-000000000005'::uuid, 'a5f30000-0000-4000-8000-000000000001'::uuid, 'Adhesive 5 Gal Bucket', 'Adhesive 5 Gal Bucket', NULL::text, 'Bucket', 1::numeric, NULL::numeric, true, 5),
    ('a5f40000-0000-4000-8000-000000000006'::uuid, 'a5f30000-0000-4000-8000-000000000001'::uuid, 'Silica sand 50 lb%', 'Silica Sand 16/30', 'Infill, 50 lb bags', 'Bag', 50::numeric, 5.50::numeric, false, 6)
  ) AS v(id, order_id, product_name, description, detail, unit, qty, rate, rate_unknown, sort_order)
  JOIN turf_products p ON p.company_id = '053ff852-852b-4709-8b3b-3fb27c43c0ab' AND p.name LIKE v.product_name
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO turf_supplier_purchases (
    id, company_id, order_id, supplier_name, status, amount, notes
  ) VALUES (
    'a5f50000-0000-4000-8000-000000000001',
    '053ff852-852b-4709-8b3b-3fb27c43c0ab',
    'a5f30000-0000-4000-8000-000000000001',
    'Realturf Dallas',
    'needed',
    NULL,
    'Kentucky Pro has no cost on file. Pad and 5-gal adhesive are not priced. Nails, seam tape, and silica sand have catalog costs.'
  ) ON CONFLICT (id) DO NOTHING;
END $$;


-- A line stays in the same organization as its order.
CREATE OR REPLACE FUNCTION public.turf_line_organization() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  org uuid;
BEGIN
  SELECT organization_id INTO org FROM turf_orders WHERE id = NEW.order_id;
  IF org IS NOT NULL THEN
    NEW.organization_id := org;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS turf_line_organization ON turf_order_lines;
CREATE TRIGGER turf_line_organization
  BEFORE INSERT OR UPDATE OF order_id, organization_id ON turf_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.turf_line_organization();

-- Same org stamp 065 puts on older tables, for rows inserted after 065.
DO $$
DECLARE
  t text;
BEGIN
  IF to_regprocedure('public.assign_organization_id()') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY[
      'turf_settings', 'turf_customers', 'turf_products', 'turf_orders',
      'turf_order_lines', 'turf_supplier_purchases', 'turf_install_jobs'
    ]
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS assign_organization_id ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER assign_organization_id BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.assign_organization_id()',
        t
      );
    END LOOP;
  END IF;
END $$;

-- Tenant wall. Without this, staff_only matches every tenant after 065.
SELECT public.attach_tenant_isolation('public.turf_settings');
SELECT public.attach_tenant_isolation('public.turf_customers');
SELECT public.attach_tenant_isolation('public.turf_products');
SELECT public.attach_tenant_isolation('public.turf_orders');
SELECT public.attach_tenant_isolation('public.turf_order_lines');
SELECT public.attach_tenant_isolation('public.turf_supplier_purchases');
SELECT public.attach_tenant_isolation('public.turf_install_jobs');

NOTIFY pgrst, 'reload schema';

