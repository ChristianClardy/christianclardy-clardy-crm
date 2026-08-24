-- Tracks when a lead last entered its current pipeline stage, so the CRM
-- kanban cards can show "time in stage." This has to be a dedicated column
-- rather than reusing `updated_at`, since `updated_at` is touched by the
-- generic update_updated_at() trigger on every field edit (notes, follow-up
-- date, etc.), not just status changes.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Backfill: best guess is when the row was created, since we have no history
-- of past status changes to derive it from.
UPDATE leads SET status_changed_at = created_at WHERE status_changed_at IS NULL;

ALTER TABLE leads ALTER COLUMN status_changed_at SET DEFAULT now();
ALTER TABLE leads ALTER COLUMN status_changed_at SET NOT NULL;

CREATE OR REPLACE FUNCTION update_lead_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_status_changed_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_lead_status_changed_at();
