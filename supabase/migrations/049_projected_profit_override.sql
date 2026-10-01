-- Projected profit you set by hand for a project (concessions, negotiated
-- price). When empty, projected profit is worked out automatically
-- (src/lib/projectProfit.js): the builder fee on builder-fee jobs, otherwise
-- 30% of the contract value.
-- Run this in your Supabase SQL editor.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS projected_profit_override NUMERIC(15,2);

NOTIFY pgrst, 'reload schema';
