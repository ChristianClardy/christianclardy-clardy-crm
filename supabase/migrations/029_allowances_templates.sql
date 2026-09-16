-- Named allowances templates — reusable sets of allowance line items
-- (e.g. "Standard Pool Allowances", "Premium Reno Allowances") that can
-- be applied to a project's Pool Selections allowances section.
--
-- items[] shape: { id text, item text, amount numeric }

CREATE TABLE IF NOT EXISTS allowances_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  items       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE allowances_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON allowances_templates
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
