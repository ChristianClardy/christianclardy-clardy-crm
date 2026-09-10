// Remote MCP server — lets Claude (claude.ai custom connector, Claude Code,
// etc.) read and write this CRM's leads/clients/estimates/projects/payments
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

function buildServer() {
  const server = new McpServer({ name: 'clardy-crm', version: '1.0.0' });

  // ── Leads ────────────────────────────────────────────────────────────────
  server.registerTool('list_leads', {
    description: 'List leads, optionally filtered by status or a text search across name/email/phone. Use list_lead_statuses to see the exact status strings in use.',
    inputSchema: {
      status: z.string().optional().describe('Exact match against leads.status — call list_lead_statuses first if unsure of the exact wording'),
      search: z.string().optional().describe('Matches against full_name, email, or phone'),
      limit: z.number().int().positive().max(200).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ status, search, limit }) => {
    try {
      const filters = {};
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
    description: 'Create a new lead.',
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
    },
    annotations: { destructiveHint: false },
  }, async (input) => {
    try { return textResult(await sbInsert('leads', input)); } catch (err) { return errorResult(err); }
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
    },
    annotations: { destructiveHint: true },
  }, async ({ id, ...patch }) => {
    try { return textResult(await sbUpdate('leads', id, patch)); } catch (err) { return errorResult(err); }
  });

  // ── Clients ──────────────────────────────────────────────────────────────
  server.registerTool('list_clients', {
    description: 'List clients (contact book), optionally text-searched by name/email/phone/company.',
    inputSchema: { search: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ search, limit }) => {
    try {
      const filters = {};
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

  // ── Estimates / proposals ───────────────────────────────────────────────
  server.registerTool('list_estimates', {
    description: "List estimates — this is what Christian calls a 'proposal' once it's sent to a client; there's no separate proposals table.",
    inputSchema: {
      client_id: z.string().optional(),
      status: z.string().optional().describe('e.g. draft, sent, approved — free text, matches the estimates.status column'),
      limit: z.number().int().positive().max(200).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ client_id, status, limit }) => {
    try {
      const filters = {};
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
    },
    annotations: { destructiveHint: false },
  }, async (input) => {
    try { return textResult(await sbInsert('estimates', input)); } catch (err) { return errorResult(err); }
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
      status: z.enum(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ client_id, status, limit }) => {
    try {
      const filters = {};
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

  server.registerTool('update_project', {
    description: 'Update fields on an existing project, e.g. status, dates, project manager, notes.',
    inputSchema: {
      id: z.string(),
      status: z.enum(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
      project_manager: z.string().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      percent_complete: z.number().optional(),
      notes: z.string().optional(),
    },
    annotations: { destructiveHint: true },
  }, async ({ id, ...patch }) => {
    try { return textResult(await sbUpdate('projects', id, patch)); } catch (err) { return errorResult(err); }
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
    description: "List Christian's business brands (company_profiles) — useful for resolving a company name to a company_id.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try { return textResult(await sbList('company_profiles', { select: 'id,name,address,phone,email', order: 'name.asc' })); }
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
