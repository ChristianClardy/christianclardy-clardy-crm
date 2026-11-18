-- Company Operations, and distribution for companies other than Turf'n Texas.
--
-- NOT APPLIED. Do not run this file until the owner approves it and a
-- backup has been taken. The app treats the new columns as missing until
-- then: Operations stays off for every company except Turf'n Texas, which
-- still opens from that company in the sidebar.
--
-- Does not copy, update, or delete turf_* rows. Turf'n Texas orders,
-- products, pricing, and the Midland draft stay in the turf tables.
-- Does not insert a lead or a project, so it does not enroll a message drip.
-- Does not send email or text.

-- ── Requires migration 065 ───────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL
     OR to_regprocedure('public.attach_tenant_isolation(regclass)') IS NULL THEN
    RAISE EXCEPTION 'Apply supabase/migrations/065_multi_tenant_foundation.sql before 067_company_operations.sql';
  END IF;
  IF to_regprocedure('public.can_access_company(uuid)') IS NULL
     OR to_regprocedure('public.is_staff()') IS NULL
     OR to_regprocedure('public.is_owner()') IS NULL THEN
    RAISE EXCEPTION 'Apply supabase/migrations/062_employee_company_access.sql before 067_company_operations.sql';
  END IF;
END $$;

-- ── Per-company switches ─────────────────────────────────────────────────
-- Off by default so the Operations tab is not forced onto every company.
-- Turf'n Texas is turned on below. Its Distribution section still reads
-- turf_orders / turf_products; these flags do not move those rows.

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS operations_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS operations_distribution boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN company_profiles.operations_enabled IS
  'When true, the Operations tab shows while this company is selected in the sidebar. Default false.';
COMMENT ON COLUMN company_profiles.operations_distribution IS
  'When true, Operations includes Distribution and Products for this company. Turf''n Texas still reads turf_* for that section.';

-- ── Generic distribution. Not used by Turf'n Texas. ─────────────────────
-- The brand checks on turf_* already reject every other company. These
-- tables reject Turf'n Texas so the two books cannot be mixed.

