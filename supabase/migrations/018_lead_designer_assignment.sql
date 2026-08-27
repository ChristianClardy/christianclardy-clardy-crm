-- Lets a designer be assigned to a Lead the moment it moves into the
-- "In Design" pipeline stage, so design work has an owner from the start
-- instead of being picked up ad hoc. Plain TEXT (like assigned_sales_rep)
-- rather than a foreign key — the rest of the CRM assigns people by name
-- string, not by Employee id.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_designer TEXT;
