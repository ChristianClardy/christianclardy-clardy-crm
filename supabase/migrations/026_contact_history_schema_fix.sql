-- contact_history was created in 001_initial_schema.sql with a minimal shape
-- (interaction_type, notes, created_by) that the app never actually used.
-- ContactHistoryPanel.jsx and the logContactHistoryEntry edge function write
-- a richer shape (contact_name, title, details, entry_type, entry_datetime,
-- source_entity, status_from, status_to) that was never migrated in, causing
-- "Could not find the 'contact_name' column of 'contact_history'" on create.

ALTER TABLE contact_history
  ADD COLUMN IF NOT EXISTS contact_name    TEXT,
  ADD COLUMN IF NOT EXISTS title           TEXT,
  ADD COLUMN IF NOT EXISTS details         TEXT,
  ADD COLUMN IF NOT EXISTS entry_type      TEXT DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS entry_datetime  TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_entity   TEXT,
  ADD COLUMN IF NOT EXISTS status_from     TEXT,
  ADD COLUMN IF NOT EXISTS status_to       TEXT;

-- Backfill the new required-ish columns from the old ones where rows already exist.
UPDATE contact_history
SET
  title      = COALESCE(title, initcap(interaction_type), 'Note'),
  details    = COALESCE(details, notes),
  entry_type = COALESCE(entry_type, NULLIF(interaction_type, ''), 'note')
WHERE title IS NULL;

-- interaction_type / notes are unused by the app now that entry_type / details
-- cover the same ground; drop them so the schema matches reality.
ALTER TABLE contact_history
  DROP COLUMN IF EXISTS interaction_type,
  DROP COLUMN IF EXISTS notes;
