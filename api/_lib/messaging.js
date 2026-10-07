// Messaging & Automations engine: sends email (Resend) and texts (Twilio),
// runs drips, logs every message, and handles replies, STOPs, unsubscribes
// and delivery updates. Tables and enrolling triggers: 057_messaging_automations.sql.
// Routed through api/cron.js (?action=messaging-*) to stay inside Vercel's
// 12-function limit.
//
// Env: RESEND_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, CRON_SECRET,
//      APP_URL (optional, defaults to https://clardy.io)

const crypto = require('crypto');
const { sbFetch, sbList, sbGetById, sbInsert } = require('./supabaseAdmin.js');
const { buildIndex, firstId, workflowFor, startNode, fieldValue, compare } = require('./workflow.js');

const APP_URL = (process.env.APP_URL || 'https://clardy.io').replace(/\/$/, '');
const RESEND_KEY = process.env.RESEND_API_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SIGNING_SECRET = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const emailReady = () => !!RESEND_KEY;
const smsReady = () => !!(TWILIO_SID && TWILIO_TOKEN);

// ─── Addresses ───────────────────────────────────────────────────────────────

const normalizeEmail = (v) => (v ? String(v).trim().toLowerCase() : '');

// US numbers to +1XXXXXXXXXX; anything already +E.164 is kept.
function normalizePhone(v) {
  if (!v) return '';
  const s = String(v).trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+') && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);

async function isOptedOut(channel, address) {
  if (!address) return false;
  const rows = await sbList('message_opt_outs', {
    select: 'address', filters: { channel: `eq.${channel}`, address: `eq.${address}` }, limit: 1,
  });
  return rows.length > 0;
}

async function optOut(channel, address, reason) {
  if (!address) return;
  await sbFetch('message_opt_outs', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ channel, address, reason }),
  });
}

async function optIn(channel, address) {
  await sbFetch(`message_opt_outs?channel=eq.${channel}&address=eq.${encodeURIComponent(address)}`, { method: 'DELETE' });
}

// ─── Unsubscribe links ───────────────────────────────────────────────────────

const b64url = (s) => Buffer.from(s).toString('base64url');
const sign = (s) => crypto.createHmac('sha256', SIGNING_SECRET).update(s).digest('base64url').slice(0, 32);

function unsubscribeUrl(email) {
  const e = b64url(normalizeEmail(email));
  return `${APP_URL}/api/cron?action=unsubscribe&e=${e}&t=${sign(`email:${e}`)}`;
}

function readUnsubscribe(query) {
  const e = String(query.e || '');
  const t = String(query.t || '');
  const expected = sign(`email:${e}`);
  if (!e || t.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expected))) return null;
  return Buffer.from(e, 'base64url').toString('utf8');
}

// ─── Context & merge fields ──────────────────────────────────────────────────

async function getSettings(companyId) {
  if (!companyId) return { company: {} };
  const [rows, company] = await Promise.all([
    sbList('message_settings', { filters: { company_id: `eq.${companyId}` }, limit: 1 }),
    sbGetById('company_profiles', companyId, 'id,name,phone,email,website,address'),
  ]);
  return { ...(rows[0] || {}), company: company || {} };
}

// Loads whatever the message is about. The person messaged is the lead, else
// the client, else the project's client.
async function loadContext({ lead_id, client_id, project_id, company_id }) {
  const lead = lead_id ? await sbGetById('leads', lead_id) : null;
  const project = project_id ? await sbGetById('projects', project_id) : null;
  const cid = client_id || lead?.linked_contact_id || project?.client_id;
  const client = cid ? await sbGetById('clients', cid) : null;
  const companyId = project?.company_id || lead?.company_id || client?.company_id || company_id || null;
  const settings = await getSettings(companyId);
  const fullName = lead?.full_name || client?.name || [client?.first_name, client?.last_name].filter(Boolean).join(' ') || '';
  const parts = fullName.trim().split(/\s+/);
  return {
    lead, client, project, companyId, settings,
    email: normalizeEmail(lead?.email || client?.email),
    phone: normalizePhone(lead?.phone || client?.phone),
    fields: {
      first_name: client?.first_name || parts[0] || '',
      last_name: client?.last_name || (parts.length > 1 ? parts.slice(1).join(' ') : ''),
      full_name: fullName,
      email: lead?.email || client?.email || '',
      phone: lead?.phone || client?.phone || '',
      address: lead?.property_address || lead?.address || project?.address || client?.address || '',
      stage: lead?.status || '',
      project_type: lead?.project_type || '',
      rep_name: lead?.assigned_sales_rep || project?.project_manager || '',
      project_name: project?.name || '',
      project_status: project?.status ? String(project.status).replace(/_/g, ' ') : '',
      company_name: settings.from_name || settings.company?.name || '',
      company_phone: settings.company?.phone || '',
      company_email: settings.company?.email || '',
      company_website: settings.company?.website || '',
      today: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: settings.timezone || 'America/Chicago' }),
    },
  };
}

