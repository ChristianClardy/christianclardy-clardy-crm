-- Migration 024: Contract templates — in-app text body mode
-- Adds a second contract_templates mode alongside the original uploaded-file
-- flow: `body_type = 'text'` templates are authored in-app as plain text
-- with {{source}} merge tokens (the token *is* the MERGE_SOURCES value —
-- see src/lib/contractMergeSources.js) inserted via a searchable/drag-drop
-- field picker (Settings -> Templates -> Contract Templates). At send time
-- the body is fully resolved client-side and rendered into a real text PDF
-- (src/lib/generateContractPdf.js), so no DocuSign merge-field tabs are
-- needed for text-mode templates — only the existing `**signature**` anchor
-- for signature placement.
--
-- `body_type = 'file'` (the default, for every existing row) is the
-- original flow and is completely unchanged: an uploaded Word/PDF with
-- literal anchors typed in, mapped to a source via `merge_fields`.
--
-- Run this in your Supabase SQL editor or via `supabase db push`

ALTER TABLE contract_templates
  ALTER COLUMN file_url DROP NOT NULL;

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS body_type TEXT NOT NULL DEFAULT 'file' CHECK (body_type IN ('file', 'text')),
  ADD COLUMN IF NOT EXISTS body TEXT;
