-- The flat builder fee included in a project's contract value.
--
-- Set automatically when a payment schedule template with a builder fee is
-- applied on the Billing tab, and editable in the project's Edit dialog.
-- Used by the {{project.builder_fee}} merge fields.
-- Run this in your Supabase SQL editor.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS builder_fee NUMERIC(15,2);

NOTIFY pgrst, 'reload schema';
