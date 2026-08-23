-- Splits the combined "Site Visit Complete/Design Appointment Scheduled"
-- kanban column into two distinct pipeline stages: a lead now sits in
-- 'Site Visit Complete' until the design appointment itself is booked, at
-- which point it moves into the new 'Design Appointment Scheduled' stage.
--
-- lead_status_enum values are added ad hoc in this project (see
-- 012_lead_prospect_unification.sql), so run this ADD VALUE statement as its
-- own statement/commit before it's referenced anywhere else.

ALTER TYPE lead_status_enum ADD VALUE IF NOT EXISTS 'Design Appointment Scheduled';
