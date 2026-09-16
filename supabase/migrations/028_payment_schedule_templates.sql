-- Named payment schedule templates — replaces the flat payment_schedule_rules
-- approach with named, reusable templates (e.g. "Pool Build", "Patio Cover").
-- Each template stores its line items as a JSONB array so the whole template
-- is one row; no child table needed.
--
-- items[] shape: { id text, title text, invoice_amount_type text,
--                  invoice_amount_value numeric, sort_order integer }
--   invoice_amount_type: 'percent_of_contract' | 'fixed' | 'remaining_balance'

CREATE TABLE IF NOT EXISTS payment_schedule_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  items       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_schedule_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON payment_schedule_templates
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
