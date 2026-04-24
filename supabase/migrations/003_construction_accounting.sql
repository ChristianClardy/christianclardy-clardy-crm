-- ============================================================
-- CONSTRUCTION ACCOUNTING: RETAINAGE + AP + LIEN WAIVERS
-- ============================================================

-- Retainage and draw fields that may already exist in some envs
ALTER TABLE draws ADD COLUMN IF NOT EXISTS retainage_percent   NUMERIC(5,2)  DEFAULT 10;
ALTER TABLE draws ADD COLUMN IF NOT EXISTS retainage_held      NUMERIC(15,2) DEFAULT 0;
ALTER TABLE draws ADD COLUMN IF NOT EXISTS retainage_released  BOOLEAN       DEFAULT false;
ALTER TABLE draws ADD COLUMN IF NOT EXISTS percent_of_contract NUMERIC(5,2)  DEFAULT 0;
ALTER TABLE draws ADD COLUMN IF NOT EXISTS linked_task_id      TEXT;

-- ============================================================
-- SUB INVOICES (Accounts Payable)
-- Every sub invoice or material bill tagged to a job + trade.
-- ============================================================
CREATE TABLE IF NOT EXISTS sub_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID REFERENCES projects(id) ON DELETE CASCADE,
  vendor_name        TEXT,
  invoice_number     TEXT,
  cost_code          TEXT,
  amount             NUMERIC(15,2) DEFAULT 0,
  due_date           DATE,
  paid_date          DATE,
  status             TEXT DEFAULT 'received',
  lien_waiver_status TEXT DEFAULT 'none',
  lien_waiver_date   DATE,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_project_id ON sub_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_status     ON sub_invoices(status);

CREATE OR REPLACE TRIGGER sub_invoices_updated_at
  BEFORE UPDATE ON sub_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sub_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sub_invoices' AND policyname = 'authenticated_full_access'
  ) THEN
    EXECUTE '
      CREATE POLICY "authenticated_full_access" ON sub_invoices
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    ';
  END IF;
END $$;
