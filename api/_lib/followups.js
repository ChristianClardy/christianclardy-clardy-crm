// Runs lead follow-up rules and appointment reminders.
// Decisions: followupEngine.js. Delivery: messaging.js (Resend / Twilio).
// Tables: 063_followup_rules.sql. Called from api/cron.js ?action=followups-tick.
//
// Off does nothing. Dry run writes a log line and does not contact anyone.
// A staff click is always a dry run. Only the scheduled checker (CRON_SECRET)
// can send, and only for a brand whose mode is Live with the rule turned on.

const { sbFetch, sbList, sbInsert } = require('./supabaseAdmin.js');
const messaging = require('./messaging.js');
const engine = require('./followupEngine.js');

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEND_CAP = 25;

async function listPaged(table, { select = '*', filters = {}, order, pageSize = 1000, max = 5000 } = {}) {
  const rows = [];
  for (let offset = 0; offset < max; offset += pageSize) {
    const params = new URLSearchParams();
    params.set('select', select);
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue;
      params.append(key, value);
    }
    if (order) params.set('order', order);
    params.set('limit', String(pageSize));
    params.set('offset', String(offset));
    const page = await sbFetch(`${table}?${params}`);
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

function chunk(ids, size = 80) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function inFilter(ids) {
  return `in.(${ids.join(',')})`;
}

function wallStamp(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const g = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${g.year}-${g.month}-${g.day}T${g.hour}:${g.minute}:${g.second}`;
}

function chicagoDate(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: engine.DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

async function userRpc(req, name, args) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args || {}),
  });
  if (!res.ok) return { ok: false, value: null };
  return { ok: true, value: await res.json() };
}

async function assertCompanyAccess(req, companyId) {
  if (!companyId) {
    const err = new Error('Pick a company.');
    err.status = 400;
    throw err;
  }
  const owner = await userRpc(req, 'is_owner');
  if (owner.ok && owner.value === true) return;
  const access = await userRpc(req, 'can_access_company', { p_company: companyId });
  if (!access.ok || access.value !== true) {
    const err = new Error('You can only manage follow-ups for a company you are assigned to.');
    err.status = 403;
    throw err;
  }
}

async function loadBundle({ companyId, ruleId, enabledOnly }) {
  const companies = (await sbList('company_profiles', {
    select: 'id,name,is_active,phone,email,website', limit: 100,
  })).filter((c) => !engine.isArchivedCompany(c) && (!companyId || c.id === companyId));

  const companyIds = companies.map((c) => c.id);
  if (!companyIds.length) {
    return { companies, rules: [], settingsByCompany: {}, leads: [], events: [], leadsById: {}, clientsById: {}, projectsById: {}, employeesByName: {}, hasActivity: () => false, optOuts: new Set() };
  }

  const ruleFilters = { company_id: inFilter(companyIds) };
  if (enabledOnly) ruleFilters.enabled = 'eq.true';
  if (ruleId) ruleFilters.id = `eq.${ruleId}`;
  const [rules, followupSettings, messageSettings, optRows, employees] = await Promise.all([
    sbList('followup_rules', { filters: ruleFilters, limit: 500 }),
    sbList('followup_settings', { filters: { company_id: inFilter(companyIds) }, limit: 100 }),
    sbList('message_settings', { filters: { company_id: inFilter(companyIds) }, limit: 100 }),
    sbList('message_opt_outs', { select: 'channel,address', limit: 5000 }),
    sbList('employees', { select: 'full_name,email,phone', limit: 500 }),
  ]);

  const settingsByCompany = {};
  for (const row of messageSettings) settingsByCompany[row.company_id] = { ...(settingsByCompany[row.company_id] || {}), ...row };
  for (const row of followupSettings) settingsByCompany[row.company_id] = { ...(settingsByCompany[row.company_id] || {}), ...row, followup_mode: row.mode };

  const stageCompanies = [...new Set(rules.filter((r) => r.kind === 'stage_idle').map((r) => r.company_id))];
  let leads = [];
  if (stageCompanies.length) {
    // Stage is filtered in JS. The lead status enum has old and new labels,
    // and an unknown label in an IN() filter fails the whole query.
    leads = await listPaged('leads', {
      select: 'id,full_name,phone,email,status,company_id,assigned_sales_rep,linked_contact_id,status_changed_at,created_at,property_address,address,project_type',
      filters: { company_id: inFilter(stageCompanies) },
      order: 'status_changed_at.asc',
    });
  }

  const tz = engine.DEFAULT_TIMEZONE;
  const since = wallStamp(new Date(Date.now() - 2 * 86400000), tz);
  const events = rules.some((r) => r.kind === 'appointment')
    ? await sbList('calendar_events', {
      select: 'id,title,start_datetime,all_day,status,lead_id,linked_client_id,linked_project_id,project_id,company_id,assigned_to,assigned_users',
      filters: { start_datetime: `gte.${since}` },
      limit: 500,
    })
    : [];

  const projectIds = [...new Set(events.flatMap((e) => [e.linked_project_id, e.project_id]).filter(Boolean))];
  const leadIds = [...new Set([
    ...leads.map((l) => l.id),
    ...events.map((e) => e.lead_id),
  ].filter(Boolean))];

  const [projects, extraLeads] = await Promise.all([
    projectIds.length ? sbList('projects', {
      select: 'id,name,address,status,client_id,company_id,project_manager', filters: { id: inFilter(projectIds) }, limit: 1000,
    }) : [],
    extraLeadIds(leadIds, leads),
  ]);
  const clientIds = [...new Set([
    ...leads.map((l) => l.linked_contact_id),
    ...extraLeads.map((l) => l.linked_contact_id),
    ...events.map((e) => e.linked_client_id),
    ...projects.map((p) => p.client_id),
  ].filter(Boolean))];
  const clients = clientIds.length ? await sbList('clients', {
    select: 'id,name,first_name,last_name,email,phone,address', filters: { id: inFilter(clientIds) }, limit: 1000,
  }) : [];
  const allLeads = [...leads, ...extraLeads];
  const activity = await loadActivity(leads.map((l) => l.id));

  const byId = (rows) => Object.fromEntries((rows || []).map((r) => [r.id, r]));
  const employeesByName = {};
  for (const emp of employees) {
    if (emp.full_name) employeesByName[emp.full_name.trim().toLowerCase()] = emp;
  }
  const optOuts = new Set(optRows.map((o) => `${o.channel}:${o.address}`));
  const hasActivity = (leadId, anchor) => engine.activitySince(anchor, activity.get(leadId) || []);

  return {
    companies,
    rules,
    settingsByCompany,
    leads,
    events,
    leadsById: byId(allLeads),
    clientsById: byId(clients),
    projectsById: byId(projects),
    employeesByName,
    hasActivity,
    optOuts,
  };
}

async function extraLeadIds(ids, already) {
  const have = new Set(already.map((l) => l.id));
  const missing = ids.filter((id) => !have.has(id));
  if (!missing.length) return [];
  return sbList('leads', {
    select: 'id,full_name,phone,email,status,company_id,assigned_sales_rep,linked_contact_id,status_changed_at,created_at,property_address,address,project_type',
    filters: { id: inFilter(missing) },
    limit: 500,
  });
}

async function loadActivity(leadIds) {
  const map = new Map();
  const add = (leadId, row) => {
    if (!leadId) return;
    if (!map.has(leadId)) map.set(leadId, []);
    map.get(leadId).push(row);
  };
  for (const ids of chunk(leadIds)) {
    if (!ids.length) continue;
    const [history, messages] = await Promise.all([
      sbList('contact_history', {
        select: 'linked_lead_id,created_at', filters: { linked_lead_id: inFilter(ids) }, limit: 2000,
      }),
      sbList('messages', {
        select: 'lead_id,created_at,direction,sent_by', filters: { lead_id: inFilter(ids) }, limit: 2000,
      }),
    ]);
    for (const row of history) add(row.linked_lead_id, row);
    for (const row of messages) if (engine.isHumanMessage(row)) add(row.lead_id, row);
    try {
      const acts = await sbList('crm_activities', {
        select: 'lead_id,created_at', filters: { lead_id: inFilter(ids) }, limit: 2000,
      });
      for (const row of acts) add(row.lead_id, row);
    } catch (err) {
      if (!/crm_activities|schema cache|does not exist/i.test(err.message)) throw err;
    }
  }
  return map;
}

function planForCompany(bundle, company, mode, { previewRule } = {}) {
  let rules = bundle.rules.filter((r) => r.company_id === company.id);
  if (previewRule) rules = rules.map((r) => (r.id === previewRule ? { ...r, enabled: true } : r));
  return engine.buildActions({
    rules,
    companiesById: { [company.id]: company },
    settingsByCompany: bundle.settingsByCompany,
    leads: bundle.leads,
    events: bundle.events,
    leadsById: bundle.leadsById,
    clientsById: bundle.clientsById,
    projectsById: bundle.projectsById,
    employeesByName: bundle.employeesByName,
    hasActivity: bundle.hasActivity,
    optOuts: bundle.optOuts,
    now: new Date(),
    mode,
  });
}

async function claim(action, status) {
  return sbFetch('rpc/claim_followup_dispatch', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      p_dedupe_key: action.dedupeKey,
      p_company_id: action.companyId,
      p_rule_id: action.ruleId,
      p_lead_id: action.leadId,
      p_client_id: action.clientId,
      p_event_id: action.eventId,
      p_channel: action.channel,
      p_to: action.to,
      p_subject: action.subject,
      p_body: action.body,
      p_status: status,
      p_reason: action.reason,
      p_show: action.showOnTimeline !== false,
      p_expires_at: action.expiresAt,
    }),
  });
}

async function patchLog(id, data, extra = '') {
  const rows = await sbFetch(`followup_log?id=eq.${id}${extra}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  return rows?.[0] || null;
}

async function timelineMessage(logRow, action, status) {
  if (action.channel === 'todo') return null;
  const channel = action.channel.includes('sms') ? 'sms' : 'email';
  const msg = await sbInsert('messages', {
    company_id: action.companyId,
    lead_id: action.leadId,
    client_id: action.clientId,
    channel,
    direction: 'outbound',
    to_address: action.to,
    subject: action.subject,
    body: action.body,
    status,
    error: action.reason,
    sent_by: `follow-up: ${action.ruleName}`,
  });
  await patchLog(logRow.id, { message_id: msg.id });
  return msg;
}

async function createTodo(action) {
  const row = {
    title: action.subject || 'Follow up',
    notes: action.body || null,
    due_date: chicagoDate(new Date()),
    assigned_to: action.repName || null,
    priority: 'medium',
    created_by: 'follow-up',
    linked_client_id: action.clientId,
    linked_project_id: action.projectId,
    linked_calendar_event_id: action.eventId,
  };
  try {
    return await sbInsert('todo_items', row);
  } catch (err) {
    if (!/column|schema cache|Could not find/i.test(err.message)) throw err;
    return sbInsert('todo_items', {
      title: row.title, notes: row.notes, due_date: row.due_date, assigned_to: row.assigned_to, priority: 'medium', created_by: 'follow-up',
    });
  }
}

async function execute(action) {
  const initial = action.disposition === 'skip' ? 'skipped' : action.disposition === 'dry_run' ? 'dry_run' : 'queued';
  const claimed = await claim(action, initial);
  const row = claimed?.[0];
  if (!row || row.status === 'sent') return 'duplicate';
  if (row.status === 'skipped' || row.status === 'dry_run') {
    await timelineMessage(row, action, row.status).catch(() => {});
    return row.status;
  }
  if (action.disposition === 'wait') return 'queued';

  const locked = await patchLog(row.id, { status: 'sending' }, '&status=eq.queued');
  if (!locked) return 'duplicate';

  try {
    if (action.channel === 'todo') {
      const todo = await createTodo(action);
      await patchLog(row.id, { status: 'sent', todo_id: todo?.id || null, reason: 'To-do created' });
      return 'sent';
    }
    const channel = action.channel.includes('sms') ? 'sms' : 'email';
    const ctx = await messaging.loadContext({
      lead_id: action.leadId, client_id: action.clientId, project_id: action.projectId, company_id: action.companyId,
      event: action.fields.appointment_date ? { title: action.fields.appointment_title, start_utc: null } : null,
    });
    ctx.fields = { ...ctx.fields, ...action.fields };
    const msg = await messaging.deliver({
      channel, ctx, subject: action.subject, body: action.body,
      sentBy: `follow-up: ${action.ruleName}`, toOverride: action.to,
    });
    const status = msg.status === 'sent' ? 'sent' : msg.status === 'failed' ? 'failed' : 'skipped';
    await patchLog(row.id, {
      status, reason: msg.error || null, message_id: msg.id, to_address: msg.to_address || action.to,
    });
    return status;
  } catch (err) {
    if (err.retryable) {
      await patchLog(row.id, { status: 'queued', reason: err.message }).catch(() => {});
      return 'queued';
    }
    await patchLog(row.id, { status: 'failed', reason: err.message }).catch(() => {});
    return 'failed';
  }
}

async function processDue({ companyId, forceDryRun = false, budgetMs = 45000 } = {}) {
  const started = Date.now();
  await sbFetch('rpc/expire_followup_dispatches', { method: 'POST', body: '{}' }).catch(() => 0);
  const bundle = await loadBundle({ companyId, enabledOnly: true });
  const counts = { companies: 0, sent: 0, dry_run: 0, skipped: 0, queued: 0, failed: 0, duplicate: 0, already_past: 0, errors: [] };
  let sends = 0;

  for (const company of bundle.companies) {
    if (Date.now() - started > budgetMs) break;
    const saved = bundle.settingsByCompany[company.id]?.followup_mode || 'off';
    const mode = forceDryRun ? 'dry_run' : saved;
    if (mode === 'off') continue;
    counts.companies += 1;
    const { actions, alreadyPast } = planForCompany(bundle, company, mode);
    counts.already_past += alreadyPast;
    for (const action of actions) {
      if (Date.now() - started > budgetMs) break;
      if (action.disposition === 'send') {
        if (sends >= SEND_CAP) continue;
        sends += 1;
      }
      try {
        const outcome = await execute(action);
        counts[outcome] = (counts[outcome] || 0) + 1;
        if (action.disposition === 'send' && outcome === 'sent') {
          await new Promise((r) => setTimeout(r, 550));
        }
      } catch (err) {
        counts.errors.push(`${action.ruleName}: ${err.message}`);
      }
    }
  }
  return counts;
}

async function preview({ companyId, ruleId }) {
  const bundle = await loadBundle({ companyId, ruleId, enabledOnly: false });
  const company = bundle.companies[0];
  if (!company) return { matches: [], already_past: 0, mode: 'off' };
  const mode = bundle.settingsByCompany[company.id]?.followup_mode || 'off';
  const { actions, alreadyPast } = planForCompany(bundle, company, 'dry_run', { previewRule: ruleId || null });
  const wanted = ruleId ? actions.filter((a) => a.ruleId === ruleId) : actions;
  return {
    mode,
    already_past: alreadyPast,
    matches: wanted.slice(0, 50).map((a) => ({
      rule_id: a.ruleId,
      rule_name: a.ruleName,
      lead_id: a.leadId,
      client_id: a.clientId,
      name: a.name,
      stage: a.stage,
      channel: a.channel,
      disposition: a.disposition,
      reason: a.reason,
      subject: a.subject,
      body: a.body,
    })),
  };
}

module.exports = { processDue, preview, assertCompanyAccess };
