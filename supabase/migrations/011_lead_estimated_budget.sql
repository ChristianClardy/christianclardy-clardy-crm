-- Adds an estimated budget / projected job total to leads, so pipeline
-- revenue can be tracked and reported on before a lead becomes an estimate.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS estimated_budget NUMERIC(12,2);
