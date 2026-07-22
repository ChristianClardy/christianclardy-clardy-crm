-- Migration 010: Company-wide data scoping
-- Only `projects` and `documents` currently have a company_id column, so the
-- company-scope switcher in the sidebar only ever affected those two areas.
-- This adds company_id to every other business-record table (CRM, estimates,
-- money, schedule) so switching companies actually filters the whole app,
-- while shared infrastructure (materials, cost_codes, assemblies,
-- subcontractors, employees, municipalities) intentionally stays global.
-- Run this in your Supabase SQL editor or via `supabase db push`

ALTER TABLE leads          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE clients        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE estimates      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE invoices       ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE payments       ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE tasks          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE change_orders  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE draws          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE sub_invoices   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;
ALTER TABLE designs        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_company_id          ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_id        ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_company_id      ON estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id       ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_company_id       ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_company_id ON calendar_events(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_company_id          ON tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_company_id  ON change_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_draws_company_id          ON draws(company_id);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_company_id   ON sub_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_designs_company_id        ON designs(company_id);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Pass 1: tables with no derivable project/client link — assign directly to
-- the primary company so nothing disappears from view.
UPDATE leads SET company_id = (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  WHERE company_id IS NULL;

UPDATE clients SET company_id = (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  WHERE company_id IS NULL;

UPDATE designs SET company_id = (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  WHERE company_id IS NULL;

-- Pass 2: tables with a nullable project_id (and estimates also client_id) —
-- prefer the linked project's/client's company (already resolved above),
-- falling back to the primary company only when neither link resolves.
UPDATE estimates e SET company_id = COALESCE(
    (SELECT p.company_id FROM projects p WHERE p.id = e.project_id),
    (SELECT c.company_id FROM clients  c WHERE c.id = e.client_id),
    (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  ) WHERE e.company_id IS NULL;

UPDATE invoices i SET company_id = COALESCE(
    (SELECT p.company_id FROM projects p WHERE p.id = i.linked_job_id),
    (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  ) WHERE i.company_id IS NULL;

UPDATE payments pm SET company_id = COALESCE(
    (SELECT p.company_id FROM projects p WHERE p.id = pm.linked_job_id),
    (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  ) WHERE pm.company_id IS NULL;

UPDATE calendar_events ce SET company_id = COALESCE(
    (SELECT p.company_id FROM projects p WHERE p.id = ce.project_id),
    (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  ) WHERE ce.company_id IS NULL;

UPDATE tasks t SET company_id = COALESCE(
    (SELECT p.company_id FROM projects p WHERE p.id = t.project_id),
    (SELECT p.company_id FROM projects p WHERE p.id = t.linked_job_id),
    (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  ) WHERE t.company_id IS NULL;

UPDATE change_orders co SET company_id = COALESCE(
    (SELECT p.company_id FROM projects p WHERE p.id = co.project_id),
    (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  ) WHERE co.company_id IS NULL;

UPDATE draws d SET company_id = COALESCE(
    (SELECT p.company_id FROM projects p WHERE p.id = d.project_id),
    (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  ) WHERE d.company_id IS NULL;

UPDATE sub_invoices si SET company_id = COALESCE(
    (SELECT p.company_id FROM projects p WHERE p.id = si.project_id),
    (SELECT id FROM company_profiles WHERE name = 'Clardy Enterprises' LIMIT 1)
  ) WHERE si.company_id IS NULL;