CREATE TABLE IF NOT EXISTS distribution_settings (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  company_id       uuid PRIMARY KEY REFERENCES company_profiles(id) ON DELETE CASCADE,
  company_name     text NOT NULL DEFAULT '',
  remit_name       text NOT NULL DEFAULT '',
  remit_address    text,
  thank_you        text,
  signature_name   text NOT NULL DEFAULT '',
  tax_rate         numeric(8,6) NOT NULL DEFAULT 0.082500,
  default_delivery numeric(12,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_settings_not_turf CHECK (company_id <> '053ff852-852b-4709-8b3b-3fb27c43c0ab')
);

CREATE TABLE IF NOT EXISTS distribution_customers (
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
  CONSTRAINT distribution_customers_not_turf CHECK (company_id <> '053ff852-852b-4709-8b3b-3fb27c43c0ab')
);

CREATE TABLE IF NOT EXISTS distribution_products (
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
  CONSTRAINT distribution_products_not_turf CHECK (company_id <> '053ff852-852b-4709-8b3b-3fb27c43c0ab'),
  CONSTRAINT distribution_products_name UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS distribution_orders (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES distribution_customers(id) ON DELETE RESTRICT,
  order_number     text NOT NULL,
  status           text NOT NULL DEFAULT 'quote',
  contact_name     text,
  bill_to_name     text,
  bill_to_address  text,
  deliver_to       text,
  delivery_fee     numeric(12,2),
  tax_rate         numeric(8,6) NOT NULL DEFAULT 0.082500,
  payment_method   text NOT NULL DEFAULT 'Check',
  invoice_date     date,
  schedule_date    date,
  crew             text,
  next_action      text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_orders_not_turf CHECK (company_id <> '053ff852-852b-4709-8b3b-3fb27c43c0ab'),
  CONSTRAINT distribution_orders_status CHECK (status IN ('quote', 'ordered', 'delivered', 'invoiced', 'paid'))
);

CREATE TABLE IF NOT EXISTS distribution_order_lines (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES distribution_orders(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES distribution_products(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS distribution_supplier_purchases (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  order_id      uuid REFERENCES distribution_orders(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  po_number     text,
  status        text NOT NULL DEFAULT 'needed',
  amount        numeric(14,2),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_purchases_not_turf CHECK (company_id <> '053ff852-852b-4709-8b3b-3fb27c43c0ab'),
  CONSTRAINT distribution_purchases_status CHECK (status IN ('needed', 'ordered', 'picked_up', 'paid'))
);

-- Schedule overlay for companies that are not Turf'n Texas. Dating a lead
-- or a project files a row here and does not change the lead or project
-- status, so it cannot start a message drip.
CREATE TABLE IF NOT EXISTS operations_jobs (
  organization_id uuid NOT NULL DEFAULT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9' REFERENCES organizations(id) ON DELETE CASCADE,
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  lead_id                uuid REFERENCES leads(id) ON DELETE SET NULL,
  project_id             uuid REFERENCES projects(id) ON DELETE SET NULL,
  distribution_order_id  uuid REFERENCES distribution_orders(id) ON DELETE SET NULL,
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
  CONSTRAINT operations_jobs_not_turf CHECK (company_id <> '053ff852-852b-4709-8b3b-3fb27c43c0ab'),
  CONSTRAINT operations_jobs_stage CHECK (stage IN ('lead', 'bid_sent', 'approved', 'scheduled', 'installed', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_customers_company ON distribution_customers (company_id);
CREATE INDEX IF NOT EXISTS idx_distribution_products_company ON distribution_products (company_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_distribution_orders_company ON distribution_orders (company_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_distribution_orders_customer ON distribution_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_distribution_lines_order ON distribution_order_lines (order_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_distribution_purchases_company ON distribution_supplier_purchases (company_id, status);
CREATE INDEX IF NOT EXISTS idx_operations_jobs_company ON operations_jobs (company_id, scheduled_on);
CREATE INDEX IF NOT EXISTS idx_operations_jobs_lead ON operations_jobs (lead_id);
CREATE INDEX IF NOT EXISTS idx_operations_jobs_project ON operations_jobs (project_id);

COMMENT ON COLUMN distribution_orders.schedule_date IS
  'Delivery or pickup date. Null means the order is unscheduled.';
COMMENT ON COLUMN operations_jobs.scheduled_on IS
  'Job date. Null means the job is unscheduled. Writing this row does not change the linked lead or project.';
COMMENT ON COLUMN distribution_products.sell_unknown IS
  'True when no sell price is on file. The app must not invent one.';
COMMENT ON COLUMN distribution_products.cost_unknown IS
  'True when no supplier cost is on file. The app must not invent one.';

-- Customer payments stay on the payments table. These links are null on
-- every existing payment, including Turf'n Texas checks (those use
-- turf_order_id / turf_install_job_id). No payment row is updated here.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS distribution_order_id uuid;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS operations_job_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_distribution_order_fk') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_distribution_order_fk
      FOREIGN KEY (distribution_order_id) REFERENCES distribution_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_operations_job_fk') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_operations_job_fk
      FOREIGN KEY (operations_job_id) REFERENCES operations_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_distribution_order ON payments (distribution_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_operations_job ON payments (operations_job_id);

COMMENT ON COLUMN payments.distribution_order_id IS
  'Distribution order this customer payment applies to, for companies other than Turf''n Texas. Null on turf payments and on every payment that is not a distribution check.';
COMMENT ON COLUMN payments.operations_job_id IS
  'Operations job this customer payment applies to, for companies other than Turf''n Texas. Null on turf payments.';

-- A line stays in the same organization as its order.
CREATE OR REPLACE FUNCTION public.distribution_line_organization() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  org uuid;
BEGIN
  SELECT organization_id INTO org FROM distribution_orders WHERE id = NEW.order_id;
  IF org IS NOT NULL THEN
    NEW.organization_id := org;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS distribution_line_organization ON distribution_order_lines;
CREATE TRIGGER distribution_line_organization
  BEFORE INSERT OR UPDATE OF order_id, organization_id ON distribution_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.distribution_line_organization();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'distribution_settings', 'distribution_customers', 'distribution_products', 'distribution_orders',
    'distribution_order_lines', 'distribution_supplier_purchases', 'operations_jobs'
  ]
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
    FOREACH t IN ARRAY ARRAY[
      'distribution_settings', 'distribution_customers', 'distribution_products', 'distribution_orders',
      'distribution_order_lines', 'distribution_supplier_purchases', 'operations_jobs'
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

-- ── Who can see it ─────────────────────────────────────────────────────────
-- Same company-access rule as the rest of the app: staff assigned to that
-- company, or the owner. A row may name any company except Turf'n Texas.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'distribution_settings', 'distribution_customers', 'distribution_products', 'distribution_orders',
    'distribution_order_lines', 'distribution_supplier_purchases', 'operations_jobs'
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
    'distribution_settings', 'distribution_customers', 'distribution_products', 'distribution_orders',
    'distribution_supplier_purchases', 'operations_jobs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON %I', t);
    EXECUTE format('CREATE POLICY company_scope ON %I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)', t, policy, policy);
  END LOOP;
END $$;

DROP POLICY IF EXISTS company_scope ON distribution_order_lines;
CREATE POLICY company_scope ON distribution_order_lines
  AS RESTRICTIVE FOR ALL TO public
  USING (
    NOT (SELECT public.is_staff())
    OR (SELECT public.is_owner())
    OR EXISTS (
      SELECT 1 FROM distribution_orders o
      WHERE o.id = distribution_order_lines.order_id
        AND (SELECT public.can_access_company(o.company_id))
    )
  )
  WITH CHECK (
    NOT (SELECT public.is_staff())
    OR (SELECT public.is_owner())
    OR EXISTS (
      SELECT 1 FROM distribution_orders o
      WHERE o.id = distribution_order_lines.order_id
        AND (SELECT public.can_access_company(o.company_id))
    )
  );

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'block_viewer_writes') THEN
    FOREACH t IN ARRAY ARRAY[
      'distribution_settings', 'distribution_customers', 'distribution_products', 'distribution_orders',
      'distribution_order_lines', 'distribution_supplier_purchases', 'operations_jobs'
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
      distribution_settings, distribution_customers, distribution_products, distribution_orders,
      distribution_order_lines, distribution_supplier_purchases, operations_jobs
      TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      distribution_settings, distribution_customers, distribution_products, distribution_orders,
      distribution_order_lines, distribution_supplier_purchases, operations_jobs
      TO service_role;
  END IF;
END $$;

SELECT public.attach_tenant_isolation('public.distribution_settings');
SELECT public.attach_tenant_isolation('public.distribution_customers');
SELECT public.attach_tenant_isolation('public.distribution_products');
SELECT public.attach_tenant_isolation('public.distribution_orders');
SELECT public.attach_tenant_isolation('public.distribution_order_lines');
SELECT public.attach_tenant_isolation('public.distribution_supplier_purchases');
SELECT public.attach_tenant_isolation('public.operations_jobs');

-- Turf'n Texas already has this board. Turn the tab on for that company
-- only. No turf row is copied.
UPDATE company_profiles
SET operations_enabled = true,
    operations_distribution = true
WHERE id = '053ff852-852b-4709-8b3b-3fb27c43c0ab';

NOTIFY pgrst, 'reload schema';
