-- Builder Portal: daily progress photos + Pool Barrier Safety compliance.
--   barrier_daily_logs                  — one row per project per day, mirrors the
--                                         "Daily Pool Barrier Jobsite Checklist" (A–G)
--   subcontractor_barrier_acknowledgments — signed "Mandatory Subcontractor
--                                         Requirements" per subcontractor
-- Both are company-scoped (see 010_company_scoping.sql).
-- Run this in your Supabase SQL editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS barrier_daily_logs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  project_id              UUID REFERENCES projects(id) ON DELETE CASCADE,
  log_date                DATE NOT NULL DEFAULT CURRENT_DATE,
  site_supervisor         TEXT,
  subcontractor_ids       JSONB DEFAULT '[]'::jsonb,
  crew_notes              TEXT,
  checklist               JSONB DEFAULT '{}'::jsonb,
  permanent_inspection    BOOLEAN DEFAULT false,
  deficiency_found        BOOLEAN DEFAULT false,
  deficiency_description  TEXT,
  corrective_action       TEXT,
  corrected_at            TIMESTAMPTZ,
  corrected_by            TEXT,
  certified               BOOLEAN DEFAULT false,
  certified_by            TEXT,
  certified_at            TIMESTAMPTZ,
  progress_notes          TEXT,
  photos                  JSONB DEFAULT '[]'::jsonb,
  notes                   TEXT,
  created_by              TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_barrier_daily_logs_project_date ON barrier_daily_logs(project_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_barrier_daily_logs_company_id ON barrier_daily_logs(company_id);

CREATE TABLE IF NOT EXISTS subcontractor_barrier_acknowledgments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  subcontractor_id          UUID REFERENCES subcontractors(id) ON DELETE CASCADE,
  project_id                UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_manager           TEXT,
  authorized_representative TEXT,
  signature_name            TEXT,
  signed_date               DATE,
  principle_representative  TEXT,
  principle_signature_name  TEXT,
  document_url              TEXT,
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_barrier_ack_sub ON subcontractor_barrier_acknowledgments(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_barrier_ack_company_id ON subcontractor_barrier_acknowledgments(company_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['barrier_daily_logs', 'subcontractor_barrier_acknowledgments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'authenticated_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_full_access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = t || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
        t || '_updated_at', t
      );
    END IF;
  END LOOP;
END $$;
