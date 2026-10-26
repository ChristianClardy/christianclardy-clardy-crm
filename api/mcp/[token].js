// Remote MCP server — lets Claude (claude.ai custom connector, Claude Code,
// etc.) read and write this CRM's companies/leads/clients/estimates/projects/payments
// data directly, so a conversation and Clardy.io stay in sync (same tables).
//
// Auth: the URL itself carries a long random secret as the [token] path
// segment (Vercel's file-system routing exposes it as req.query.token — see
// https://vercel.com/docs, "dynamic API routes"). No OAuth server needed —
// there's exactly one legitimate caller (Christian), so a path secret is
// enough; a query-string token would violate the MCP spec's ban on tokens in
// query params, which is why it's a path segment instead. Set MCP_ACCESS_TOKEN
// in Vercel's Production env vars (never VITE_-prefixed — must never reach
// the browser bundle) and give Claude the full URL
// https://<domain>/api/mcp/<token>, Authentication: None, when adding the
// connector.
//
// Uses the service-role key like every other api/ function in this repo
// (see api/docusign-send.js) — bypasses RLS the same way the rest of the app
// already effectively does (this repo's tables use USING(true) RLS; real
// scoping is client-side only, src/lib/companyScope.js). Nothing here is a
// new trust boundary beyond "you have the secret URL."

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { sbList, sbGetById, sbInsert, sbUpdate } = require('../_lib/supabaseAdmin.js');

function textResult(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}
function errorResult(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
}

// Lets every tool take a company by name ("Turfn Texas") or id. Exact name
// match wins, then a unique partial match; anything ambiguous or unknown is an
// error that lists the real companies, so a record never silently lands in
// the default company (the inherit_company_id() trigger's fallback).
async function resolveCompanyId(company) {
  if (!company) return undefined;
  const rows = await sbList('company_profiles', { select: 'id,name,code', limit: 500 });
  const needle = company.trim().toLowerCase();
  const byId = rows.find((r) => r.id === company.trim());
  if (byId) return byId.id;
  const exact = rows.filter((r) => r.name?.toLowerCase() === needle || r.code?.toLowerCase() === needle);
  if (exact.length === 1) return exact[0].id;
  const partial = rows.filter((r) => r.name?.toLowerCase().includes(needle));
  if (exact.length === 0 && partial.length === 1) return partial[0].id;
  const names = rows.map((r) => r.name).join(', ');
  throw new Error(partial.length > 1 || exact.length > 1
    ? `"${company}" matches more than one company (${(exact.length ? exact : partial).map((r) => r.name).join(', ')}). Be more specific.`
    : `No company named "${company}". Existing companies: ${names}. Use create_company to add it.`);
}

// Swaps a tool's `company` input for the company_id column.
async function withCompany({ company, ...rest }) {
  const company_id = await resolveCompanyId(company);
  return company_id ? { ...rest, company_id } : rest;
}

const companyInput = z.string().optional().describe('Company name or id this record belongs to (see list_companies). If omitted on create, it falls back to the linked job/client\'s company, then Principle Outdoor Living.');
const companyFilter = z.string().optional().describe('Only records for this company (name or id)');
const PROJECT_STATUSES = ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'];

