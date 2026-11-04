// Decisions for lead follow-ups and appointment reminders.
// No database and no sending here — api/_lib/followups.js loads rows,
// calls buildActions(), then sends. Keep the merge-field regex in step
// with render() in api/_lib/messaging.js.

const ARCHIVED_COMPANY_ID = 'a7c41e00-0000-4000-8000-000000000325';
const DEFAULT_TIMEZONE = 'America/Chicago';
const DEFAULT_QUIET_START = 20; // 8pm
const DEFAULT_QUIET_END = 8;    // 8am
const APPOINTMENT_GRACE_MINUTES = 90;
const REMINDER_STATUSES = new Set(['scheduled', 'confirmed']);

// Older leads still carry the original enum values. A rule written for the
// current stage name also covers those.
const STAGE_ALIASES = {
  new: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Contacted',
  proposal: 'Quote Delivered/Price Locked',
  won: 'Contract Signed/Deposit Collected (Won)',
  lost: 'Lost/No Decision',
};

function isArchivedCompany(company) {
  if (!company) return true;
  if (company.id === ARCHIVED_COMPANY_ID) return true;
  if (company.is_active === false) return true;
  return /^\s*archived\b/i.test(String(company.name || ''));
}

function canonicalStage(status) {
  const raw = String(status || '');
  return STAGE_ALIASES[raw] || raw;
}

function stageMatches(leadStatus, ruleStage) {
  if (!ruleStage) return false;
  return canonicalStage(leadStatus) === ruleStage || String(leadStatus || '') === ruleStage;
}

function normalizeEmail(v) {
  return v ? String(v).trim().toLowerCase() : '';
}

function normalizePhone(v) {
  if (!v) return '';
  const s = String(v).trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+') && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

function render(text, fields) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_, key, fallback) => {
    const v = fields[key.toLowerCase()];
    return v != null && String(v).trim() !== '' ? String(v) : (fallback || '').trim();
  });
}

function hourIn(tz, date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: tz || DEFAULT_TIMEZONE, hour: 'numeric', hourCycle: 'h23',
  }).format(date));
}

function quietSettings(settings = {}) {
  return {
    timezone: settings.timezone || DEFAULT_TIMEZONE,
    quiet_start: settings.quiet_start ?? DEFAULT_QUIET_START,
    quiet_end: settings.quiet_end ?? DEFAULT_QUIET_END,
  };
}

// Same window as the drip sender: no texts overnight, company time zone.
function isQuiet(settings, date = new Date()) {
  const { timezone, quiet_start: start, quiet_end: end } = quietSettings(settings);
  if (start === end) return false;
  const h = hourIn(timezone, date);
  return start > end ? (h >= start || h < end) : (h >= start && h < end);
}

function nextSendableTime(settings, date = new Date()) {
  const t = new Date(date.getTime());
  for (let i = 0; i < 24 * 4 && isQuiet(settings, t); i++) t.setMinutes(t.getMinutes() + 15);
  return t;
}

