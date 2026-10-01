-- Which Job Cost line a sub / vendor invoice (AP & Cash tab) is a cost of.
--
-- The id of an item in job_cost_breakdowns.sections. The invoice then shows
-- as a cost entry on that line's actual cost (src/lib/apJobCost.js); invoices
-- with no line still count, under "AP invoices not assigned to a line".
-- Run this in your Supabase SQL editor.

ALTER TABLE sub_invoices ADD COLUMN IF NOT EXISTS job_cost_item_id TEXT;

NOTIFY pgrst, 'reload schema';
