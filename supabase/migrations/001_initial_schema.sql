-- ============================================================
-- ConstructIQ — Supabase Migration
-- Generated: 2026-03-30
-- 35 tables covering all Base44 entities
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE task_type_enum AS ENUM (
  'Call', 'Follow Up', 'Site Visit', 'Estimate', 'Permit',
  'Material Order', 'Scheduling', 'Billing', 'Punch List', 'Closeout', 'Other'
);

CREATE TYPE task_status_enum AS ENUM (
  'not_started', 'in_progress', 'waiting', 'complete', 'overdue', 'completed', 'blocked'
);

CREATE TYPE priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TYPE project_status_enum AS ENUM (
  'planning', 'in_progress', 'on_hold', 'completed', 'cancelled'
);

CREATE TYPE employee_role_enum AS ENUM (
  'admin', 'project_manager', 'foreman', 'laborer', 'office', 'other'
);

CREATE TYPE employee_status_enum AS ENUM ('active', 'inactive');

CREATE TYPE lead_status_enum AS ENUM (
  'new', 'contacted', 'qualified', 'proposal', 'won', 'lost'
);

CREATE TYPE invoice_status_enum AS ENUM (
  'draft', 'sent', 'paid', 'overdue', 'cancelled'
);

CREATE TYPE draw_status_enum AS ENUM ('pending', 'paid');

CREATE TYPE cost_type_enum AS ENUM (
  'material', 'labor', 'equipment', 'subcontract', 'other'
);

CREATE TYPE good_better_best_enum AS ENUM ('good', 'better', 'best');

-- ============================================================
-- HELPER: auto-update updated_at on every table
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- COMPANY PROFILES
-- ============================================================

CREATE TABLE company_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  logo_url        TEXT,
  license_number  TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER company_profiles_updated_at
  BEFORE UPDATE ON company_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- EMPLOYEES
-- ============================================================

CREATE TABLE employees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  role        employee_role_enum DEFAULT 'other',
  department  TEXT,
  status      employee_status_enum DEFAULT 'active',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_employees_email  ON employees(email);
CREATE INDEX idx_employees_status ON employees(status);

CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CLIENTS
-- ============================================================

CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  company         TEXT,
  notes           TEXT,
  status          TEXT,
  client_id       TEXT,          -- legacy / external reference
  acculynx_id     TEXT,          -- AccuLynx sync key
  sync_locked     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clients_email       ON clients(email);
CREATE INDEX idx_clients_acculynx_id ON clients(acculynx_id);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MUNICIPALITIES
-- ============================================================