// Calendar rows store a timestamp with no time zone. The app saves the
// wall clock from the browser (Central for this business), so 3:00pm means
// 3:00pm in the company time zone, not UTC.
function wallTimeToUtc(naive, timeZone = DEFAULT_TIMEZONE) {
  if (!naive) return null;
  const s = String(naive).replace(' ', 'T').slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  const padded = s.length === 16 ? `${s}:00` : s;
  const asUtc = new Date(`${padded}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || DEFAULT_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(asUtc).map((p) => [p.type, p.value]));
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  return new Date(asUtc.getTime() - (shown - asUtc.getTime()));
}

function formatInZone(date, timeZone, options) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: timeZone || DEFAULT_TIMEZONE, ...options }).format(date);
}

function eventStartUtc(event, timeZone) {
  if (!event?.start_datetime) return null;
  let naive = event.start_datetime;
  if (event.all_day) naive = `${String(naive).slice(0, 10)}T08:00:00`;
  return wallTimeToUtc(naive, timeZone);
}

function idleDecision({ anchor, amount, unit, now, enabledAt, catchUp }) {
  const start = anchor ? new Date(anchor) : null;
  if (!start || Number.isNaN(start.getTime())) return { state: 'not_yet' };
  const ms = (Number(amount) || 0) * (unit === 'hours' ? 3600000 : 86400000);
  if (ms <= 0) return { state: 'not_yet' };
  const dueAt = new Date(start.getTime() + ms);
  if (now < dueAt) return { state: 'not_yet', dueAt };
  const opened = enabledAt ? new Date(enabledAt) : now;
  if (!catchUp && dueAt < opened) return { state: 'already_past', dueAt };
  return { state: 'due', dueAt };
}

function reminderDue({ startUtc, minutesBefore, now, graceMinutes = APPOINTMENT_GRACE_MINUTES }) {
  if (!startUtc || Number.isNaN(startUtc.getTime())) return false;
  const before = Number(minutesBefore) || 0;
  if (before <= 0) return false;
  const fireAt = startUtc.getTime() - before * 60000;
  const latest = startUtc.getTime() + graceMinutes * 60000;
  return now.getTime() >= fireAt && now.getTime() <= latest;
}

function smsPlan({ now, settings, appointmentStartUtc, graceMinutes = APPOINTMENT_GRACE_MINUTES }) {
  const q = quietSettings(settings);
  if (!isQuiet(q, now)) return { action: 'send' };
  const next = nextSendableTime(q, now);
  const quietReason = `Quiet hours (${q.timezone}) — texts wait until texting hours`;
  if (appointmentStartUtc) {
    const latest = appointmentStartUtc.getTime() + graceMinutes * 60000;
    if (next.getTime() > latest) {
      return { action: 'skip', reason: `Quiet hours (${q.timezone}) — a text would land after the appointment` };
    }
  }
  return { action: 'wait', reason: quietReason, next };
}

function dedupeKey({ mode, ruleId, leadId, eventId, anchor, channel }) {
  const who = eventId ? `event:${eventId}` : `lead:${leadId}`;
  return `${mode}:${ruleId}:${who}:${anchor || ''}:${channel}`;
}

function isHumanMessage(message) {
  if (!message) return false;
  if (message.direction === 'inbound') return true;
  const by = String(message.sent_by || '');
  if (by === 'automation' || by.startsWith('follow-up')) return false;
  return message.direction === 'outbound';
}

function activitySince(anchor, rows) {
  const t = new Date(anchor).getTime();
  return (rows || []).some((row) => {
    const at = new Date(row.created_at).getTime();
    return !Number.isNaN(at) && at > t;
  });
}

function personName(lead, client) {
  if (lead?.full_name) return lead.full_name;
  if (client?.name) return client.name;
  return [client?.first_name, client?.last_name].filter(Boolean).join(' ');
}

function buildFields({ lead, client, project, company, settings, event, repName, startUtc, now }) {
  const tz = (settings && settings.timezone) || DEFAULT_TIMEZONE;
  const fullName = personName(lead, client);
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const companyName = String((settings && settings.from_name) || company?.name || '').trim();
  return {
    first_name: client?.first_name || parts[0] || '',
    last_name: client?.last_name || (parts.length > 1 ? parts.slice(1).join(' ') : ''),
    full_name: fullName || '',
    email: lead?.email || client?.email || '',
    phone: lead?.phone || client?.phone || '',
    address: lead?.property_address || lead?.address || project?.address || client?.address || '',
    stage: lead?.status ? canonicalStage(lead.status) : '',
    project_type: lead?.project_type || '',
    rep_name: repName || '',
    project_name: project?.name || '',
    project_status: project?.status ? String(project.status).replace(/_/g, ' ') : '',
    company_name: companyName,
    company_phone: company?.phone || '',
    company_email: company?.email || '',
    company_website: company?.website || '',
    brand_name: companyName,
    brand_phone: company?.phone || '',
    appointment_title: event?.title || '',
    appointment_date: startUtc ? formatInZone(startUtc, tz, { weekday: 'long', month: 'long', day: 'numeric' }) : '',
    appointment_time: startUtc ? formatInZone(startUtc, tz, { hour: 'numeric', minute: '2-digit' }) : '',
    today: formatInZone(now, tz, { month: 'long', day: 'numeric', year: 'numeric' }),
  };
}

function channelPlan({ channel, to, settings, now, appointmentStartUtc, mode, optOuts }) {
  const kind = channel === 'sms' || channel === 'rep_sms' ? 'sms' : 'email';
  if (channel === 'todo') return { disposition: mode === 'dry_run' ? 'dry_run' : 'send', reason: null };
  if (!to) {
    const who = channel.startsWith('rep_') ? 'rep' : 'customer';
    return {
      disposition: 'skip',
      reason: kind === 'email' ? `No email address on file for the ${who}` : `No valid mobile number on file for the ${who}`,
    };
  }
  if (optOuts && optOuts.has(`${kind}:${to}`)) {
    return { disposition: 'skip', reason: kind === 'email' ? 'Unsubscribed from email' : 'Texted STOP' };
  }
  if (kind === 'sms') {
    const plan = smsPlan({ now, settings, appointmentStartUtc });
    if (plan.action === 'skip') return { disposition: 'skip', reason: plan.reason };
    if (plan.action === 'wait') {
      if (mode === 'dry_run') return { disposition: 'dry_run', reason: `${plan.reason} (dry run, nothing sent)` };
      return { disposition: 'wait', reason: plan.reason };
    }
  }
  if (mode === 'dry_run') return { disposition: 'dry_run', reason: 'Dry run — nothing sent' };
  return { disposition: 'send', reason: null };
}

function pushChannel(actions, base, spec) {
  const plan = channelPlan({
    channel: spec.channel,
    to: spec.to,
    settings: base.settings,
    now: base.now,
    appointmentStartUtc: base.startUtc,
    mode: base.mode,
    optOuts: base.optOuts,
  });
  const subject = spec.subject ? render(spec.subject, base.fields) : null;
  const body = render(spec.body || '', base.fields);
  actions.push({
    ...plan,
    channel: spec.channel,
    to: spec.to || null,
    subject,
    body,
    dedupeKey: dedupeKey({
      mode: base.mode, ruleId: base.rule.id, leadId: base.leadId, eventId: base.eventId, anchor: base.anchor, channel: spec.channel,
    }),
    companyId: base.companyId,
    ruleId: base.rule.id,
    ruleName: base.rule.name,
    leadId: base.leadId || null,
    clientId: base.clientId || null,
    eventId: base.eventId || null,
    projectId: base.projectId || null,
    fields: base.fields,
    expiresAt: base.expiresAt || null,
    showOnTimeline: true,
    repName: base.repName || null,
    name: base.fields.full_name || base.fields.appointment_title || 'Appointment',
    stage: base.fields.stage || null,
  });
}

function blankChannel(actions, base, channel, reason) {
  actions.push({
    disposition: 'skip',
    reason,
    channel,
    to: null,
    subject: null,
    body: '',
    dedupeKey: dedupeKey({
      mode: base.mode, ruleId: base.rule.id, leadId: base.leadId, eventId: base.eventId, anchor: base.anchor, channel,
    }),
    companyId: base.companyId,
    ruleId: base.rule.id,
    ruleName: base.rule.name,
    leadId: base.leadId || null,
    clientId: base.clientId || null,
    eventId: base.eventId || null,
    projectId: base.projectId || null,
    fields: base.fields,
    expiresAt: base.expiresAt || null,
    showOnTimeline: true,
    repName: base.repName || null,
    name: base.fields.full_name || 'Appointment',
    stage: base.fields.stage || null,
  });
}

function customerTargets(rule, base) {
  if (rule.send_email) {
    if (!(rule.email_body || '').trim()) blankChannel(base.actions, base, 'email', 'No email message written on this rule');
    else pushChannel(base.actions, base, { channel: 'email', to: base.email, subject: rule.email_subject, body: rule.email_body });
  }
  if (rule.send_sms) {
    if (!(rule.sms_body || '').trim()) blankChannel(base.actions, base, 'sms', 'No text message written on this rule');
    else pushChannel(base.actions, base, { channel: 'sms', to: base.phone, body: rule.sms_body });
  }
  if (rule.create_todo) {
    pushChannel(base.actions, base, {
      channel: 'todo', subject: rule.todo_title || 'Follow up with {{full_name}}', body: rule.todo_notes || '',
    });
  }
}

function repTargets(rule, base) {
  if (!rule.notify_rep) return;
  const how = rule.notify_rep_channel || 'email';
  if (how === 'email' || how === 'both') {
    pushChannel(base.actions, base, {
      channel: 'rep_email',
      to: base.repEmail,
      subject: rule.rep_email_subject || 'Upcoming: {{full_name}} {{appointment_date}}',
      body: rule.rep_email_body || '{{full_name}} — {{appointment_title|appointment}} {{appointment_date}} at {{appointment_time}}.',
    });
  }
  if (how === 'sms' || how === 'both') {
    if (rule.rep_sms_body != null && !String(rule.rep_sms_body).trim()) {
      blankChannel(base.actions, base, 'rep_sms', 'No text message written for the rep');
    } else {
      pushChannel(base.actions, base, {
        channel: 'rep_sms',
        to: base.repPhone,
        body: rule.rep_sms_body || '{{full_name}} — {{appointment_title|appointment}} at {{appointment_time}}.',
      });
    }
  }
}

function lookupEmployee(employeesByName, name) {
  if (!name) return null;
  const map = employeesByName || {};
  return map[String(name).trim().toLowerCase()] || null;
}

// Turns loaded rows into the messages/to-dos this pass should record.
// mode 'off' yields nothing. dry_run never produces a 'send'.
function buildActions({
  rules = [],
  companiesById = {},
  settingsByCompany = {},
  leads = [],
  events = [],
  leadsById = {},
  clientsById = {},
  projectsById = {},
  employeesByName = {},
  hasActivity = () => false,
  optOuts = new Set(),
  now = new Date(),
  mode = 'off',
}) {
  const actions = [];
  let alreadyPast = 0;
  if (mode !== 'live' && mode !== 'dry_run') return { actions, alreadyPast };

  const consider = (rule, company, extra) => {
    if (!rule || isArchivedCompany(company) || rule.company_id !== company.id) return;
    const settings = { ...quietSettings(settingsByCompany[company.id]), ...(settingsByCompany[company.id] || {}) };
    const lead = extra.lead || null;
    const client = extra.client || null;
    const project = extra.project || null;
    const repName = extra.repName || lead?.assigned_sales_rep || project?.project_manager || '';
    const employee = lookupEmployee(employeesByName, repName);
    const startUtc = extra.startUtc || null;
    const fields = buildFields({
      lead, client, project, company, settings, event: extra.event, repName, startUtc, now,
    });
    const base = {
      actions, rule, companyId: company.id, settings, now, mode, optOuts, fields, repName,
      leadId: lead?.id || null,
      clientId: client?.id || lead?.linked_contact_id || null,
      eventId: extra.event?.id || null,
      projectId: project?.id || null,
      email: normalizeEmail(lead?.email || client?.email),
      phone: normalizePhone(lead?.phone || client?.phone),
      repEmail: normalizeEmail(employee?.email),
      repPhone: normalizePhone(employee?.phone),
      startUtc,
      anchor: extra.anchor,
      expiresAt: extra.expiresAt || null,
    };
    customerTargets(rule, base);
    if (rule.kind === 'appointment') repTargets(rule, base);
  };

  for (const rule of rules) {
    const company = companiesById[rule.company_id];
    if (!company || isArchivedCompany(company)) continue;
    if (rule.enabled === false) continue;

    if (rule.kind === 'stage_idle') {
      for (const lead of leads) {
        if (lead.company_id !== rule.company_id) continue;
        if (!stageMatches(lead.status, rule.lead_stage)) continue;
        const anchor = lead.status_changed_at || lead.created_at;
        const decision = idleDecision({
          anchor, amount: rule.idle_amount, unit: rule.idle_unit, now,
          enabledAt: rule.enabled_at, catchUp: !!rule.catch_up,
        });
        if (decision.state === 'already_past') { alreadyPast += 1; continue; }
        if (decision.state !== 'due') continue;
        if (hasActivity(lead.id, anchor)) continue;
        const client = lead.linked_contact_id ? clientsById[lead.linked_contact_id] : null;
        consider(rule, company, { lead, client, anchor });
      }
    }

    if (rule.kind === 'appointment') {
      const settings = settingsByCompany[company.id] || {};
      const tz = settings.timezone || DEFAULT_TIMEZONE;
      for (const event of events) {
        const lead = event.lead_id ? leadsById[event.lead_id] : null;
        const project = projectsById[event.linked_project_id || event.project_id] || null;
        const companyId = event.company_id || lead?.company_id || project?.company_id || null;
        if (companyId !== rule.company_id) continue;
        const status = String(event.status || '').toLowerCase();
        if (status && !REMINDER_STATUSES.has(status)) continue;
        const clientId = event.linked_client_id || lead?.linked_contact_id || project?.client_id || null;
        const client = clientId ? clientsById[clientId] : null;
        if (!lead && !client) continue;
        const startUtc = eventStartUtc(event, tz);
        if (!reminderDue({ startUtc, minutesBefore: rule.minutes_before, now })) continue;
        const anchor = `${event.start_datetime || ''}|${event.all_day ? 'all-day' : 'timed'}`;
        const expiresAt = new Date(startUtc.getTime() + APPOINTMENT_GRACE_MINUTES * 60000).toISOString();
        const repName = event.assigned_to
          || (Array.isArray(event.assigned_users) && event.assigned_users[0])
          || lead?.assigned_sales_rep
          || project?.project_manager
          || '';
        consider(rule, company, {
          lead, client, project, event, repName, startUtc, anchor, expiresAt,
        });
      }
    }
  }

  return { actions, alreadyPast };
}

module.exports = {
  ARCHIVED_COMPANY_ID,
  DEFAULT_TIMEZONE,
  APPOINTMENT_GRACE_MINUTES,
  STAGE_ALIASES,
  isArchivedCompany,
  canonicalStage,
  stageMatches,
  normalizeEmail,
  normalizePhone,
  render,
  hourIn,
  isQuiet,
  nextSendableTime,
  wallTimeToUtc,
  eventStartUtc,
  idleDecision,
  reminderDue,
  smsPlan,
  dedupeKey,
  isHumanMessage,
  activitySince,
  buildFields,
  buildActions,
};