// {{first_name}} or {{first_name|there}} (fallback when blank).
function render(text, fields) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_, key, fallback) => {
    const v = fields[key.toLowerCase()];
    return v != null && String(v).trim() !== '' ? String(v) : (fallback || '').trim();
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function textToHtml(text) {
  return String(text || '').trim().split(/\n{2,}/).map((para) => {
    const html = escapeHtml(para)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#8a6d3b">$1</a>')
      .replace(/\n/g, '<br>');
    return `<p style="margin:0 0 16px">${html}</p>`;
  }).join('');
}

function emailHtml(body, settings, unsubUrl) {
  const c = settings.company || {};
  const footer = [settings.from_name || c.name, settings.email_footer || c.address].filter(Boolean).map(escapeHtml).join(' · ');
  return `<!doctype html><html><body style="margin:0;background:#f5f0eb;padding:24px 12px;font-family:Georgia,serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 28px 12px;color:#3d3530;font-size:15px;line-height:1.6">${textToHtml(body)}</div>
<div style="max-width:600px;margin:12px auto 0;text-align:center;font-size:12px;color:#a89e96;font-family:Arial,sans-serif">
${footer ? `<div>${footer}</div>` : ''}<div style="margin-top:6px"><a href="${unsubUrl}" style="color:#a89e96">Unsubscribe</a></div></div>
</body></html>`;
}

// ─── Providers ───────────────────────────────────────────────────────────────

class ProviderError extends Error {
  constructor(message, retryable) { super(message); this.retryable = retryable; }
}

async function sendEmail({ to, settings, subject, text }) {
  if (!emailReady()) throw new ProviderError('Email is not set up (RESEND_API_KEY missing).', true);
  if (!settings.from_email) throw new ProviderError('Set a From email in Automations → Settings.', true);
  const unsub = unsubscribeUrl(to);
  const fromName = (settings.from_name || settings.company?.name || '').replace(/[<>"]/g, '');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromName ? `${fromName} <${settings.from_email}>` : settings.from_email,
      to: [to],
      reply_to: settings.reply_to || undefined,
      subject: subject || '(no subject)',
      text: `${text}\n\n—\nUnsubscribe: ${unsub}`,
      html: emailHtml(text, settings, unsub),
      headers: {
        'List-Unsubscribe': `<${unsub}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(data.message || `Resend error ${res.status}`, res.status === 429 || res.status >= 500);
  return data.id;
}

async function twilio(path, { method = 'GET', form } = {}) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(data.message || `Twilio error ${res.status}`, res.status === 429 || res.status >= 500);
  return data;
}

async function sendSms({ to, settings, text }) {
  if (!smsReady()) throw new ProviderError('Texting is not set up (Twilio keys missing).', true);
  if (!settings.sms_from) throw new ProviderError('Set a Twilio number in Automations → Settings.', true);
  const from = settings.sms_from.trim();
  const data = await twilio('/Messages.json', {
    method: 'POST',
    form: {
      To: to,
      Body: text,
      ...(from.startsWith('MG') ? { MessagingServiceSid: from } : { From: normalizePhone(from) || from }),
      StatusCallback: `${APP_URL}/api/cron?action=twilio-status`,
    },
  });
  return data.sid;
}

// ─── Quiet hours (texts only) ────────────────────────────────────────────────

function hourIn(tz, date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(date));
}

function isQuiet(settings, date = new Date()) {
  const start = settings.quiet_start ?? 20;
  const end = settings.quiet_end ?? 8;
  if (start === end) return false;
  const h = hourIn(settings.timezone, date);
  return start > end ? (h >= start || h < end) : (h >= start && h < end);
}

function nextSendableTime(settings) {
  const t = new Date();
  for (let i = 0; i < 24 * 4 && isQuiet(settings, t); i++) t.setMinutes(t.getMinutes() + 15);
  return t;
}

// ─── Delivering one message ──────────────────────────────────────────────────

// Sends (or skips, with the reason logged) one email/text and logs it.
// Returns the messages row. Throws ProviderError only when it's worth retrying.
async function deliver({ channel, ctx, subject, body, sentBy, enrollment, step, nodeId, toOverride }) {
  const to = channel === 'email' ? normalizeEmail(toOverride || ctx.email) : normalizePhone(toOverride || ctx.phone);
  let text = render(body, ctx.fields);
  const subj = channel === 'email' ? render(subject, ctx.fields) : null;
  const base = {
    company_id: ctx.companyId,
    enrollment_id: enrollment?.id || null,
    sequence_id: enrollment?.sequence_id || null,
    step_id: step?.id || null,
    ...(nodeId ? { node_id: nodeId } : {}),
    lead_id: ctx.lead?.id || null,
    client_id: ctx.client?.id || null,
    project_id: ctx.project?.id || null,
    channel, direction: 'outbound', to_address: to || null, subject: subj, sent_by: sentBy || 'automation',
  };

  let skip = null;
  if (!to) skip = channel === 'email' ? 'No email address on file' : 'No valid mobile number on file';
  else if (await isOptedOut(channel, to)) skip = channel === 'email' ? 'Unsubscribed from email' : 'Texted STOP';
  if (skip) return sbInsert('messages', { ...base, body: text, status: 'skipped', error: skip });

  if (channel === 'sms' && !/\bSTOP\b/i.test(text)) {
    const prior = await sbList('messages', {
      select: 'id', filters: { channel: 'eq.sms', direction: 'eq.outbound', to_address: `eq.${to}`, status: 'not.in.(skipped,failed)' }, limit: 1,
    });
    if (!prior.length) text += '\n\nReply STOP to opt out.';
  }

  try {
    const providerId = channel === 'email'
      ? await sendEmail({ to, settings: ctx.settings, subject: subj, text })
      : await sendSms({ to, settings: ctx.settings, text });
    return sbInsert('messages', {
      ...base, body: text, status: 'sent', provider_id: providerId,
      from_address: channel === 'email' ? ctx.settings.from_email : ctx.settings.sms_from,
    });
  } catch (err) {
    if (err.retryable) throw err;
    return sbInsert('messages', { ...base, body: text, status: 'failed', error: err.message });
  }
}

// Staff sends report a send that never went out as an error, not a log line.
async function deliverOrThrow(args) {
  try {
    const row = await deliver(args);
    if (row.status === 'failed' || row.status === 'skipped') throw new Error(row.error || `Message ${row.status}`);
    return row;
  } catch (err) {
    throw new Error(err.message);
  }
}

// ─── Drips (workflows) ──────────────────────────────────────────────────────

const seqCache = new Map();
async function getSequence(id) {
  if (!seqCache.has(id)) {
    const [seq, steps] = await Promise.all([
      sbGetById('message_sequences', id),
      sbList('message_sequence_steps', { filters: { sequence_id: `eq.${id}` }, order: 'step_order.asc,created_at.asc' }),
    ]);
    const { flow, legacy } = workflowFor(seq, steps);
    seqCache.set(id, { seq, steps, flow, legacy, index: buildIndex(flow) });
  }
  return seqCache.get(id);
}

const patchEnrollment = (id, data) => sbFetch(`message_enrollments?id=eq.${id}`, {
  method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(data),
});

const isoIn = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

async function evaluateCondition(cond = {}, e, ctx) {
  if (cond.kind === 'email_opened' || cond.kind === 'email_clicked') {
    const sent = await sbList('messages', {
      select: 'status,opened_at',
      filters: { enrollment_id: `eq.${e.id}`, channel: 'eq.email', direction: 'eq.outbound', status: 'not.in.(skipped,failed)' },
      order: 'created_at.desc', limit: cond.scope === 'any' ? 50 : 1,
    });
    const hit = (m) => (cond.kind === 'email_clicked' ? m.status === 'clicked' : m.status === 'opened' || m.status === 'clicked' || !!m.opened_at);
    return sent.some(hit);
  }
  if (cond.kind === 'replied') {
    const ors = [ctx.lead && `lead_id.eq.${ctx.lead.id}`, ctx.client && `client_id.eq.${ctx.client.id}`].filter(Boolean);
    if (!ors.length) return false;
    const rows = await sbList('messages', {
      select: 'id', filters: { direction: 'eq.inbound', or: `(${ors.join(',')})`, created_at: `gte.${e.enrolled_at}` }, limit: 1,
    });
    return rows.length > 0;
  }
  if (cond.kind === 'lead_stage') return !!ctx.lead && (cond.values || []).includes(ctx.lead.status);
  if (cond.kind === 'field') return compare(fieldValue(ctx, cond.field), cond.op, cond.value);
  return false;
}

async function insertWithFallback(table, row, minimal) {
  try { return await sbInsert(table, row); } catch (err) {
    if (!/column|schema cache|Could not find/i.test(err.message)) throw err;
    return sbInsert(table, minimal);
  }
}

async function employeeEmail(name) {
  if (!name) return null;
  const rows = await sbList('employees', { select: 'email', filters: { full_name: `eq.${name}` }, limit: 1 });
  return rows[0]?.email || null;
}

// Returns a short note for the enrollment log, or throws.
async function runAction(action = {}, e, ctx) {
  const f = ctx.fields;
  const rep = ctx.lead?.assigned_sales_rep || ctx.project?.project_manager || null;
  switch (action.kind) {
    case 'set_stage': {
      if (!ctx.lead || !action.value) return 'skipped: no lead';
      // Move this enrollment's stage first, so its own "stop on stage change" doesn't end it.
      await patchEnrollment(e.id, { enrolled_stage: action.value });
      await sbFetch(`leads?id=eq.${ctx.lead.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: action.value }) });
      ctx.lead.status = action.value;
      f.stage = action.value;
      return `stage → ${action.value}`;
    }
    case 'create_task': {
      const assignee = action.assign === 'rep' ? rep : action.assign || null;
      const due = new Date(Date.now() + Number(action.due_days || 0) * 86400000).toISOString().slice(0, 10);
      const linked = { linked_client_id: ctx.client?.id || ctx.lead?.id || null, linked_project_id: ctx.project?.id || null };
      const title = render(action.title || 'Follow up with {{full_name}}', f);
      await insertWithFallback('todo_items',
        { title, notes: render(action.notes || '', f) || null, due_date: due, assigned_to: assignee, priority: action.priority || 'medium', created_by: 'automation', ...linked },
        { title, due_date: due, ...linked });
      return 'task created';
    }
    case 'notify': {
      const to = action.to === 'rep' ? await employeeEmail(rep) : action.to;
      if (!to) return 'skipped: no one to notify';
      const entity = ctx.lead ? { entity_type: 'lead', entity_id: ctx.lead.id } : ctx.client ? { entity_type: 'client', entity_id: ctx.client.id } : {};
      await sbInsert('notifications', {
        user_email: to, title: render(action.title || 'Drip update: {{full_name}}', f), message: render(action.message || '', f) || null,
        type: 'message', read: false, ...entity,
      });
      return 'notified';
    }
    case 'enroll': {
      if (!action.sequence_id || action.sequence_id === e.sequence_id) return 'skipped';
      await sbFetch('rpc/messaging_enroll', {
        method: 'POST',
        body: JSON.stringify({
          p_sequence_id: action.sequence_id, p_lead_id: e.lead_id, p_client_id: e.client_id, p_project_id: e.project_id,
          p_stage: ctx.lead?.status || e.enrolled_stage, p_by: 'automation', p_force: true,
        }),
      });
      return 'added to drip';
    }
    default:
      return 'skipped: unknown action';
  }
}

