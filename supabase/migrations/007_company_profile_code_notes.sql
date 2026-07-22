-- Migration 007: Add missing code/notes columns to company_profiles
-- CompanyManager.jsx (Settings > Companies) submits `code` and `notes` on
-- create/update, but the table never had those columns, so every "Add
-- Company" insert failed with "Could not find the 'code' column of
-- 'company_profiles' in the schema cache".
-- Run this in your Supabase SQL editor or via `supabase db push`

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS code  TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;