function buildServer() {
  const server = new McpServer({ name: 'clardy-crm', version: '1.0.0' });

  // ── Leads ────────────────────────────────────────────────────────────────
  server.registerTool('list_leads', {
    description: 'List leads, optionally filtered by status or a text search across name/email/phone. Use list_lead_statuses to see the exact status strings in use.',
    inputSchema: {
      status: z.string().optional().describe('Exact match against leads.status — call list_lead_statuses first if unsure of the exact wording'),
      search: z.string().optional().describe('Matches against full_name, email, or phone'),
      company: companyFilter,
      limit: z.number().int().positive().max(200).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ status, search, company, limit }) => {
    try {
      const filters = {};
      const companyId = await resolveCompanyId(company);
      if (companyId) filters.company_id = `eq.${companyId}`;
      if (status) filters.status = `eq.${status}`;
      if (search) filters.or = `(full_name.ilike.*${search}*,email.ilike.*${search}*,phone.ilike.*${search}*)`;
      const rows = await sbList('leads', { filters, order: 'created_at.desc', limit: limit || 50 });
      return textResult(rows);
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('list_lead_statuses', {
    description: 'List the distinct status/stage strings actually in use on leads right now (this CRM\'s lead stages have evolved over time, so there\'s no fixed enum — check here before filtering or setting a status).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      const rows = await sbList('leads', { select: 'status', limit: 1000 });
      const statuses = [...new Set(rows.map((r) => r.status).filter(Boolean))].sort();
      return textResult(statuses);
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('get_lead', {
    description: 'Get a single lead by id.',
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    try {
      const row = await sbGetById('leads', id);
      return row ? textResult(row) : errorResult(new Error('Lead not found.'));
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('create_lead', {
    description: 'Create a new lead, optionally for a specific company (e.g. company: "Turfn Texas").',
    inputSchema: {
      full_name: z.string(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      project_type: z.string().optional(),
      project_description: z.string().optional(),
      lead_source: z.string().optional(),
      assigned_sales_rep: z.string().optional(),
      notes: z.string().optional(),
      status: z.string().optional().describe('Call list_lead_statuses first if unsure of the exact wording — defaults to whatever the DB default is if omitted'),
      company: companyInput,
    },
    annotations: { destructiveHint: false },
  }, async (input) => {
    try { return textResult(await sbInsert('leads', await withCompany(input))); } catch (err) { return errorResult(err); }
  });

  server.registerTool('update_lead', {
    description: 'Update fields on an existing lead (e.g. move its status/stage, add notes).',
    inputSchema: {
      id: z.string(),
      full_name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      project_type: z.string().optional(),
      project_description: z.string().optional(),
      next_action: z.string().optional(),
      notes: z.string().optional(),
      status: z.string().optional().describe('Call list_lead_statuses first if unsure of the exact wording'),
      company: z.string().optional().describe('Move the lead to this company (name or id)'),
    },
    annotations: { destructiveHint: true },
  }, async ({ id, ...patch }) => {
    try { return textResult(await sbUpdate('leads', id, await withCompany(patch))); } catch (err) { return errorResult(err); }
  });

  // ── Clients ──────────────────────────────────────────────────────────────
  server.registerTool('list_clients', {
    description: 'List clients (contact book), optionally text-searched by name/email/phone/company.',
    inputSchema: { search: z.string().optional(), company: companyFilter, limit: z.number().int().positive().max(200).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ search, company, limit }) => {
    try {
      const filters = {};
      const companyId = await resolveCompanyId(company);
      if (companyId) filters.company_id = `eq.${companyId}`;
      if (search) filters.or = `(name.ilike.*${search}*,email.ilike.*${search}*,phone.ilike.*${search}*,company.ilike.*${search}*)`;
      const rows = await sbList('clients', { filters, order: 'created_at.desc', limit: limit || 50 });
      return textResult(rows);
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('get_client', {
    description: 'Get a single client by id.',
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    try {
      const row = await sbGetById('clients', id);
      return row ? textResult(row) : errorResult(new Error('Client not found.'));
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('create_client', {
    description: 'Create a client (contact book entry), optionally for a specific company. Check list_clients first to avoid duplicates.',
    inputSchema: {
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
      linked_lead_id: z.string().optional().describe('Lead this contact came from, if any'),
      company: companyInput,
    },
    annotations: { destructiveHint: false },
  }, async (input) => {
    try {
      const client = await sbInsert('clients', { status: 'active', ...(await withCompany(input)) });
      if (input.linked_lead_id) await sbUpdate('leads', input.linked_lead_id, { linked_contact_id: client.id });
      return textResult(client);
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('update_client', {
    description: 'Update fields on an existing client, including moving it to another company.',
    inputSchema: {
      id: z.string(),
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
      status: z.string().optional(),
      company: z.string().optional().describe('Move the client to this company (name or id)'),
    },
    annotations: { destructiveHint: true },
  }, async ({ id, ...patch }) => {
    try { return textResult(await sbUpdate('clients', id, await withCompany(patch))); } catch (err) { return errorResult(err); }
  });

  // ── Estimates / proposals ───────────────────────────────────────────────
  server.registerTool('list_estimates', {
    description: "List estimates — this is what Christian calls a 'proposal' once it's sent to a client; there's no separate proposals table.",
    inputSchema: {
      client_id: z.string().optional(),
      status: z.string().optional().describe('e.g. draft, sent, approved — free text, matches the estimates.status column'),
      company: companyFilter,
      limit: z.number().int().positive().max(200).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ client_id, status, company, limit }) => {
    try {
      const filters = {};
      const companyId = await resolveCompanyId(company);
      if (companyId) filters.company_id = `eq.${companyId}`;
      if (client_id) filters.client_id = `eq.${client_id}`;
      if (status) filters.status = `eq.${status}`;
      const rows = await sbList('estimates', { filters, order: 'created_at.desc', limit: limit || 50 });
      return textResult(rows);
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('get_estimate', {
    description: 'Get an estimate (proposal) by id, including its line items.',
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    try {
      const estimate = await sbGetById('estimates', id);
      if (!estimate) return errorResult(new Error('Estimate not found.'));
      // Line items live directly on estimates.line_items (JSONB) in practice —
      // confirmed against real data, every estimate has this populated. The
      // separate estimate_versions/line_items relational tables exist for
      // locked/versioned estimates but are empty for most rows, so they're
      // included only as an optional enrichment when present.
      const versions = await sbList('estimate_versions', { filters: { linked_estimate_id: `eq.${id}`, active_version: 'eq.true' }, limit: 1 });
      const activeVersion = versions[0] || null;
      return textResult({ estimate, line_items: estimate.line_items || [], active_version: activeVersion });
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('create_estimate', {
    description: 'Create a new estimate (proposal) header for a client. Line items are managed in the app for now.',
    inputSchema: {
      client_id: z.string(),
      title: z.string(),
      project_id: z.string().optional(),
      project_type: z.string().optional(),
      issue_date: z.string().optional().describe('YYYY-MM-DD'),
      expiry_date: z.string().optional().describe('YYYY-MM-DD'),
      terms: z.string().optional(),
      notes: z.string().optional(),
      status: z.string().optional(),
      company: companyInput,
    },
    annotations: { destructiveHint: false },
  }, async (input) => {
    try { return textResult(await sbInsert('estimates', await withCompany(input))); } catch (err) { return errorResult(err); }
  });

  server.registerTool('update_estimate', {
    description: 'Update fields on an existing estimate (proposal) header, e.g. its status, terms, or notes.',
    inputSchema: {
      id: z.string(),
      title: z.string().optional(),
      status: z.string().optional(),
      issue_date: z.string().optional(),
      expiry_date: z.string().optional(),
      terms: z.string().optional(),
      notes: z.string().optional(),
    },
    annotations: { destructiveHint: true },
  }, async ({ id, ...patch }) => {
    try { return textResult(await sbUpdate('estimates', id, patch)); } catch (err) { return errorResult(err); }
  });

  // ── Projects ─────────────────────────────────────────────────────────────
  server.registerTool('list_projects', {
    description: 'List projects, optionally filtered by client or status (planning, in_progress, on_hold, completed, cancelled).',
    inputSchema: {
      client_id: z.string().optional(),
      status: z.enum(PROJECT_STATUSES).optional(),
      company: companyFilter,
      limit: z.number().int().positive().max(200).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ client_id, status, company, limit }) => {
    try {
      const filters = {};
      const companyId = await resolveCompanyId(company);
      if (companyId) filters.company_id = `eq.${companyId}`;
      if (client_id) filters.client_id = `eq.${client_id}`;
      if (status) filters.status = `eq.${status}`;
      const rows = await sbList('projects', { filters, order: 'created_at.desc', limit: limit || 50 });
      return textResult(rows);
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('get_project', {
    description: 'Get a single project by id.',
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    try {
      const row = await sbGetById('projects', id);
      return row ? textResult(row) : errorResult(new Error('Project not found.'));
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('create_project', {
    description: 'Create a project (job), optionally for a specific company. Link it to a client with client_id (create_client first if needed).',
    inputSchema: {
      name: z.string(),
      client_id: z.string().optional(),
      company: companyInput,
      status: z.enum(PROJECT_STATUSES).optional().describe('Defaults to planning'),
      contract_value: z.number().optional(),
      address: z.string().optional(),
      description: z.string().optional(),
      project_manager: z.string().optional(),
      start_date: z.string().optional().describe('YYYY-MM-DD'),
      end_date: z.string().optional().describe('YYYY-MM-DD'),
      notes: z.string().optional(),
    },
    annotations: { destructiveHint: false },
  }, async (input) => {
    try {
      const payload = { status: 'planning', ...(await withCompany(input)) };
      // Same fallback the app's lead conversion uses: the client's company.
      if (!payload.company_id && payload.client_id) {
        const client = await sbGetById('clients', payload.client_id, 'company_id');
        if (client?.company_id) payload.company_id = client.company_id;
      }
      return textResult(await sbInsert('projects', payload));
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('update_project', {
    description: 'Update fields on an existing project, e.g. status, dates, project manager, notes.',
    inputSchema: {
      id: z.string(),
      status: z.enum(PROJECT_STATUSES).optional(),
      project_manager: z.string().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      percent_complete: z.number().optional(),
      contract_value: z.number().optional(),
      notes: z.string().optional(),
      company: z.string().optional().describe('Move the project to this company (name or id)'),
    },
    annotations: { destructiveHint: true },
  }, async ({ id, ...patch }) => {
    try { return textResult(await sbUpdate('projects', id, await withCompany(patch))); } catch (err) { return errorResult(err); }
  });

  // ── Payments & finance ───────────────────────────────────────────────────
  server.registerTool('list_invoices', {
    description: 'List invoices, optionally filtered by project.',
    inputSchema: { project_id: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ project_id, limit }) => {
    try {
      const filters = {};
      if (project_id) filters.linked_job_id = `eq.${project_id}`;
      const rows = await sbList('invoices', { filters, order: 'created_at.desc', limit: limit || 50 });
      return textResult(rows);
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('list_payments', {
    description: 'List payments received, optionally filtered by project.',
    inputSchema: { project_id: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ project_id, limit }) => {
    try {
      const filters = {};
      if (project_id) filters.linked_job_id = `eq.${project_id}`;
      const rows = await sbList('payments', { filters, order: 'payment_date.desc', limit: limit || 50 });
      return textResult(rows);
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('record_payment', {
    description: 'Record a payment received against a project.',
    inputSchema: {
      project_id: z.string(),
      amount_received: z.number(),
      payment_date: z.string().optional().describe('YYYY-MM-DD, defaults to today if omitted'),
      payment_method: z.string().optional(),
      reference_number: z.string().optional(),
      notes: z.string().optional(),
    },
    annotations: { destructiveHint: false },
  }, async ({ project_id, ...rest }) => {
    try {
      const payload = { linked_job_id: project_id, payment_date: new Date().toISOString().slice(0, 10), ...rest };
      return textResult(await sbInsert('payments', payload));
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('list_draws', {
    description: 'List payment draws (milestone billing) for a project.',
    inputSchema: { project_id: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ project_id, limit }) => {
    try {
      const filters = {};
      if (project_id) filters.project_id = `eq.${project_id}`;
      const rows = await sbList('draws', { filters, order: 'draw_number.asc', limit: limit || 100 });
      return textResult(rows);
    } catch (err) { return errorResult(err); }
  });

  // ── Companies ────────────────────────────────────────────────────────────
  server.registerTool('list_companies', {
    description: "List Christian's business brands (company_profiles). Every create/list tool also accepts a company name directly, so this is mostly for checking what exists. is_active=false means archived.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try { return textResult(await sbList('company_profiles', { select: 'id,name,code,address,phone,email,is_active', order: 'name.asc' })); }
    catch (err) { return errorResult(err); }
  });

  server.registerTool('create_company', {
    description: 'Add a new business brand (company), the same as Settings → Companies → Add Company. It shows up in the sidebar company switcher right away.',
    inputSchema: {
      name: z.string(),
      code: z.string().optional().describe('Short code, e.g. "TT"'),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      website: z.string().optional(),
      license_number: z.string().optional(),
      notes: z.string().optional(),
    },
    annotations: { destructiveHint: false },
  }, async (input) => {
    try {
      const existing = await sbList('company_profiles', { select: 'id,name,is_active', limit: 500 });
      const dup = existing.find((r) => r.name?.trim().toLowerCase() === input.name.trim().toLowerCase());
      if (dup) return errorResult(new Error(`A company named "${dup.name}" already exists (id ${dup.id}${dup.is_active === false ? ', archived' : ''}).`));
      return textResult(await sbInsert('company_profiles', { ...input, is_active: true }));
    } catch (err) { return errorResult(err); }
  });

  server.registerTool('update_company', {
    description: 'Update a company\'s details, or archive/unarchive it with is_active.',
    inputSchema: {
      company: z.string().describe('Company name or id'),
      name: z.string().optional(),
      code: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      website: z.string().optional(),
      license_number: z.string().optional(),
      notes: z.string().optional(),
      is_active: z.boolean().optional().describe('false archives it (hides its records everywhere, including "All")'),
    },
    annotations: { destructiveHint: true },
  }, async ({ company, ...patch }) => {
    try { return textResult(await sbUpdate('company_profiles', await resolveCompanyId(company), patch)); }
    catch (err) { return errorResult(err); }
  });

  return server;
}

module.exports = async function handler(req, res) {
  const token = req.query?.token;
  if (!process.env.MCP_ACCESS_TOKEN || token !== process.env.MCP_ACCESS_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
};
