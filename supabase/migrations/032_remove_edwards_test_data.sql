-- Removes leftover AccuLynx demo/test data. "Christian TEST" (email
-- @edwardsdesignandconstruction.com) is a test client from AccuLynx's
-- sample/demo account, synced in alongside a batch of fake numbered
-- projects sharing its organization_id. Christian confirmed the only real
-- project that should exist is "Lezlee Burt" — everything else in this
-- batch is stale demo data, including the ~54 task-deadline rows it
-- produced on the Dashboard's Task Deadlines panel (which reads from each
-- project's project_sheets.rows).
--
-- Run the SELECTs first to sanity-check row counts, then run the DELETEs.
-- Run this in your Supabase SQL editor.

-- ── Sanity check before deleting ───────────────────────────────────────────
SELECT id, name FROM projects WHERE id IN (
  'b018d6cc-fc5e-492e-a63c-022b30e2d1dc', 'cfd21266-bef5-4357-8ba4-5fa3dbec64be',
  '5bc928fc-715d-4644-8d5f-e5ee5871762d', '0eeb0573-20e4-43de-acd0-70bd3aab1c03',
  '54ef8e7b-53df-4a95-bf82-294fbbad14bd', '97be4e95-f4ae-43df-8ba5-e395801a1b74',
  '29d735da-8354-4763-adde-43cdedae470a', 'bd92b1f5-bbfc-4ae5-a1ce-52cf2f314b85',
  'e13370d9-ea8d-4323-807d-560be262f533', '92058e87-082c-4825-8236-91c40de5cae6'
);

SELECT count(*) AS orphaned_task_rows FROM tasks WHERE project_id IN (
  'b018d6cc-fc5e-492e-a63c-022b30e2d1dc', 'cfd21266-bef5-4357-8ba4-5fa3dbec64be',
  '5bc928fc-715d-4644-8d5f-e5ee5871762d', '0eeb0573-20e4-43de-acd0-70bd3aab1c03',
  '54ef8e7b-53df-4a95-bf82-294fbbad14bd', '97be4e95-f4ae-43df-8ba5-e395801a1b74',
  '29d735da-8354-4763-adde-43cdedae470a', 'bd92b1f5-bbfc-4ae5-a1ce-52cf2f314b85',
  'e13370d9-ea8d-4323-807d-560be262f533', '92058e87-082c-4825-8236-91c40de5cae6'
) OR linked_job_id IN (
  'b018d6cc-fc5e-492e-a63c-022b30e2d1dc', 'cfd21266-bef5-4357-8ba4-5fa3dbec64be',
  '5bc928fc-715d-4644-8d5f-e5ee5871762d', '0eeb0573-20e4-43de-acd0-70bd3aab1c03',
  '54ef8e7b-53df-4a95-bf82-294fbbad14bd', '97be4e95-f4ae-43df-8ba5-e395801a1b74',
  '29d735da-8354-4763-adde-43cdedae470a', 'bd92b1f5-bbfc-4ae5-a1ce-52cf2f314b85',
  'e13370d9-ea8d-4323-807d-560be262f533', '92058e87-082c-4825-8236-91c40de5cae6'
);

-- ── Cleanup ─────────────────────────────────────────────────────────────
-- Remove tasks tied to the fake projects (they'd otherwise just lose their
-- project link via ON DELETE SET NULL and linger as orphaned task rows).
DELETE FROM tasks WHERE project_id IN (
  'b018d6cc-fc5e-492e-a63c-022b30e2d1dc', 'cfd21266-bef5-4357-8ba4-5fa3dbec64be',
  '5bc928fc-715d-4644-8d5f-e5ee5871762d', '0eeb0573-20e4-43de-acd0-70bd3aab1c03',
  '54ef8e7b-53df-4a95-bf82-294fbbad14bd', '97be4e95-f4ae-43df-8ba5-e395801a1b74',
  '29d735da-8354-4763-adde-43cdedae470a', 'bd92b1f5-bbfc-4ae5-a1ce-52cf2f314b85',
  'e13370d9-ea8d-4323-807d-560be262f533', '92058e87-082c-4825-8236-91c40de5cae6'
) OR linked_job_id IN (
  'b018d6cc-fc5e-492e-a63c-022b30e2d1dc', 'cfd21266-bef5-4357-8ba4-5fa3dbec64be',
  '5bc928fc-715d-4644-8d5f-e5ee5871762d', '0eeb0573-20e4-43de-acd0-70bd3aab1c03',
  '54ef8e7b-53df-4a95-bf82-294fbbad14bd', '97be4e95-f4ae-43df-8ba5-e395801a1b74',
  '29d735da-8354-4763-adde-43cdedae470a', 'bd92b1f5-bbfc-4ae5-a1ce-52cf2f314b85',
  'e13370d9-ea8d-4323-807d-560be262f533', '92058e87-082c-4825-8236-91c40de5cae6'
);

-- Deleting the projects cascades to project_sheets (the ~54 task-deadline
-- rows), draws, change_orders, job_cost_breakdowns, selection_allowances,
-- permit_updates, permit_inspection_tasks, and project_photos. Estimates,
-- invoices, payments, calendar_events, site_visits, and reminders just have
-- their project link set to NULL (ON DELETE SET NULL) rather than being
-- deleted, in case any of those hold real financial/schedule records.
DELETE FROM projects WHERE id IN (
  'b018d6cc-fc5e-492e-a63c-022b30e2d1dc', 'cfd21266-bef5-4357-8ba4-5fa3dbec64be',
  '5bc928fc-715d-4644-8d5f-e5ee5871762d', '0eeb0573-20e4-43de-acd0-70bd3aab1c03',
  '54ef8e7b-53df-4a95-bf82-294fbbad14bd', '97be4e95-f4ae-43df-8ba5-e395801a1b74',
  '29d735da-8354-4763-adde-43cdedae470a', 'bd92b1f5-bbfc-4ae5-a1ce-52cf2f314b85',
  'e13370d9-ea8d-4323-807d-560be262f533', '92058e87-082c-4825-8236-91c40de5cae6'
);

-- Remove the AccuLynx demo/test client itself.
DELETE FROM clients WHERE id = '2fb3b8fa-fea3-4076-aa88-a991570bf209';
