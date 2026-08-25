-- Migration 017: Contract templates (reusable uploaded contract files with
-- DocuSign anchor-tag merge-field mappings)
-- One template = an uploaded contract file (Word/PDF, stored the same way
-- as any other attachment — Supabase Storage via base44 UploadFile) plus a
-- list of { anchor, source } mappings. `anchor` is the literal token typed
-- into the document (e.g. "{{client_name}}"); `source` is a fixed dot-path
-- (client.name, deal.value, company.phone, today, ...) resolved against the
-- Deal being sent — see src/lib/contractMergeSources.js. At send time
-- (Deal Contracts tab, PipelineView.jsx) those become DocuSign locked text
-- tabs via api/docusign-send.js's `documents[].merge_fields`.
-- Run this in your Supabase SQL editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS contract_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_name     TEXT,
  file_type     TEXT,
  merge_fields  JSONB DEFAULT '[]',
  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_company_id ON contract_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_sort_order ON contract_templates(sort_order);

CREATE OR REPLACE TRIGGER contract_templates_updated_at
  BEFORE UPDATE ON contract_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_templates' AND policyname = 'authenticated_full_access'
  ) THEN
    EXECUTE '
      CREATE POLICY "authenticated_full_access" ON contract_templates
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    ';
  END IF;
END $$;

-- deals has no direct client_id — the Contracts tab resolves a Deal's
-- customer via lead_id -> leads.linked_contact_id -> clients, same chain
-- src/lib/leadConversion.js already uses. Deals created manually on the
-- Pipeline board with no lead_id simply won't have merge-field data to pull
-- from client.* sources (the UI surfaces this rather than failing silently).
