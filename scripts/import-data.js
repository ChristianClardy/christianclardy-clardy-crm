#!/usr/bin/env node
/**
 * Base44 → Supabase Data Import
 *
 * Reads all Base44 CSV exports, maps IDs and fields, then upserts
 * everything into Supabase using the service role key.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=eyJhb... node scripts/import-data.js
 *
 * CSV files expected in ~/Downloads/ (or override with CSV_DIR env var):
 *   Client_export.csv, Project_export.csv, Lead_export.csv, etc.
 */

import { createClient } from '@supabase/supabase-js';
import { parse }        from 'csv-parse/sync';
import { randomUUID }   from 'crypto';
import fs               from 'fs';
import path             from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const CSV_DIR      = process.env.CSV_DIR ?? path.join(process.env.HOME, 'Downloads');

if (!SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY env var is required.');
  console.error('Usage: SUPABASE_SERVICE_KEY=your_service_role_key node scripts/import-data.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── ID mapping ──────────────────────────────────────────────────────────────
// Every Base44 hex ID gets a consistent UUID so FK relationships survive.

const idMap = new Map();           // base44_row_id      → new UUID
const evDisplayMap = new Map();    // EV-xxx display id  → new UUID (EstimateVersions)

function newId(b44Id) {
  if (!b44Id?.trim()) return null;
  if (!idMap.has(b44Id)) idMap.set(b44Id, randomUUID());
  return idMap.get(b44Id);
}

function mapId(b44Id) {
  if (!b44Id?.trim()) return null;
  return idMap.get(b44Id) ?? null;
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function readCsv(filename) {
  const file = path.join(CSV_DIR, filename);
  if (!fs.existsSync(file)) { console.warn(`  ⚠  Not found, skipping: ${filename}`); return []; }
  const content = fs.readFileSync(file, 'utf8');
  if (content.trim().length === 0) { console.log(`  (empty file, skipping)`); return []; }
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });
  // Skip sample rows inserted by Base44
  return rows.filter(r => r.is_sample !== 'true');
}

// ─── Value coercers ──────────────────────────────────────────────────────────

const str  = v  => (v == null || v === '') ? null : String(v).trim();
const num  = v  => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const bool = v  => { if (v === 'true'  || v === true)  return true;
                      if (v === 'false' || v === false) return false;
                      return null; };
const dt   = v  => str(v);   // pass date strings as-is; Postgres parses them
const json = v  => {
  if (!v?.trim() || v.trim() === 'null') return null;
  try { return JSON.parse(v); } catch { return v; }
};

// Sanitise enum values to known sets, falling back to a default
function enumVal(v, allowed, fallback) {
  const s = str(v)?.toLowerCase();
  return allowed.includes(s) ? s : fallback;
}

const LEAD_STATUS     = ['new','contacted','qualified','proposal','won','lost'];
const PROJECT_STATUS  = ['planning','in_progress','on_hold','completed','cancelled'];
const PRIORITY        = ['low','medium','high','urgent'];
const TASK_STATUS     = ['not_started','in_progress','waiting','complete','overdue','completed','blocked'];
const EMPLOYEE_ROLE   = ['admin','project_manager','foreman','laborer','office','other'];
const COST_TYPE       = ['material','labor','equipment','subcontract','other'];
const GBB             = ['good','better','best'];

function sanitizePriority(v) {
  const s = str(v)?.toLowerCase();
  if (s === 'normal') return 'medium';
  return PRIORITY.includes(s) ? s : 'medium';
}

function sanitizeLeadStatus(v) {
  const s = str(v)?.toLowerCase();
  if (['new','new_lead','uncontacted'].includes(s))          return 'new';
  if (['contacted','reached','called'].includes(s))          return 'contacted';
  if (['qualified'].includes(s))                             return 'qualified';
  if (['proposal','sent_proposal','estimate_sent'].includes(s)) return 'proposal';
  if (['won','closed','signed','converted'].includes(s))     return 'won';
  if (['lost','dead','no_response','disqualified'].includes(s)) return 'lost';
  return 'new';
}

// ─── Upsert helper ───────────────────────────────────────────────────────────

async function upsert(table, rows, chunkSize = 250) {
  if (!rows.length) { console.log(`  (0 rows)`); return; }
  let errors = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) {
      errors++;
      console.error(`  ✗  chunk ${i}–${i + chunk.length}: ${error.message}`);
      if (errors === 1) console.error('    sample row:', JSON.stringify(chunk[0]).slice(0, 400));
    }
  }
  const ok = rows.length - errors * chunkSize;
  console.log(`  ✓  ${rows.length} rows → ${table}${errors ? ` (${errors} chunk errors)` : ''}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 1 — Register every Base44 row ID so mapId() works for FKs
// ═══════════════════════════════════════════════════════════════════════════════

function registerIds(filename) {
  const rows = readCsv(filename);
  rows.forEach(r => { if (r.id) newId(r.id); });
  return rows;
}

console.log('\n── Pass 1: registering IDs ──────────────────────────────────');

const rawCompany     = registerIds('CompanyProfile_export.csv');
const rawEmployee    = registerIds('Employee_export.csv');
const rawClient      = registerIds('Client_export.csv');
const rawMunicipality= registerIds('Municipality_export.csv');
const rawSubcontractor= registerIds('Subcontractor_export.csv');
const rawMaterial    = registerIds('Material_export.csv');
const rawLead        = registerIds('Lead_export.csv');
const rawProject     = registerIds('Project_export.csv');
const rawEstimate    = registerIds('Estimate_export.csv');
const rawEstVersion  = registerIds('EstimateVersion_export.csv');
const rawLineItem    = registerIds('LineItem_export.csv');
const rawTask        = registerIds('Task_export.csv');
const rawTodo        = registerIds('TodoItem_export.csv');
const rawPayment     = registerIds('Payment_export.csv');
const rawComment     = registerIds('Comment_export.csv');
const rawPermitUpd   = registerIds('PermitUpdate_export.csv');
const rawPermitInsp  = registerIds('PermitInspectionTask_export.csv');
const rawSheet       = registerIds('ProjectSheet_export.csv');
const rawJobCost     = registerIds('JobCostBreakdown_export.csv');

// Build EstimateVersion display-ID map (EV-xxx → UUID)
rawEstVersion.forEach(r => {
  if (r.estimate_version_id && r.id) {
    evDisplayMap.set(r.estimate_version_id, newId(r.id));
  }
});

console.log(`  Total IDs registered: ${idMap.size}`);
console.log(`  EstimateVersion display IDs: ${evDisplayMap.size}`);

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 2 — Transform & insert in dependency order
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n── Pass 2: importing tables ─────────────────────────────────');

// ── company_profiles ──────────────────────────────────────────────────────────
console.log('\ncompany_profiles');
await upsert('company_profiles', rawCompany.map(r => ({
  id:         newId(r.id),
  name:       str(r.name) ?? '(unnamed)',
  is_active:  bool(r.is_active) ?? true,
  settings:   str(r.notes) ? { notes: str(r.notes) } : {},
  created_at: dt(r.created_date),
  updated_at: dt(r.updated_date),
})));

// ── employees ─────────────────────────────────────────────────────────────────
console.log('\nemployees');
await upsert('employees', rawEmployee.map(r => ({
  id:         newId(r.id),
  full_name:  str(r.full_name) ?? '(unnamed)',
  email:      str(r.email),
  phone:      str(r.phone),
  role:       enumVal(r.role, EMPLOYEE_ROLE, 'other'),
  department: str(r.department),
  status:     enumVal(r.status, ['active','inactive'], 'active'),
  notes:      str(r.notes),
  created_at: dt(r.created_date),
  updated_at: dt(r.updated_date),
})));

// ── clients ───────────────────────────────────────────────────────────────────
console.log('\nclients');
// Step 1: insert all clients without linked_lead_id (avoids self-referential FK error)
await upsert('clients', rawClient.map(r => ({
  id:               newId(r.id),
  name:             str(r.name) ?? '(unnamed)',
  contact_person:   str(r.contact_person),
  email:            str(r.email),
  phone:            str(r.phone),
  address:          str(r.address),
  company:          str(r.company),
  notes:            str(r.notes),
  status:           str(r.status),
  sync_locked:      bool(r.sync_locked) ?? false,
  acculynx_id:      str(r.acculynx_contact_id),
  acculynx_job_id:  str(r.acculynx_job_id),
  workflow_stage:   str(r.workflow_stage),
  linked_lead_id:   null,   // set in step 2 after all clients exist
  lifetime_value:   num(r.lifetime_value),
  last_contact_date: dt(r.last_contact_date),
  follow_up_date:   dt(r.follow_up_date),
  follow_up_notes:  str(r.follow_up_notes),
  customer_type:    str(r.customer_type),
  tags:             str(r.tags),
  created_at:       dt(r.created_date),
  updated_at:       dt(r.updated_date),
})));

// ── municipalities ────────────────────────────────────────────────────────────
console.log('\nmunicipalities');
await upsert('municipalities', rawMunicipality.map(r => {
  // Pack login credentials into notes so nothing is lost
  const creds = {};
  if (r.username)                   creds.username             = r.username;
  if (r.password)                   creds.password             = r.password;
  if (r.security_question)          creds.security_question    = r.security_question;
  if (r.security_answer)            creds.security_answer      = r.security_answer;
  if (r.registered_contractor_number) creds.contractor_number  = r.registered_contractor_number;
  if (r.name_on_file)               creds.name_on_file         = r.name_on_file;
  if (r.fully_registered)           creds.fully_registered     = r.fully_registered;
  if (r.misc_info)                  creds.misc_info            = r.misc_info;
  const notes = Object.keys(creds).length ? JSON.stringify(creds) : str(r.notes);
  return {
    id:         newId(r.id),
    city:       str(r.city) ?? '(unnamed)',
    phone:      str(r.phone),
    email:      str(r.email),
    website:    str(r.login_portal),
    notes,
    created_at: dt(r.created_date),
    updated_at: dt(r.updated_date),
  };
}));

// ── subcontractors ────────────────────────────────────────────────────────────
console.log('\nsubcontractors');
await upsert('subcontractors', rawSubcontractor.map(r => ({
  id:              newId(r.id),
  name:            str(r.name) ?? '(unnamed)',
  contact_person:  str(r.contact_person),
  email:           str(r.email),
  phone:           str(r.phone),
  address:         str(r.address),
  trade:           str(r.trade_type),
  license_number:  str(r.license_number),
  insurance_exp:   dt(r.insurance_expiry),
  status:          enumVal(r.status, ['active','inactive'], 'active'),
  notes:           str(r.notes),
  created_at:      dt(r.created_date),
  updated_at:      dt(r.updated_date),
})));

// ── materials ─────────────────────────────────────────────────────────────────
console.log('\nmaterials');
await upsert('materials', rawMaterial.map(r => ({
  id:            newId(r.id),
  name:          str(r.name) ?? '(unnamed)',
  description:   str(r.description),
  category:      str(r.category),
  unit:          str(r.unit),
  supplier:      str(r.supplier),
  sku:           str(r.sku),
  material_cost: num(r.material_cost),
  labor_cost:    num(r.labor_cost),
  sub_cost:      num(r.sub_cost),
  created_at:    dt(r.created_date),
  updated_at:    dt(r.updated_date),
})));

// ── leads ─────────────────────────────────────────────────────────────────────
console.log('\nleads');
await upsert('leads', rawLead.map(r => {
  const full = str(r.full_name)
    ?? [str(r.first_name), str(r.last_name)].filter(Boolean).join(' ')
    ?? '(unnamed)';
  return {
    id:                  newId(r.id),
    full_name:           full,
    phone:               str(r.phone),
    email:               str(r.email),
    address:             str(r.property_address),
    assigned_sales_rep:  str(r.assigned_sales_rep),
    follow_up_date:      dt(r.follow_up_date),
    status:              sanitizeLeadStatus(r.status),
    lead_source:         str(r.lead_source),
    project_type:        str(r.project_type),
    next_action:         str(r.next_action),
    project_description: str(r.project_description),
    notes:               str(r.notes),
    linked_contact_id:   mapId(r.linked_contact_id),
    workflow_stage:      str(r.workflow_stage),
    created_at:          dt(r.created_date),
    updated_at:          dt(r.updated_date),
  };
}));

// Patch clients.linked_lead_id now that leads exist
console.log('\nclients (patching linked_lead_id)');
const clientLinks = rawClient
  .filter(r => str(r.linked_lead_id))
  .map(r => ({ id: newId(r.id), linked_lead_id: mapId(r.linked_lead_id) }))
  .filter(r => r.linked_lead_id);
let linkErrors = 0;
for (const row of clientLinks) {
  const { error } = await supabase.from('clients').update({ linked_lead_id: row.linked_lead_id }).eq('id', row.id);
  if (error) { linkErrors++; }
}
console.log(`  ✓  ${clientLinks.length} links patched${linkErrors ? `, ${linkErrors} errors` : ''}`);

// ── projects ──────────────────────────────────────────────────────────────────
console.log('\nprojects');
await upsert('projects', rawProject.map(r => ({
  id:               newId(r.id),
  name:             str(r.name) ?? '(unnamed)',
  description:      str(r.description),
  address:          str(r.address),
  status:           enumVal(r.status, PROJECT_STATUS, 'planning'),
  client_id:        mapId(r.client_id),
  company_id:       mapId(r.company_id),
  project_manager:  str(r.project_manager),
  percent_complete: num(r.percent_complete),
  contract_value:   num(r.total_job_value) ?? num(r.contract_value),
  costs_to_date:    num(r.costs_to_date),
  original_costs:   num(r.original_costs),
  amendment_costs:  num(r.amendment_costs),
  billed_to_date:   num(r.billed_to_date),
  start_date:       dt(r.start_date),
  end_date:         dt(r.end_date),
  acculynx_job_id:  str(r.acculynx_job_id),
  sync_locked:      bool(r.sync_locked) ?? false,
  notes:            str(r.job_notes),
  created_at:       dt(r.created_date),
  updated_at:       dt(r.updated_date),
})));

// ── estimates ─────────────────────────────────────────────────────────────────
console.log('\nestimates');
await upsert('estimates', rawEstimate.map(r => ({
  id:              newId(r.id),
  estimate_number: str(r.estimate_number),
  title:           str(r.title) ?? str(r.estimate_name) ?? '(untitled)',
  client_id:       mapId(r.client_id) ?? mapId(r.linked_contact_id),
  project_id:      mapId(r.project_id),
  project_type:    str(r.project_type),
  margin_percent:  num(r.margin_percent),
  issue_date:      dt(r.issue_date),
  expiry_date:     dt(r.expiry_date) ?? dt(r.expiration_date),
  tax_rate:        num(r.tax_rate),
  notes:           str(r.notes),
  terms:           str(r.terms),
  status:          str(r.status) ?? 'draft',
  line_items:      json(r.line_items),
  created_at:      dt(r.created_date),
  updated_at:      dt(r.updated_date),
})));

// ── estimate_versions ─────────────────────────────────────────────────────────
console.log('\nestimate_versions');
await upsert('estimate_versions', rawEstVersion.map(r => ({
  id:                   newId(r.id),
  estimate_version_id:  str(r.estimate_version_id),    // legacy display ID (EV-xxx)
  linked_estimate_id:   mapId(r.linked_estimate_id),
  project_id:           mapId(r.project_id),
  version_name:         str(r.version_name),
  version_type:         str(r.version_type),
  created_by_name:      str(r.created_by_name),
  active_version:       bool(r.active_version) ?? false,
  notes:                str(r.notes),
  subtotal_material:    num(r.subtotal_material),
  subtotal_labor:       num(r.subtotal_labor),
  subtotal_equipment:   num(r.subtotal_equipment),
  subtotal_subcontract: num(r.subtotal_subcontract),
  subtotal_other:       num(r.subtotal_other),
  subtotal_allowances:  num(r.subtotal_allowances),
  subtotal_contingency: num(r.subtotal_contingency),
  total_cost:           num(r.total_cost),
  total_price:          num(r.total_price),
  gross_profit:         num(r.gross_profit),
  gross_margin_percent: num(r.gross_margin_percent),
  created_at:           dt(r.created_date),
  updated_at:           dt(r.updated_date),
})));

// ── line_items ────────────────────────────────────────────────────────────────
console.log('\nline_items');
await upsert('line_items', rawLineItem.map(r => {
  // LineItems reference the EV display ID, not the row UUID
  const evUuid = evDisplayMap.get(r.estimate_version_id) ?? null;
  const gbb    = GBB.includes(str(r.good_better_best_tier)?.toLowerCase())
                   ? str(r.good_better_best_tier).toLowerCase()
                   : null;
  return {
    id:                    newId(r.id),
    line_item_id:          str(r.line_item_id),
    estimate_version_id:   evUuid,
    item_code:             str(r.item_code),
    item_name:             str(r.item_name) ?? '(unnamed)',
    item_description:      str(r.item_description),
    cost_type:             enumVal(r.cost_type, COST_TYPE, 'material'),
    unit_type:             str(r.unit_type),
    quantity:              num(r.quantity),
    material_unit_cost:    num(r.material_unit_cost),
    labor_unit_cost:       num(r.labor_unit_cost),
    equipment_unit_cost:   num(r.equipment_unit_cost),
    subcontract_unit_cost: num(r.subcontract_unit_cost),
    waste_percent:         num(r.waste_percent),
    base_cost:             num(r.base_cost),
    markup_percent:        num(r.markup_percent),
    sell_price:            num(r.sell_price),
    optional_flag:         bool(r.optional_flag) ?? false,
    allowance_flag:        bool(r.allowance_flag) ?? false,
    included_flag:         bool(r.included_flag) ?? true,
    good_better_best_tier: gbb,
    production_rate:       num(r.production_rate),
    labor_hours:           num(r.labor_hours),
    notes:                 str(r.notes),
    sort_order:            num(r.sort_order) ?? 0,
    created_at:            dt(r.created_date),
    updated_at:            dt(r.updated_date),
  };
}));

// ── tasks ─────────────────────────────────────────────────────────────────────
console.log('\ntasks');
await upsert('tasks', rawTask.map(r => ({
  id:                newId(r.id),
  name:              str(r.name) ?? '(unnamed)',
  project_id:        mapId(r.project_id),
  description:       str(r.description),
  status:            enumVal(r.status, TASK_STATUS, 'not_started'),
  priority:          sanitizePriority(r.priority),
  start_date:        dt(r.start_date),
  due_date:          dt(r.end_date),            // Base44 used end_date as due date
  assigned_to:       str(r.assigned_to),
  estimated_hours:   num(r.estimated_hours),
  actual_hours:      num(r.actual_hours),
  sort_order:        num(r.order) ?? 0,
  subtasks:          json(r.subtasks),
  created_at:        dt(r.created_date),
  updated_at:        dt(r.updated_date),
})));

// ── todo_items ────────────────────────────────────────────────────────────────
console.log('\ntodo_items');
await upsert('todo_items', rawTodo.map(r => ({
  id:          newId(r.id),
  title:       str(r.title) ?? '(untitled)',
  notes:       str(r.notes),
  due_date:    dt(r.due_date),
  completed:   bool(r.completed) ?? false,
  priority:    sanitizePriority(r.priority),
  assigned_to: str(r.assigned_to),
  recurring:   (str(r.recurring) && str(r.recurring) !== 'none'),
  subtasks:    json(r.subtasks),
  created_at:  dt(r.created_date),
  updated_at:  dt(r.updated_date),
})));

// ── payments ──────────────────────────────────────────────────────────────────
console.log('\npayments');
await upsert('payments', rawPayment.map(r => ({
  id:               newId(r.id),
  linked_job_id:    mapId(r.linked_job_id),
  payment_method:   str(r.payment_method),
  reference_number: str(r.payment_id),
  notes:            str(r.notes),
  payment_date:     dt(r.payment_date),
  amount_received:  num(r.amount_received),
  created_at:       dt(r.created_date),
  updated_at:       dt(r.updated_date),
})));

// ── comments ──────────────────────────────────────────────────────────────────
console.log('\ncomments');
await upsert('comments', rawComment.map(r => ({
  id:           newId(r.id),
  entity_type:  str(r.entity_type),
  entity_id:    mapId(r.entity_id),
  content:      str(r.content) ?? '',
  author_name:  str(r.author_name),
  author_email: str(r.author_email),
  created_at:   dt(r.created_date),
  updated_at:   dt(r.updated_date),
})).filter(r => r.entity_id !== null));   // skip if entity wasn't imported

// ── permit_updates ────────────────────────────────────────────────────────────
console.log('\npermit_updates');
await upsert('permit_updates', rawPermitUpd.map(r => ({
  id:          newId(r.id),
  project_id:  mapId(r.project_id),
  status:      str(r.status),
  status_date: dt(r.status_date),
  notes:       str(r.notes),
  created_at:  dt(r.created_date),
  updated_at:  dt(r.updated_date),
})));

// ── permit_inspection_tasks ───────────────────────────────────────────────────
console.log('\npermit_inspection_tasks');
await upsert('permit_inspection_tasks', rawPermitInsp.map(r => ({
  id:          newId(r.id),
  project_id:  mapId(r.project_id),
  title:       str(r.title),
  notes:       str(r.notes),
  completed:   bool(r.completed) ?? false,
  due_date:    dt(r.due_date),
  created_at:  dt(r.created_date),
  updated_at:  dt(r.updated_date),
})));

// ── project_sheets ────────────────────────────────────────────────────────────
console.log('\nproject_sheets');
await upsert('project_sheets', rawSheet.map(r => ({
  id:         newId(r.id),
  project_id: mapId(r.project_id),
  rows:       json(r.rows),
  created_at: dt(r.created_date),
  updated_at: dt(r.updated_date),
})));

// ── job_cost_breakdowns ───────────────────────────────────────────────────────
console.log('\njob_cost_breakdowns');
await upsert('job_cost_breakdowns', rawJobCost.map(r => ({
  id:         newId(r.id),
  project_id: mapId(r.project_id),
  sections:   json(r.sections),
  created_at: dt(r.created_date),
  updated_at: dt(r.updated_date),
})));

console.log('\n✅  Import complete!\n');
