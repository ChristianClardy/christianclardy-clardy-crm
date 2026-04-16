/**
 * Supabase compatibility layer — mirrors the Base44 SDK interface so all
 * existing component code works without changes.
 *
 * Exports:
 *   - Named entity shortcuts: Project, Client, Lead, etc.
 *   - base44 object: base44.entities.*, base44.auth.*, base44.functions.invoke(), base44.integrations.Core.UploadFile()
 */

import { supabase } from '@/lib/supabase';

// ─── Entity → table name map ────────────────────────────────────────────────
const TABLE_MAP = {
  Project:                'projects',
  Client:                 'clients',
  Lead:                   'leads',
  LeadFollowUp:           'lead_follow_ups',
  ContactHistory:         'contact_history',
  Task:                   'tasks',
  TodoItem:               'todo_items',
  Employee:               'employees',
  CompanyProfile:         'company_profiles',
  Estimate:               'estimates',
  EstimateVersion:        'estimate_versions',
  EstimateTemplate:       'estimate_templates',
  LineItem:               'line_items',
  Invoice:                'invoices',
  Payment:                'payments',
  Draw:                   'draws',
  ChangeOrder:            'change_orders',
  JobCostBreakdown:       'job_cost_breakdowns',
  ProjectSheet:           'project_sheets',
  ProjectSheetTemplate:   'project_sheet_templates',
  Material:               'materials',
  SelectionAllowance:     'selection_allowances',
  SiteVisit:              'site_visits',
  PermitUpdate:           'permit_updates',
  PermitInspectionTask:   'permit_inspection_tasks',
  ProjectPhoto:           'project_photos',
  Municipality:           'municipalities',
  Subcontractor:          'subcontractors',
  Reminder:               'reminders',
  CalendarEvent:          'calendar_events',
  Document:               'documents',
  Attachment:             'attachments',
  Comment:                'comments',
  Notification:           'notifications',
  ChatMessage:            'chat_messages',
};

// ─── Field name compatibility ────────────────────────────────────────────────
// Supabase schema uses created_at / updated_at.
// Base44 code uses created_date / updated_date.
// After reading we alias both so display code using either field name works.

function mapDates(record) {
  if (!record) return record;
  return {
    ...record,
    created_date: record.created_date ?? record.created_at,
    updated_date: record.updated_date ?? record.updated_at,
  };
}

// Strip Base44-style date fields, client-only UI fields, and undefined values before writing.
// Add any column name here that exists in app state but NOT in the database schema.
const CLIENT_ONLY_FIELDS = new Set(['client_name', 'follow_up_end_time']);

// Per-table fields to strip when a schema-cache "column not found" error occurs on retry.
// These are fields the app sends that the DB might not have yet.
const TABLE_OPTIONAL_FIELDS = {
  lead_follow_ups: new Set(['title','details','assigned_to','lead_name','follow_up_type','follow_up_date','follow_up_time','status']),
  estimates: new Set(['section_margins']),
  leads: new Set(['property_address']),
  payments: new Set(['acculynx_job_id','acculynx_payment_id','payment_id','source','collected_to_date','remaining_balance']),
  projects: new Set(['collected_to_date','remaining_balance']),
  company_profiles: new Set(['invoice_company_name','invoice_logo_url','invoice_header_title','invoice_accent_color','invoice_intro_text','invoice_footer_text','invoice_scope_label','color']),
  clients: new Set(['first_name','last_name','customer_number']),
};

function cleanForWrite(record) {
  const { created_date, updated_date, created_at, updated_at, ...rest } = record;
  // Remove undefined values and UI-only fields that have no DB column
  return Object.fromEntries(
    Object.entries(rest).filter(([k, v]) => v !== undefined && !CLIENT_ONLY_FIELDS.has(k))
  );
}

// Map Base44-style sort field (e.g. "-created_date") → Supabase order params
function parseSortField(sortField) {
  if (!sortField) return null;
  const desc = sortField.startsWith('-');
  let field = desc ? sortField.slice(1) : sortField;
  // Map legacy field names to Supabase column names
  if (field === 'created_date') field = 'created_at';
  if (field === 'updated_date') field = 'updated_at';
  return { field, ascending: !desc };
}

// ─── Centralised error reporter ──────────────────────────────────────────────
// Shows a visible alert so save failures are never silent.
function reportError(op, table, error) {
  const msg = `${op} failed on "${table}": ${error?.message || error}`;
  console.error('[base44]', msg, error);
  // Use a brief timeout so React's render cycle isn't interrupted mid-update
  setTimeout(() => alert(msg), 0);
  throw error;
}

