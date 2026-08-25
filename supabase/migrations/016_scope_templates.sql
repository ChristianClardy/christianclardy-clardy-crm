-- Migration 016: Scope-of-work templates
-- One template = a free-text scope body (per company brand + project type)
-- with {{merge_tag}} placeholders and {{#if COST_CODE}}...{{else}}...{{/if}}
-- conditional blocks, resolved against an estimate's line items at
-- "Generate Scope" time (src/lib/scopeTemplateEngine.js). merge_fields maps
-- each {{tag}} to a cost_codes.code + a formatter (dimensions/quantity/
-- cost/count/raw). Templates are authored in Settings > Templates and are
-- deliberately NOT company-scope-switcher-filtered (like company_profiles
-- management itself) so all of a contractor's brands stay editable in one
-- place; the Estimate page filters the picker by its own company + type.
-- Run this in your Supabase SQL editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS scope_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  project_type  TEXT NOT NULL,
  name          TEXT NOT NULL,
  body          TEXT DEFAULT '',
  merge_fields  JSONB DEFAULT '[]',
  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scope_templates_company_id   ON scope_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_scope_templates_project_type ON scope_templates(project_type);
CREATE INDEX IF NOT EXISTS idx_scope_templates_sort_order   ON scope_templates(sort_order);

CREATE OR REPLACE TRIGGER scope_templates_updated_at
  BEFORE UPDATE ON scope_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE scope_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scope_templates' AND policyname = 'authenticated_full_access'
  ) THEN
    EXECUTE '
      CREATE POLICY "authenticated_full_access" ON scope_templates
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    ';
  END IF;
END $$;

-- estimates.project_type already exists (001_initial_schema.sql) but has
-- never been wired to the UI — EstimateDetail.jsx now gets a selector for it
-- so the scope-template picker has something to filter on.
