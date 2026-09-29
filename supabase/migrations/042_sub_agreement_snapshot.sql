-- Keep the exact Subcontractor Agreement terms each signature was given for.
--
-- The agreement text lives in the app (src/lib/barrierChecklist.js) and will
-- change over time. Each signed row now stores a copy of the title, terms and
-- signature statement as they read when signed, and the downloadable signed
-- PDF is built from that copy, so an old signature never appears under new
-- terms. Rows signed before this column existed have no copy (NULL).
-- Run this in your Supabase SQL editor.

ALTER TABLE subcontractor_barrier_acknowledgments ADD COLUMN IF NOT EXISTS agreement_snapshot JSONB;

NOTIFY pgrst, 'reload schema';
