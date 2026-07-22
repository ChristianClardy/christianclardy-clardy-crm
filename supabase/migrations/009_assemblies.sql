-- Migration 009: Takeoff assemblies (formula-driven line-item generation)
-- One assembly = a reusable recipe of material/labor/subcontract components,
-- each with a quantity-per-unit-of-output. Applying an assembly to an
-- estimate with a target quantity generates the scaled line items.
-- Run this in your Supabase SQL editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS assemblies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  output_unit  TEXT DEFAULT 'SF',
  cost_code_id UUID REFERENCES cost_codes(id),
  components   JSONB DEFAULT '[]',
  is_active    BOOLEAN DEFAULT true,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assemblies_sort_order ON assemblies(sort_order);

CREATE OR REPLACE TRIGGER assemblies_updated_at
  BEFORE UPDATE ON assemblies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE assemblies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'assemblies' AND policyname = 'authenticated_full_access'
  ) THEN
    EXECUTE '
      CREATE POLICY "authenticated_full_access" ON assemblies
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    ';
  END IF;
END $$;
