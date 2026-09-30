-- A subcontractor can do more than one trade.
--
-- trades holds every trade picked on the subcontractor (e.g. {pool,plaster});
-- the existing trade column stays as the first one picked, so everything that
-- still reads a single trade keeps working. Existing subs get their one trade
-- copied in.
-- Run this in your Supabase SQL editor.

ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS trades TEXT[];

UPDATE subcontractors SET trades = ARRAY[trade]
WHERE trades IS NULL AND trade IS NOT NULL AND trade <> '';

NOTIFY pgrst, 'reload schema';