// Walks one enrollment through its workflow from where it is: sends,
// conditions and actions run straight through; a wait (or texting quiet
// hours) parks it until later. Every exit saves its position.
async function runEnrollment(e) {
  const { seq, steps, flow, legacy, index } = await getSequence(e.sequence_id);
  const finish = (extra = {}) => patchEnrollment(e.id, {
    status: 'completed', finished_at: new Date().toISOString(), next_run_at: null, in_wait: false, ...extra,
  });
  let id = seq ? startNode(e, flow, index, steps) : null;
  if (!id) return finish(e.current_node ? { last_error: 'The step they were on was removed from the drip.' } : {});

  let ctx = null;
  let inWait = !!e.in_wait;
  for (let hops = 0; hops < 25; hops++) {
    if (!id) return finish({ current_node: null, last_error: null });
    const { node, next } = index.get(id);

    if (node.type === 'end') return finish({ current_node: id, last_error: null });

    if (node.type === 'wait') {
      if (inWait) { inWait = false; id = next; continue; }  // wait is over
      return patchEnrollment(e.id, { current_node: id, in_wait: true, last_error: null, next_run_at: isoIn(Number(node.minutes) || 0) });
    }

    ctx ||= await loadContext(e);

    if (node.type === 'email' || node.type === 'sms') {
      if (node.type === 'sms' && isQuiet(ctx.settings)) {
        return patchEnrollment(e.id, { current_node: id, in_wait: false, next_run_at: nextSendableTime(ctx.settings).toISOString() });
      }
      try {
        await deliver({
          channel: node.type, ctx, subject: node.subject, body: node.body, sentBy: 'automation',
          enrollment: e, step: legacy ? { id: node.id } : null, nodeId: node.id,
        });
      } catch (err) {
        // Not set up yet, rate limited or provider down: try this node again later.
        return patchEnrollment(e.id, { current_node: id, in_wait: false, last_error: err.message, next_run_at: isoIn(30) });
      }
      id = next;
      continue;
    }

    if (node.type === 'condition') {
      const yes = await evaluateCondition(node.condition, e, ctx);
      id = firstId(yes ? node.yes : node.no, next);
      continue;
    }

    if (node.type === 'action') {
      try { await runAction(node.action, e, ctx); } catch (err) {
        return patchEnrollment(e.id, { current_node: id, in_wait: false, last_error: `Action failed: ${err.message}`, next_run_at: isoIn(30) });
      }
      id = next;
      continue;
    }

    id = next; // unknown node type: skip it
  }
  // A long run of instant steps: pick up again on the next pass.
  return patchEnrollment(e.id, { current_node: id, in_wait: false, next_run_at: new Date().toISOString() });
}

