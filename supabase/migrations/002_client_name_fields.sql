-- Migration 002: Split client name into first/last + add customer number
-- Run this in your Supabase SQL editor or via `supabase db push`

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT,
  ADD COLUMN IF NOT EXISTS customer_number TEXT;

-- Unique index so customer numbers stay distinct (nulls are allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_customer_number
  ON clients (customer_number)
  WHERE customer_number IS NOT NULL;

-- Back-fill first_name / last_name from the existing name column.
-- Splits on the first space: "John Smith Jr." → first="John", last="Smith Jr."
UPDATE clients
SET
  first_name = TRIM(SPLIT_PART(TRIM(name), ' ', 1)),
  last_name  = TRIM(SUBSTRING(TRIM(name) FROM POSITION(' ' IN TRIM(name)) + 1))
WHERE first_name IS NULL AND name IS NOT NULL AND TRIM(name) <> '';

-- Also add the invoice branding columns to company_profiles if they don't exist
ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS invoice_company_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_logo_url     TEXT,
  ADD COLUMN IF NOT EXISTS invoice_header_title TEXT,
  ADD COLUMN IF NOT EXISTS invoice_accent_color TEXT,
  ADD COLUMN IF NOT EXISTS invoice_intro_text   TEXT,
  ADD COLUMN IF NOT EXISTS invoice_footer_text  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_scope_label  TEXT,
  ADD COLUMN IF NOT EXISTS color                TEXT;
