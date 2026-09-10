-- Migration 025: Per-template default merge field values
-- Adds `field_defaults` to contract_templates — a { source: value } map for
-- 'text' mode templates. When rendering, any {{source}} token with a
-- non-empty entry here uses that fixed value instead of the live-resolved
-- deal/client/company/project/estimate value (renderContractTemplate,
-- src/lib/contractMergeSources.js). Lets a template pin a value (payment
-- terms wording, a specific license #, ...) that should stay the same
-- every send, regardless of which deal it's sent from.
--
-- Run this in your Supabase SQL editor or via `supabase db push`

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS field_defaults JSONB DEFAULT '{}';