// Works through due drip steps until about `budgetMs` has passed. Resend
// allows ~2 requests a second and a Twilio number ~1 text a second, so sends
// are paced.
async function processDue({ budgetMs = 45000 } = {}) {
  const started = Date.now();
  seqCache.clear();
  let processed = 0;
  const errors = [];
  while (Date.now() - started < budgetMs) {
    const batch = await sbFetch('rpc/claim_due_enrollments', { method: 'POST', body: JSON.stringify({ p_limit: 20 }) });
    if (!batch?.length) break;
    for (const e of batch) {
      if (Date.now() - started > budgetMs) {
        // Hand unsent ones straight back instead of waiting out the 10-minute claim.
        await patchEnrollment(e.id, { next_run_at: new Date().toISOString() });
        continue;
      }
      try { await runEnrollment(e); processed++; } catch (err) {
        errors.push(`${e.id}: ${err.message}`);
        await patchEnrollment(e.id, { last_error: err.message }).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 550));
    }
  }
  return { processed, errors };
}

// ─── Staff actions ───────────────────────────────────────────────────────────

// With no contact (company_id + to only) it's a test send from Settings.
async function sendNow({ lead_id, client_id, project_id, company_id, channel, subject, body, to }, staffEmail) {
  if (!['email', 'sms'].includes(channel)) throw new Error('channel must be email or sms');
  if (!body?.trim()) throw new Error('Write a message first.');
  const ctx = await loadContext({ lead_id, client_id, project_id, company_id });
  if (channel === 'sms' && !normalizePhone(to || ctx.phone)) throw new Error('No valid mobile number for this contact.');
  if (channel === 'email' && !normalizeEmail(to || ctx.email)) throw new Error('No email address for this contact.');
  return deliverOrThrow({ channel, ctx, subject, body, sentBy: staffEmail, toOverride: to });
}

