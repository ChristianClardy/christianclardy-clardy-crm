-- Unifies the Lead pipeline: adds new/renamed funnel stages and a persistent
-- is_prospect flag directly on `leads`, replacing the old Client.status =
-- 'prospect' / workflow_stage conversion dance for pipeline tracking.
--
-- lead_status_enum values are added ad hoc in this project (see the
-- ALTER TYPE instructions previously in LeadDetail.jsx) rather than tracked
-- through committed migrations, so run the ADD VALUE statements below first,
-- as their own statement/commit, before running the rest of this file.

ALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS 'In Design';
ALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS 'Quote Delivered/Price Locked';
ALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS 'Negotiating/Revising Scope';
ALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS 'Contract Signed/Deposit Collected (Won)';
ALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS 'Lost/No Decision';

-- Run everything below only after the ADD VALUE statements above have committed.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_prospect boolean NOT NULL DEFAULT false;

-- Remap dropped statuses onto the closest equivalent new stage
UPDATE leads SET status = 'Contacted' WHERE status = 'Follow Up';
UPDATE leads SET status = 'Lost/No Decision' WHERE status = 'On Hold';

-- Rename data in place for the four renamed stages
UPDATE leads SET status = 'Quote Delivered/Price Locked' WHERE status = 'Estimate Sent';
UPDATE leads SET status = 'Negotiating/Revising Scope' WHERE status = 'Negotiation';
UPDATE leads SET status = 'Contract Signed/Deposit Collected (Won)' WHERE status = 'Won';
UPDATE leads SET status = 'Lost/No Decision' WHERE status = 'Lost';

-- Backfill is_prospect: anyone already past the new Design gate, or already
-- manually converted under the old Client.status = 'prospect' system
UPDATE leads SET is_prospect = true
WHERE status IN ('Estimate In Progress', 'Quote Delivered/Price Locked', 'Negotiating/Revising Scope',
                  'Contract Signed/Deposit Collected (Won)', 'Lost/No Decision')
   OR linked_contact_id IN (SELECT id FROM clients WHERE status = 'prospect');
