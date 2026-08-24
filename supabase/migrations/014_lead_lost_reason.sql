-- Adds a lost reason code (+ optional free-text detail) captured when a lead
-- is marked Lost/No Decision, so the archived pipeline can be filtered and
-- reported on by why deals were lost. See src/lib/leadStages.js for the
-- fixed set of reason codes offered in the UI (lost_reason is plain TEXT,
-- not a DB enum, so the code list can change without another migration).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason_notes TEXT;