// One message to many: a one-step "broadcast" drip, so it's paced, logged and
// resumable like any other drip.
async function broadcast({ name, channel, subject, body, lead_ids = [], client_ids = [], company_id }, staffEmail) {
  if (!body?.trim()) throw new Error('Write a message first.');
  const total = lead_ids.length + client_ids.length;
  if (!total) throw new Error('No recipients selected.');
  if (total > 10000) throw new Error('Send to 10,000 or fewer at a time.');
  const seq = await sbInsert('message_sequences', {
    name: name || `Broadcast ${new Date().toLocaleDateString('en-US')}`,
    trigger_type: 'broadcast', active: true, stop_on_reply: false, stop_on_stage_change: false,
    company_id: company_id || null, created_by: staffEmail,
  });
  await sbInsert('message_sequence_steps', { sequence_id: seq.id, step_order: 0, delay_minutes: 0, channel, subject, body });
  const now = new Date().toISOString();
  const rows = [
    ...lead_ids.map((id) => ({ lead_id: id })),
    ...client_ids.map((id) => ({ client_id: id })),
  ].map((r) => ({ ...r, sequence_id: seq.id, company_id: seq.company_id, next_step: 0, next_run_at: now, enrolled_by: staffEmail }));
  for (let i = 0; i < rows.length; i += 500) {
    await sbFetch('message_enrollments', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)),
    });
  }
  return { sequence_id: seq.id, queued: rows.length };
}