CREATE TABLE municipalities (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city     TEXT NOT NULL,
  county   TEXT,
  state    TEXT,
  notes    TEXT,
  contact  TEXT,
  phone    TEXT,
  email    TEXT,
  website  TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_municipalities_city ON municipalities(city);

CREATE TRIGGER municipalities_updated_at
  BEFORE UPDATE ON municipalities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SUBCONTRACTORS
-- ============================================================

CREATE TABLE subcontractors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  trade           TEXT,
  license_number  TEXT,
  insurance_exp   DATE,
  notes           TEXT,
  status          TEXT DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subcontractors_trade ON subcontractors(trade);

CREATE TRIGGER subcontractors_updated_at
  BEFORE UPDATE ON subcontractors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- LEADS
-- ============================================================

CREATE TABLE leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            TEXT NOT NULL,
  phone                TEXT,
  email                TEXT,
  address              TEXT,
  assigned_sales_rep   TEXT,
  follow_up_date       DATE,
  status               lead_status_enum DEFAULT 'new',
  lead_source          TEXT,
  project_type         TEXT,
  next_action          TEXT,
  project_description  TEXT,
  notes                TEXT,
  linked_contact_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  acculynx_id          TEXT,
  workflow_stage       TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_leads_status             ON leads(status);
CREATE INDEX idx_leads_assigned_sales_rep ON leads(assigned_sales_rep);
CREATE INDEX idx_leads_follow_up_date     ON leads(follow_up_date);
CREATE INDEX idx_leads_linked_contact_id  ON leads(linked_contact_id);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- LEAD FOLLOW UPS
-- ============================================================

CREATE TABLE lead_follow_ups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status         TEXT,
  notes          TEXT,
  follow_up_date DATE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lead_follow_ups_lead_id ON lead_follow_ups(lead_id);

CREATE TRIGGER lead_follow_ups_updated_at
  BEFORE UPDATE ON lead_follow_ups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CONTACT HISTORY
-- ============================================================

CREATE TABLE contact_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE,
  linked_client_id  UUID REFERENCES clients(id) ON DELETE CASCADE,
  interaction_type  TEXT,    -- call, email, meeting, note, etc.
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contact_history_lead_id   ON contact_history(linked_lead_id);
CREATE INDEX idx_contact_history_client_id ON contact_history(linked_client_id);

CREATE TRIGGER contact_history_updated_at
  BEFORE UPDATE ON contact_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  address           TEXT,
  status            project_status_enum DEFAULT 'planning',
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  company_id        UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  project_manager   TEXT,
  percent_complete  NUMERIC(5,2)  DEFAULT 0,
  contract_value    NUMERIC(15,2) DEFAULT 0,
  costs_to_date     NUMERIC(15,2) DEFAULT 0,
  original_costs    NUMERIC(15,2) DEFAULT 0,
  amendment_costs   NUMERIC(15,2) DEFAULT 0,
  billed_to_date    NUMERIC(15,2) DEFAULT 0,
  start_date        DATE,
  end_date          DATE,
  acculynx_job_id   TEXT,
  sync_locked       BOOLEAN DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_projects_client_id      ON projects(client_id);
CREATE INDEX idx_projects_status         ON projects(status);
CREATE INDEX idx_projects_acculynx_job_id ON projects(acculynx_job_id);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ESTIMATE TEMPLATES
-- ============================================================

CREATE TABLE estimate_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  project_type TEXT,
  line_items   JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER estimate_templates_updated_at
  BEFORE UPDATE ON estimate_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ESTIMATES
-- ============================================================

CREATE TABLE estimates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_number  TEXT,
  title            TEXT NOT NULL,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id       UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_type     TEXT,
  margin_percent   NUMERIC(5,2),
  issue_date       DATE,
  expiry_date      DATE,
  tax_rate         NUMERIC(5,4) DEFAULT 0,
  notes            TEXT,
  terms            TEXT,
  status           TEXT DEFAULT 'draft',
  line_items       JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_estimates_client_id  ON estimates(client_id);
CREATE INDEX idx_estimates_project_id ON estimates(project_id);
CREATE INDEX idx_estimates_status     ON estimates(status);

CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ESTIMATE VERSIONS
-- ============================================================

CREATE TABLE estimate_versions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id   TEXT,                          -- legacy external ID
  linked_estimate_id    UUID REFERENCES estimates(id) ON DELETE CASCADE,
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  version_name          TEXT,
  version_type          TEXT,
  created_by_name       TEXT,
  active_version        BOOLEAN DEFAULT FALSE,
  notes                 TEXT,
  subtotal_material     NUMERIC(15,2) DEFAULT 0,
  subtotal_labor        NUMERIC(15,2) DEFAULT 0,
  subtotal_equipment    NUMERIC(15,2) DEFAULT 0,
  subtotal_subcontract  NUMERIC(15,2) DEFAULT 0,
  subtotal_other        NUMERIC(15,2) DEFAULT 0,
  subtotal_allowances   NUMERIC(15,2) DEFAULT 0,
  subtotal_contingency  NUMERIC(15,2) DEFAULT 0,
  total_cost            NUMERIC(15,2) DEFAULT 0,
  total_price           NUMERIC(15,2) DEFAULT 0,
  gross_profit          NUMERIC(15,2) DEFAULT 0,
  gross_margin_percent  NUMERIC(5,2)  DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_estimate_versions_estimate_id ON estimate_versions(linked_estimate_id);
CREATE INDEX idx_estimate_versions_project_id  ON estimate_versions(project_id);
CREATE INDEX idx_estimate_versions_active      ON estimate_versions(active_version);

CREATE TRIGGER estimate_versions_updated_at
  BEFORE UPDATE ON estimate_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- LINE ITEMS
-- ============================================================

CREATE TABLE line_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id          TEXT,                           -- legacy external ID
  estimate_version_id   UUID REFERENCES estimate_versions(id) ON DELETE CASCADE,
  item_code             TEXT,
  item_name             TEXT NOT NULL,
  item_description      TEXT,
  cost_type             cost_type_enum DEFAULT 'material',
  unit_type             TEXT,
  quantity              NUMERIC(12,4) DEFAULT 0,
  material_unit_cost    NUMERIC(12,4) DEFAULT 0,
  labor_unit_cost       NUMERIC(12,4) DEFAULT 0,
  equipment_unit_cost   NUMERIC(12,4) DEFAULT 0,
  subcontract_unit_cost NUMERIC(12,4) DEFAULT 0,
  waste_percent         NUMERIC(5,2)  DEFAULT 0,
  base_cost             NUMERIC(15,2) DEFAULT 0,
  markup_percent        NUMERIC(5,2)  DEFAULT 0,
  sell_price            NUMERIC(15,2) DEFAULT 0,
  optional_flag         BOOLEAN DEFAULT FALSE,
  allowance_flag        BOOLEAN DEFAULT FALSE,
  included_flag         BOOLEAN DEFAULT TRUE,
  good_better_best_tier good_better_best_enum,
  production_rate       NUMERIC(12,4),
  labor_hours           NUMERIC(12,4),
  notes                 TEXT,
  sort_order            INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_line_items_estimate_version_id ON line_items(estimate_version_id);
CREATE INDEX idx_line_items_sort_order          ON line_items(sort_order);

CREATE TRIGGER line_items_updated_at
  BEFORE UPDATE ON line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- INVOICES
-- ============================================================

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      TEXT,                          -- legacy external ID
  linked_job_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  invoice_name    TEXT,
  invoice_type    TEXT,
  amount          NUMERIC(15,2) DEFAULT 0,
  due_date        DATE,
  notes           TEXT,
  invoice_status  invoice_status_enum DEFAULT 'draft',
  date_sent       DATE,
  branding        JSONB DEFAULT '{}',
  line_items      JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoices_linked_job_id ON invoices(linked_job_id);
CREATE INDEX idx_invoices_status        ON invoices(invoice_status);

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_job_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  payment_method    TEXT,
  reference_number  TEXT,
  notes             TEXT,
  payment_date      DATE,
  amount_received   NUMERIC(15,2) DEFAULT 0,
  acculynx_id       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payments_linked_job_id ON payments(linked_job_id);
CREATE INDEX idx_payments_payment_date  ON payments(payment_date);

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DRAWS
-- ============================================================

CREATE TABLE draws (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  draw_number  INTEGER,
  title        TEXT,
  amount       NUMERIC(15,2) DEFAULT 0,
  status       draw_status_enum DEFAULT 'pending',
  due_date     DATE,
  paid_date    DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_draws_project_id ON draws(project_id);
CREATE INDEX idx_draws_status     ON draws(status);

CREATE TRIGGER draws_updated_at
  BEFORE UPDATE ON draws
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CHANGE ORDERS
-- ============================================================

CREATE TABLE change_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT,
  description     TEXT,
  amount          NUMERIC(15,2) DEFAULT 0,
  status          TEXT DEFAULT 'pending',
  requested_date  DATE,
  approved_date   DATE,
  notes           TEXT,
  line_items      JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_change_orders_project_id ON change_orders(project_id);

CREATE TRIGGER change_orders_updated_at
  BEFORE UPDATE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- JOB COST BREAKDOWNS
-- ============================================================

CREATE TABLE job_cost_breakdowns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  sections    JSONB DEFAULT '[]',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_cost_breakdowns_project_id ON job_cost_breakdowns(project_id);

CREATE TRIGGER job_cost_breakdowns_updated_at
  BEFORE UPDATE ON job_cost_breakdowns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TASKS
-- Dual-purpose: project tasks + CRM tasks (linked_lead_id)
-- linked_job_id is a second reference to projects (used by AccuLynx-style linking)
-- ============================================================

CREATE TABLE tasks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  project_id           UUID REFERENCES projects(id) ON DELETE SET NULL,
  linked_lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  linked_estimate_id   UUID REFERENCES estimates(id) ON DELETE SET NULL,
  linked_job_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_type            task_type_enum DEFAULT 'Other',
  description          TEXT,
  status               task_status_enum DEFAULT 'not_started',
  start_date           DATE,
  due_date             DATE,
  end_date             DATE,
  assigned_to          TEXT,
  priority             priority_enum DEFAULT 'medium',
  estimated_hours      NUMERIC(8,2),
  actual_hours         NUMERIC(8,2),
  sort_order           INTEGER DEFAULT 0,
  github_issue_number  INTEGER,
  github_issue_url     TEXT,
  github_repo          TEXT DEFAULT 'christianclardy/clardy-crm',
  subtasks             JSONB DEFAULT '[]',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_project_id      ON tasks(project_id);
CREATE INDEX idx_tasks_linked_lead_id  ON tasks(linked_lead_id);
CREATE INDEX idx_tasks_status          ON tasks(status);
CREATE INDEX idx_tasks_due_date        ON tasks(due_date);
CREATE INDEX idx_tasks_assigned_to     ON tasks(assigned_to);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TODO ITEMS (personal to-dos)
-- ============================================================

CREATE TABLE todo_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  created_by  TEXT,
  assigned_to TEXT,
  priority    priority_enum DEFAULT 'medium',
  due_date    DATE,
  notes       TEXT,
  completed   BOOLEAN DEFAULT FALSE,
  recurring   BOOLEAN DEFAULT FALSE,
  subtasks    JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_todo_items_created_by  ON todo_items(created_by);
CREATE INDEX idx_todo_items_assigned_to ON todo_items(assigned_to);
CREATE INDEX idx_todo_items_completed   ON todo_items(completed);

CREATE TRIGGER todo_items_updated_at
  BEFORE UPDATE ON todo_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MATERIALS (library)
-- ============================================================

CREATE TABLE materials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  category       TEXT,
  unit           TEXT,
  supplier       TEXT,
  sku            TEXT,
  material_cost  NUMERIC(12,4) DEFAULT 0,
  labor_cost     NUMERIC(12,4) DEFAULT 0,
  sub_cost       NUMERIC(12,4) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_materials_category ON materials(category);
CREATE INDEX idx_materials_sku      ON materials(sku);

CREATE TRIGGER materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SELECTION ALLOWANCES
-- ============================================================

CREATE TABLE selection_allowances (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID REFERENCES projects(id) ON DELETE CASCADE,
  estimate_version_id  UUID REFERENCES estimate_versions(id) ON DELETE SET NULL,
  title                TEXT,
  amount               NUMERIC(15,2) DEFAULT 0,
  selected_amount      NUMERIC(15,2),
  status               TEXT DEFAULT 'pending',
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_selection_allowances_project_id ON selection_allowances(project_id);

CREATE TRIGGER selection_allowances_updated_at
  BEFORE UPDATE ON selection_allowances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SITE VISITS
-- ============================================================

CREATE TABLE site_visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  scheduled_date  DATE,
  scheduled_time  TEXT,
  status          TEXT DEFAULT 'scheduled',
  notes           TEXT,
  assigned_to     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_site_visits_project_id     ON site_visits(project_id);
CREATE INDEX idx_site_visits_lead_id        ON site_visits(lead_id);
CREATE INDEX idx_site_visits_scheduled_date ON site_visits(scheduled_date);

CREATE TRIGGER site_visits_updated_at
  BEFORE UPDATE ON site_visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PERMIT UPDATES
-- ============================================================

CREATE TABLE permit_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  status      TEXT,
  status_date DATE,
  notes       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_permit_updates_project_id ON permit_updates(project_id);

CREATE TRIGGER permit_updates_updated_at
  BEFORE UPDATE ON permit_updates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PERMIT INSPECTION TASKS
-- ============================================================

CREATE TABLE permit_inspection_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT,
  description TEXT,
  completed   BOOLEAN DEFAULT FALSE,
  due_date    DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_permit_inspection_tasks_project_id ON permit_inspection_tasks(project_id);

CREATE TRIGGER permit_inspection_tasks_updated_at
  BEFORE UPDATE ON permit_inspection_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PROJECT PHOTOS
-- ============================================================

CREATE TABLE project_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  url          TEXT,
  filename     TEXT,
  caption      TEXT,
  phase        TEXT,
  uploaded_by  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_project_photos_project_id ON project_photos(project_id);

CREATE TRIGGER project_photos_updated_at
  BEFORE UPDATE ON project_photos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PROJECT SHEETS
-- ============================================================

CREATE TABLE project_sheets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  rows        JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_project_sheets_project_id ON project_sheets(project_id);

CREATE TRIGGER project_sheets_updated_at
  BEFORE UPDATE ON project_sheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PROJECT SHEET TEMPLATES
-- ============================================================

CREATE TABLE project_sheet_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  rows        JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER project_sheet_templates_updated_at
  BEFORE UPDATE ON project_sheet_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- REMINDERS
-- ============================================================

CREATE TABLE reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id     UUID REFERENCES tasks(id) ON DELETE SET NULL,
  task_name   TEXT,
  remind_at   TIMESTAMPTZ,
  sent        BOOLEAN DEFAULT FALSE,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reminders_project_id ON reminders(project_id);
CREATE INDEX idx_reminders_remind_at  ON reminders(remind_at);

CREATE TRIGGER reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CALENDAR EVENTS
-- ============================================================

CREATE TABLE calendar_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  start_datetime   TIMESTAMPTZ,
  end_datetime     TIMESTAMPTZ,
  all_day          BOOLEAN DEFAULT FALSE,
  event_type       TEXT,
  project_id       UUID REFERENCES projects(id) ON DELETE SET NULL,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to      TEXT,
  source_event_id  TEXT,      -- external calendar sync ID (Google, etc.)
  source           TEXT,      -- 'internal', 'google', etc.
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calendar_events_start_datetime ON calendar_events(start_datetime);
CREATE INDEX idx_calendar_events_project_id     ON calendar_events(project_id);

CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DOCUMENTS
-- ============================================================

CREATE TABLE documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  url          TEXT,
  file_type    TEXT,
  file_size    INTEGER,
  entity_type  TEXT,          -- polymorphic: 'Project', 'Lead', 'Client', etc.
  entity_id    UUID,
  uploaded_by  TEXT,
  upload_date  DATE,
  company_id   UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_documents_entity     ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_company_id ON documents(company_id);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ATTACHMENTS (polymorphic — any entity can have attachments)
-- ============================================================

CREATE TABLE attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL,   -- 'Project', 'Lead', 'Estimate', 'Client', etc.
  entity_id    UUID NOT NULL,
  filename     TEXT,
  url          TEXT,
  file_type    TEXT,
  file_size    INTEGER,
  uploaded_by  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);

CREATE TRIGGER attachments_updated_at
  BEFORE UPDATE ON attachments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- COMMENTS (polymorphic — any entity can have comments)
-- ============================================================

CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,   -- 'Project', 'Lead', 'Estimate', 'Client', etc.
  entity_id     UUID NOT NULL,
  content       TEXT NOT NULL,
  author_name   TEXT,
  author_email  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);

CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   TEXT NOT NULL,
  title        TEXT,
  message      TEXT,
  type         TEXT,
  read         BOOLEAN DEFAULT FALSE,
  entity_type  TEXT,
  entity_id    UUID,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user_email ON notifications(user_email);
CREATE INDEX idx_notifications_read       ON notifications(read);

CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CHAT MESSAGES
-- ============================================================

CREATE TABLE chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT NOT NULL DEFAULT 'general',
  content       TEXT,
  author_name   TEXT,
  author_email  TEXT,
  file_url      TEXT,
  file_name     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_channel    ON chat_messages(channel);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

CREATE TRIGGER chat_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS on all tables. You must add policies that match
-- your Supabase auth strategy (user_id column, org scoping, etc.)
-- The default policy below grants full access to authenticated users.
-- ============================================================

ALTER TABLE company_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees                ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipalities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_follow_ups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE draws                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cost_breakdowns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials                ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_allowances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visits              ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_updates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_inspection_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_sheets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_sheet_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages            ENABLE ROW LEVEL SECURITY;

-- Default: authenticated users have full access to all tables.
-- Replace with more granular policies (e.g. per-org scoping) as needed.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'company_profiles','employees','clients','municipalities','subcontractors',
    'leads','lead_follow_ups','contact_history','projects','estimate_templates',
    'estimates','estimate_versions','line_items','invoices','payments','draws',
    'change_orders','job_cost_breakdowns','tasks','todo_items','materials',
    'selection_allowances','site_visits','permit_updates','permit_inspection_tasks',
    'project_photos','project_sheets','project_sheet_templates','reminders',
    'calendar_events','documents','attachments','comments','notifications',
    'chat_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON %I
       FOR ALL TO authenticated
       USING (true)
       WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
