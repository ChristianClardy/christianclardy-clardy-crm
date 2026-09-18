-- Adds a new "In Financing" pipeline stage between 'Quote Delivered/Price
-- Locked' and 'Negotiating/Revising Scope' — a lead sits here while the
-- client's financing is being arranged/approved before final negotiation.
--
-- lead_status_enum values are added ad hoc in this project (see
-- 012_lead_prospect_unification.sql), so run this ADD VALUE statement as its
-- own statement/commit before it's referenced anywhere else.

ALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS 'In Financing' AFTER 'Quote Delivered/Price Locked';