// ─── Inbound & delivery webhooks ─────────────────────────────────────────────

// Twilio signs: full URL + each POST param (sorted by name) as name+value.
function validTwilioSignature(req) {
  if (!TWILIO_TOKEN) return false;
  const url = `https://${req.headers['x-forwarded-host'] || req.headers.host}${req.url}`;
  const params = req.body && typeof req.body === 'object' ? req.body : {};
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', TWILIO_TOKEN).update(data).digest('base64');
  const got = String(req.headers['x-twilio-signature'] || '');
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function findByPhone(phone) {
  const tail = last10(phone);
  if (tail.length < 10) return { leads: [], clients: [] };
  const like = `ilike.*${tail.slice(-4)}`;
  const [leads, clients] = await Promise.all([
    sbList('leads', { select: 'id,full_name,phone,company_id,assigned_sales_rep,linked_contact_id', filters: { phone: like }, limit: 200 }),
    sbList('clients', { select: 'id,name,phone,company_id', filters: { phone: like }, limit: 200 }),
  ]);
  const match = (r) => last10(r.phone) === tail;
  return { leads: leads.filter(match), clients: clients.filter(match) };
}

async function stopForReply({ leadIds, clientIds, reason }) {
  const ors = [
    ...leadIds.map((id) => `lead_id.eq.${id}`),
    ...clientIds.map((id) => `client_id.eq.${id}`),
  ];
  if (!ors.length) return;
  const active = await sbList('message_enrollments', {
    select: 'id,sequence_id', filters: { status: 'eq.active', or: `(${ors.join(',')})` }, limit: 500,
  });
  if (!active.length) return;
  const seqs = await sbList('message_sequences', {
    select: 'id,stop_on_reply', filters: { id: `in.(${[...new Set(active.map((a) => a.sequence_id))].join(',')})` },
  });
  const stopSeq = new Set(seqs.filter((s) => s.stop_on_reply).map((s) => s.id));
  const ids = active.filter((a) => stopSeq.has(a.sequence_id)).map((a) => a.id);
  if (!ids.length) return;
  await sbFetch(`message_enrollments?id=in.(${ids.join(',')})`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'stopped', stop_reason: reason, finished_at: new Date().toISOString() }),
  });
}

