-- Migration 008: Shared cost-code taxonomy + material/labor cost split foundation
-- Bridges the three previously-independent hardcoded lists (TRADE_GROUPS in
-- EstimateDetail.jsx, MATERIAL_CATEGORIES/LABOR_CATEGORIES in
-- MaterialLibrary.jsx, COST_CODES in ProjectAccounting.jsx) with one shared
-- reference table, without touching any of those existing free-text fields.
-- Run this in your Supabase SQL editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS cost_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  division    TEXT,
  cost_type   cost_type_enum,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_codes_sort_order ON cost_codes(sort_order);

CREATE OR REPLACE TRIGGER cost_codes_updated_at
  BEFORE UPDATE ON cost_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE cost_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cost_codes' AND policyname = 'authenticated_full_access'
  ) THEN
    EXECUTE '
      CREATE POLICY "authenticated_full_access" ON cost_codes
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    ';
  END IF;
END $$;

-- Additive link from materials -> cost_codes (nullable, does not touch
-- the existing `category` text field materials already uses).
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS cost_code_id UUID REFERENCES cost_codes(id);

CREATE INDEX IF NOT EXISTS idx_materials_cost_code_id ON materials(cost_code_id);

-- Seed data: CSI-flavored divisions covering general commercial GC work
-- plus this company's hardscape/pool/outdoor-living specialties, phrased
-- to match vocabulary already used in TRADE_GROUPS / MATERIAL_CATEGORIES.
INSERT INTO cost_codes (code, name, division, cost_type, sort_order, is_active) VALUES
  ('01-000', 'General Conditions & Permits', 'General',            'other',       10, true),
  ('01-100', 'Demo / Site Prep',             'General',            'labor',       20, true),
  ('01-200', 'Site Work / Excavation',       'General',            'labor',       30, true),
  ('02-100', 'Drainage & Grading',           'Sitework',           'labor',       40, true),
  ('03-000', 'Concrete / Flatwork',          'Concrete',           'material',    50, true),
  ('03-100', 'Concrete Labor / Foundation',  'Concrete',           'labor',       60, true),
  ('03-200', 'Steel / Rebar',                'Concrete',           'material',    70, true),
  ('03-300', 'Gunite / Shotcrete',           'Concrete',           'subcontract', 80, true),
  ('04-000', 'Masonry',                      'Masonry',            'material',    90, true),
  ('04-100', 'Pavers & Hardscape',           'Masonry',            'material',   100, true),
  ('04-200', 'Retaining Walls',              'Masonry',            'material',   110, true),
  ('04-300', 'Coping & Tile',                'Masonry',            'material',   120, true),
  ('05-000', 'Steel / Structural',           'Structural',         'material',   130, true),
  ('06-000', 'Framing / Carpentry',          'Wood & Plastics',    'labor',      140, true),
  ('06-100', 'Finish Carpentry',             'Wood & Plastics',    'labor',      150, true),
  ('06-200', 'Decking',                      'Wood & Plastics',    'material',   160, true),
  ('06-300', 'Pergolas / Shade Structures',  'Wood & Plastics',    'material',   170, true),
  ('07-000', 'Roofing',                      'Thermal & Moisture', 'material',   180, true),
  ('07-100', 'Waterproofing',                'Thermal & Moisture', 'subcontract',190, true),
  ('07-200', 'Insulation',                   'Thermal & Moisture', 'material',   200, true),
  ('08-000', 'Windows & Doors',              'Openings',           'material',   210, true),
  ('09-000', 'Drywall / Sheetrock',          'Finishes',           'material',   220, true),
  ('09-100', 'Flooring',                     'Finishes',           'material',   230, true),
  ('09-200', 'Painting',                     'Finishes',           'labor',      240, true),
  ('09-300', 'Plaster / Pool Finish',        'Finishes',           'subcontract',250, true),
  ('11-000', 'Equipment (Owned/Rented)',     'Equipment',          'equipment',  260, true),
  ('11-100', 'Pool Equipment & Automation',  'Equipment',          'material',   270, true),
  ('11-200', 'Outdoor Kitchen Equipment',    'Equipment',          'material',   280, true),
  ('15-000', 'Plumbing',                     'Mechanical',         'subcontract',290, true),
  ('15-100', 'Irrigation / Sprinkler',       'Mechanical',         'subcontract',300, true),
  ('15-200', 'HVAC',                         'Mechanical',         'subcontract',310, true),
  ('16-000', 'Electrical',                   'Electrical',         'subcontract',320, true),
  ('32-000', 'Landscaping / Planting',       'Sitework',           'material',   330, true)
ON CONFLICT (code) DO NOTHING;
