-- Each draw's share of the flat builder fee, so recalculating draws after a
-- contract value change keeps the fee fixed (only the cost share moves).
--
-- Set when a builder fee payment schedule template is applied on the Billing
-- tab. Existing draws are filled in from the note that template wrote
-- ("Includes $27,000.00 builder fee (90% of $30,000.00).").
-- Run this in your Supabase SQL editor.

ALTER TABLE draws ADD COLUMN IF NOT EXISTS builder_fee_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

UPDATE draws
SET builder_fee_amount = replace(substring(notes from 'Includes \$([0-9,]+(?:\.[0-9]+)?) builder fee'), ',', '')::numeric
WHERE builder_fee_amount = 0
  AND notes ~ 'Includes \$[0-9,]+(\.[0-9]+)? builder fee';

-- Projects whose fee only lived in those notes get it on the project too.
UPDATE projects p
SET builder_fee = f.fee
FROM (
  SELECT project_id, max(replace(substring(notes from 'builder fee \([0-9.]+% of \$([0-9,]+(?:\.[0-9]+)?)\)'), ',', '')::numeric) AS fee
  FROM draws
  WHERE notes ~ 'builder fee \([0-9.]+% of \$'
  GROUP BY project_id
) f
WHERE p.id = f.project_id AND p.builder_fee IS NULL AND f.fee IS NOT NULL;

NOTIFY pgrst, 'reload schema';