async function notifyRep(repName, title, message, entity) {
  if (!repName) return;
  const emp = await sbList('employees', { select: 'email', filters: { full_name: `eq.${repName}` }, limit: 1 });
  if (!emp[0]?.email) return;
  await sbInsert('notifications', { user_email: emp[0].email, title, message, type: 'message', read: false, ...entity });
}

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);
const START_WORDS = new Set(['START', 'UNSTOP', 'YES', 'OPTIN']);

async function handleInboundSms(req) {
  const p = req.body || {};
  const from = normalizePhone(p.From);
  const text = String(p.Body || '');
  const word = text.trim().toUpperCase().replace(/[^A-Z]/g, '');
  const { leads, clients } = await findByPhone(from);
  const lead = leads[0];
  const client = clients[0] || null;

  await sbInsert('messages', {
    company_id: lead?.company_id || client?.company_id || null,
    lead_id: lead?.id || null,
    client_id: client?.id || lead?.linked_contact_id || null,
    channel: 'sms', direction: 'inbound', from_address: from, to_address: p.To || null,
    body: text, status: 'received', provider_id: p.MessageSid || null,
  });

  if (STOP_WORDS.has(word)) {
    await optOut('sms', from, 'stop');
    await stopForReply({ leadIds: leads.map((l) => l.id), clientIds: clients.map((c) => c.id), reason: 'Texted STOP' });
    return;
  }
  if (START_WORDS.has(word)) { await optIn('sms', from); return; }

  const who = lead?.full_name || client?.name || from;
  await stopForReply({ leadIds: leads.map((l) => l.id), clientIds: clients.map((c) => c.id), reason: 'Replied by text' });
  await notifyRep(lead?.assigned_sales_rep, `New text from ${who}`, text.slice(0, 280),
    lead ? { entity_type: 'lead', entity_id: lead.id } : client ? { entity_type: 'client', entity_id: client.id } : {});
}

// Twilio status callback: re-read the message from Twilio rather than trust the POST.
async function handleTwilioStatus(req) {
  const sid = String(req.body?.MessageSid || '');
  if (!/^SM[0-9a-f]{32}$/i.test(sid) || !smsReady()) return;
  const msg = await twilio(`/Messages/${sid}.json`);
  const status = { delivered: 'delivered', undelivered: 'failed', failed: 'failed' }[msg.status];
  if (!status) return;
  await sbFetch(`messages?provider_id=eq.${sid}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status, error: msg.error_code ? `Twilio ${msg.error_code}: ${msg.error_message || ''}`.trim() : null }),
  });
  // 21610 = recipient has replied STOP to this number.
  if (String(msg.error_code) === '21610') await optOut('sms', normalizePhone(msg.to), 'stop');
}

// Resend webhook: only the email id is used; status is re-read from Resend.
async function handleResendWebhook(req) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const id = body.data?.email_id;
  if (!id || !emailReady() || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${RESEND_KEY}` } });
  if (!res.ok) return;
  const email = await res.json();
  const map = { delivered: 'delivered', opened: 'opened', clicked: 'clicked', bounced: 'bounced', complained: 'complained', failed: 'failed' };
  const status = map[email.last_event];
  if (!status) return;
  const patch = { status };
  if (status === 'opened' || status === 'clicked') patch.opened_at = new Date().toISOString();
  await sbFetch(`messages?provider_id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  if (status === 'bounced' || status === 'complained') {
    for (const to of [].concat(email.to || [])) await optOut('email', normalizeEmail(to), status);
  }
}

function status() {
  return { email: emailReady(), sms: smsReady(), app_url: APP_URL };
}

module.exports = {
  processDue, sendNow, broadcast, status,
  handleInboundSms, handleTwilioStatus, handleResendWebhook, validTwilioSignature,
  readUnsubscribe, optOut, normalizeEmail, escapeHtml,
};