// ─── Entity factory ──────────────────────────────────────────────────────────
function createEntity(tableName) {
  return {
    /** list(sortField?, limit?) → array */
    async list(sortField, limit) {
      let query = supabase.from(tableName).select('*');
      const sort = parseSortField(sortField);
      if (sort) query = query.order(sort.field, { ascending: sort.ascending });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) reportError('list', tableName, error);
      return (data || []).map(mapDates);
    },

    /** filter(filterObj, sortField?, limit?) → array */
    async filter(filterObj, sortField, limit) {
      let query = supabase.from(tableName).select('*');
      for (const [key, val] of Object.entries(filterObj ?? {})) {
        if (val !== undefined && val !== null && val !== "null" && val !== "undefined") query = query.eq(key, val);
      }
      const sort = parseSortField(sortField);
      if (sort) query = query.order(sort.field, { ascending: sort.ascending });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) reportError('filter', tableName, error);
      return (data || []).map(mapDates);
    },

    /** get(id) → single record */
    async get(id) {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
      if (error) reportError('get', tableName, error);
      return mapDates(data);
    },

    /** create(record) → created record */
    async create(record) {
      const payload = cleanForWrite(record);
      let { data, error } = await supabase.from(tableName).insert(payload).select().single();
      // If a column is missing from the schema cache, strip optional fields and retry once
      if (error?.message?.includes('schema cache') || error?.message?.includes('Could not find')) {
        const optional = TABLE_OPTIONAL_FIELDS[tableName];
        if (optional) {
          const stripped = Object.fromEntries(Object.entries(payload).filter(([k]) => !optional.has(k)));
          ({ data, error } = await supabase.from(tableName).insert(stripped).select().single());
        }
      }
      if (error) reportError('create', tableName, error);
      return mapDates(data);
    },

    /** update(id, record) → updated record */
    async update(id, record) {
      const payload = cleanForWrite(record);
      let { data, error } = await supabase.from(tableName).update(payload).eq('id', id).select().single();
      // If a column is missing from the schema cache, strip optional fields and retry once
      if (error?.message?.includes('schema cache') || error?.message?.includes('Could not find')) {
        const optional = TABLE_OPTIONAL_FIELDS[tableName];
        if (optional) {
          const stripped = Object.fromEntries(Object.entries(payload).filter(([k]) => !optional.has(k)));
          ({ data, error } = await supabase.from(tableName).update(stripped).eq('id', id).select().single());
        }
      }
      if (error) reportError('update', tableName, error);
      return mapDates(data);
    },

    /** delete(id) */
    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) reportError('delete', tableName, error);
    },

    /**
     * subscribe(callback) → unsubscribe function
     * Fires callback whenever any row in the table changes.
     */
    subscribe(callback) {
      const channel = supabase
        .channel(`${tableName}-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, callback)
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}

// ─── Build entities map ──────────────────────────────────────────────────────
const entities = Object.fromEntries(
  Object.entries(TABLE_MAP).map(([name, table]) => [name, createEntity(table)])
);

// ─── Auth ────────────────────────────────────────────────────────────────────
const auth = {
  /** Returns the current user object shaped like Base44's user */
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      const err = new Error('Not authenticated');
      err.status = 401;
      throw err;
    }
    return {
      id:        user.id,
      email:     user.email,
      full_name: user.user_metadata?.full_name || user.email,
      role:      user.user_metadata?.role || 'user',
      ...user.user_metadata,
    };
  },

  /** Sign out and optionally redirect */
  async logout(redirectUrl) {
    await supabase.auth.signOut();
    window.location.href = redirectUrl || '/login';
  },

  /** Redirect to the login page */
  redirectToLogin() {
    window.location.href = '/login';
  },
};

// ─── Functions (Supabase Edge Functions) ─────────────────────────────────────
const functions = {
  async invoke(functionName, args = {}) {
    const { data, error } = await supabase.functions.invoke(functionName, { body: args });
    if (error) throw error;
    return { data };
  },
};

// ─── Integrations (file uploads via Supabase Storage) ────────────────────────
const STORAGE_BUCKET = 'Attachements';

const integrations = {
  Core: {
    async UploadFile({ file, entity_type, entity_id, uploaded_by, category }) {
      // Step 1: Upload file directly to Supabase Storage from the browser
      // (bypasses Vercel's 4.5MB serverless body limit)
      const ext = file.name.split('.').pop();
      const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (error) throw new Error(`Storage upload failed: ${error.message}`);

      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(data.path);

      // Step 2: Save the attachment record via server (service role bypasses RLS)
      if (entity_type && entity_id) {
        const res = await fetch('/api/upload-record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type,
            entity_id,
            filename: file.name,
            url: publicUrl,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: uploaded_by || 'Team Member',
            category: category || 'other',
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || 'Failed to save attachment record');
        }
      }

      return { file_url: publicUrl };
    },
  },
};

// ─── Main export ─────────────────────────────────────────────────────────────
export const base44 = {
  entities,
  auth,
  functions,
  integrations,
};

// Named entity exports — lets components do:
//   import { Project, Client } from '@/api/base44Client'
export const {
  Project,
  Client,
  Lead,
  LeadFollowUp,
  ContactHistory,
  Task,
  TodoItem,
  Employee,
  CompanyProfile,
  Estimate,
  EstimateVersion,
  EstimateTemplate,
  LineItem,
  Invoice,
  Payment,
  Draw,
  ChangeOrder,
  JobCostBreakdown,
  ProjectSheet,
  ProjectSheetTemplate,
  Material,
  SelectionAllowance,
  SiteVisit,
  PermitUpdate,
  PermitInspectionTask,
  ProjectPhoto,
  Municipality,
  Subcontractor,
  Reminder,
  CalendarEvent,
  Document,
  Attachment,
  Comment,
  Notification,
  ChatMessage,
} = entities;
