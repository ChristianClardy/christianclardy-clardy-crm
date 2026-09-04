-- Pool equipment/finish selections, allowances, and payment schedule for a
-- project — one record per project, feeding the contract merge-field system
-- (src/lib/contractMergeSources.js) so a pool construction contract can pull
-- this data in automatically instead of being retyped by hand.

CREATE TABLE IF NOT EXISTS pool_selections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID REFERENCES projects(id) ON DELETE CASCADE,
  equipment           JSONB DEFAULT '[]',
  finishes            JSONB DEFAULT '[]',
  allowances          JSONB DEFAULT '[]',
  payment_schedule    JSONB DEFAULT '[]',
  water_features      TEXT,
  other_improvements  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- One selections record per project.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_selections_project_id ON pool_selections(project_id);

CREATE OR REPLACE TRIGGER pool_selections_updated_at
  BEFORE UPDATE ON pool_selections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pool_selections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pool_selections' AND policyname = 'authenticated_full_access'
  ) THEN
    EXECUTE '
      CREATE POLICY "authenticated_full_access" ON pool_selections
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    ';
  END IF;
END $$;
