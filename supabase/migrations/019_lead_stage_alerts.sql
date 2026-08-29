-- Tracks the last "days in stage" color (green/yellow/red) a lead was
-- notified at, so the scheduled stage-alert checker only fires a
-- notification when the color actually changes, not on every run.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_alert_color TEXT NOT NULL DEFAULT 'green';

-- Reset to green whenever the lead enters a new stage, alongside the
-- existing status_changed_at reset (015_lead_status_changed_at.sql), so the
-- age clock and its color both restart together.
CREATE OR REPLACE FUNCTION update_lead_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = now();
    NEW.stage_alert_color = 'green';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
