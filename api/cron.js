// Unified cron/utility handler — merges calendar.js and check-lead-stage-alerts.js
// to stay within Vercel Hobby plan's 12-function limit.
//
// Routes:
//   GET  /api/cron?action=calendar       → iCal feed
//   GET  /api/cron?action=stage-alerts   → lead stage alert cron
//   GET  /api/cron?action=docusign-sync  → daily backstop: sync open DocuSign
//                                          envelopes and save any signed contracts
//   GET  /api/cron?action=qb-sync        → daily backstop: pull QuickBooks changes
//                                          (webhooks do it live; see api/_lib/quickbooks.js)
//
// Messaging & Automations (api/_lib/messaging.js):
//   GET  ?action=messaging-tick       → send due drip steps (pg_cron every 5 min,
//                                       Vercel cron daily, or staff "Send now")
//   GET  ?action=messaging-status     → staff: is email / texting set up
//   POST ?action=messaging-send       → staff: one email/text to a contact
//   POST ?action=messaging-broadcast  → staff: one message to many contacts
//   GET/POST ?action=unsubscribe      → public email unsubscribe page / one-click
//   POST ?action=twilio-inbound       → Twilio: incoming text (signature checked)
//   POST ?action=twilio-status        → Twilio: delivery update
//   POST ?action=resend-webhook       → Resend: delivered/opened/bounced

const { syncEnvelope } = require('./_lib/docusign.js');
const quickbooks = require('./_lib/quickbooks.js');
const messaging = require('./_lib/messaging.js');
const { getStaffCaller, requireStaff } = require('./_lib/staffAuth.js');

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─── Shared helper ────────────────────────────────────────────────────────────

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`${path} failed: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// ─── Calendar (iCal feed) ─────────────────────────────────────────────────────

function toICSDate(dateStr, allDay) {
  if (!dateStr) return null;
  const s = String(dateStr).replace(' ', 'T').slice(0, 19);
  const [datePart, timePart = '00:00:00'] = s.split('T');
  if (allDay) return datePart.replace(/-/g, '');
  return datePart.replace(/-/g, '') + 'T' + timePart.replace(/:/g, '');
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r?\n/g, '\\n');
}

function generateICS(events) {
  const stamp = toICSDate(new Date().toISOString(), false);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clardy.io//Calendar//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Clardy.io',
    'X-WR-TIMEZONE:UTC', 'REFRESH-INTERVAL;VALUE=DURATION:PT5M', 'X-PUBLISHED-TTL:PT5M',
  ];
  for (const ev of events) {
    const start = toICSDate(ev.start_datetime, ev.all_day);
    if (!start) continue;
    const end = toICSDate(ev.end_datetime || ev.start_datetime, ev.all_day);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@clardy.io`);
    lines.push(`DTSTAMP:${stamp}`);
    if (ev.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${start}`);
      lines.push(`DTEND;VALUE=DATE:${end}`);
    } else {
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
    }
    lines.push(`SUMMARY:${esc(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    if (ev.location)    lines.push(`LOCATION:${esc(ev.location)}`);
    if (ev.event_type)  lines.push(`CATEGORIES:${esc(ev.event_type)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

async function handleCalendar(req, res) {
  const events = await supabaseFetch('calendar_events?select=*&order=start_datetime.asc');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(generateICS(events || []));
}

// ─── Lead stage alerts cron ───────────────────────────────────────────────────

const LEAD_STAGES = [
  'New Lead', 'Contact Attempted', 'Contacted', 'Appointment Scheduled',
  'Site Visit Complete', 'Design Appointment Scheduled', 'In Design',
  'Estimate In Progress', 'Quote Delivered/Price Locked', 'In Financing', 'Negotiating/Revising Scope',
  'Contract Signed/Deposit Collected (Won)', 'Lost/No Decision',
];
const WON_STATUS = 'Contract Signed/Deposit Collected (Won)';
const DEAD_LEAD_STATUSES = ['Lost/No Decision'];
const WATCH_START_INDEX = LEAD_STAGES.indexOf('Site Visit Complete');

function colorForDays(days) {
  if (days >= 5) return 'red';
  if (days >= 2) return 'yellow';
  return 'green';
}

async function handleStageAlerts(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const leads = await supabaseFetch('leads?select=id,full_name,status,status_changed_at,assigned_sales_rep,stage_alert_color');
  let checked = 0, notified = 0;

  for (const lead of leads) {
    if (lead.status === WON_STATUS || DEAD_LEAD_STATUSES.includes(lead.status)) continue;
    const stageIndex = LEAD_STAGES.indexOf(lead.status);
    if (stageIndex < WATCH_START_INDEX || !lead.status_changed_at) continue;
    checked++;

    const days = Math.floor((Date.now() - new Date(lead.status_changed_at).getTime()) / 86400000);
    const color = colorForDays(days);
    const prevColor = lead.stage_alert_color || 'green';
    if (color === prevColor) continue;

    if (lead.assigned_sales_rep) {
      const employees = await supabaseFetch(`employees?full_name=eq.${encodeURIComponent(lead.assigned_sales_rep)}&select=email&limit=1`);
      const repEmail = employees?.[0]?.email;
      if (repEmail) {
        await supabaseFetch('notifications', {
          method: 'POST',
          body: JSON.stringify({
            user_email: repEmail,
            title: `${lead.full_name} is now ${color.toUpperCase()} (${days}d in "${lead.status}")`,
            message: `${lead.full_name} has been in stage "${lead.status}" for ${days} day(s) without moving forward.`,
            type: 'reminder', read: false, entity_type: 'lead', entity_id: lead.id,
          }),
        });
        notified++;
      }
    }

    await supabaseFetch(`leads?id=eq.${lead.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ stage_alert_color: color }),
    });
  }

  return res.status(200).json({ checked, notified });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

// Catches anything the DocuSign webhook missed (webhook not allowed on the
// plan, a failed delivery, or envelopes sent before webhooks were added):
// every envelope from the last 120 days that is still open, or signed but
// without a saved copy.
async function handleDocusignSync(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const since = new Date(Date.now() - 120 * 86400000).toISOString();
  const rows = await supabaseFetch(
    `docusign_envelopes?select=*&created_at=gte.${since}` +
    `&or=(status.not.in.(completed,voided,declined),and(status.eq.completed,signed_document_url.is.null))`
  );

  let checked = 0, saved = 0;
  const errors = [];
  for (const row of rows || []) {
    try {
      const result = await syncEnvelope(row);
      checked++;
      if (result.signed_document_url && !row.signed_document_url) saved++;
    } catch (err) {
      errors.push(`${row.envelope_id}: ${err.message}`);
    }
  }
  return res.status(200).json({ checked, saved, errors });
}

// ─── Messaging & Automations ─────────────────────────────────────────────────

const isCron = (req) => !!process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;

function unsubscribePage(title, text, form) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f0eb;font-family:Georgia,serif;padding:16px">
<div style="max-width:420px;background:#fff;border-radius:12px;padding:28px;text-align:center;color:#3d3530">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1><p style="color:#7a6e66;line-height:1.5">${text}</p>${form || ''}</div></body></html>`;
}

async function handleUnsubscribe(req, res) {
  const email = messaging.readUnsubscribe(req.query);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!email) return res.status(400).send(unsubscribePage('Link not valid', 'This unsubscribe link is incomplete. Reply to any of our emails and we will take you off the list.'));
  // GET only shows a button: mail scanners open links, and must not unsubscribe anyone.
  if (req.method !== 'POST') {
    return res.status(200).send(unsubscribePage('Unsubscribe?', `Stop emails to <b>${messaging.escapeHtml(email)}</b>?`,
      `<form method="post"><button style="margin-top:8px;background:#3d3530;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:15px;cursor:pointer">Unsubscribe</button></form>`));
  }
  await messaging.optOut('email', email, 'unsubscribe');
  return res.status(200).send(unsubscribePage("You're unsubscribed", "You won't get any more of these emails."));
}

async function handleMessaging(action, req, res) {
  if (action === 'unsubscribe') return handleUnsubscribe(req, res);

  if (action === 'twilio-inbound') {
    if (!messaging.validTwilioSignature(req)) return res.status(403).send('Invalid signature');
    await messaging.handleInboundSms(req);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
  if (action === 'twilio-status') {
    await messaging.handleTwilioStatus(req).catch((err) => console.error('twilio-status', err));
    return res.status(200).end();
  }
  if (action === 'resend-webhook') {
    await messaging.handleResendWebhook(req).catch((err) => console.error('resend-webhook', err));
    return res.status(200).json({ received: true });
  }

  if (action === 'messaging-tick') {
    if (!isCron(req)) {
      // Staff can push the queue along ("Send now"); a viewer can't.
      const user = await getStaffCaller(req).catch(() => null);
      if (!user || user.isViewer) return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(200).json(await messaging.processDue({ budgetMs: isCron(req) ? 45000 : 20000 }));
  }

  const staff = await requireStaff(req, res);
  if (!staff) return;
  if (action === 'messaging-status') return res.status(200).json(messaging.status());
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  try {
    if (action === 'messaging-send') return res.status(200).json(await messaging.sendNow(body, staff.email));
    if (action === 'messaging-broadcast') return res.status(200).json(await messaging.broadcast(body, staff.email));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(400).json({ error: 'Unknown messaging action' });
}

const MESSAGING_ACTIONS = new Set([
  'messaging-tick', 'messaging-status', 'messaging-send', 'messaging-broadcast',
  'unsubscribe', 'twilio-inbound', 'twilio-status', 'resend-webhook',
]);

module.exports = async function handler(req, res) {
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });

  const action = req.query.action;

  try {
    if (MESSAGING_ACTIONS.has(action)) return await handleMessaging(action, req, res);
    if (action === 'calendar') return await handleCalendar(req, res);
    if (action === 'stage-alerts') return await handleStageAlerts(req, res);
    if (action === 'docusign-sync') return await handleDocusignSync(req, res);
    if (action === 'qb-sync') {
      if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!(await quickbooks.getConnection())) return res.status(200).json({ skipped: 'QuickBooks not connected' });
      return res.status(200).json(await quickbooks.sync({ force: true }));
    }
    return res.status(400).json({ error: 'action query param required: calendar, stage-alerts, docusign-sync, or qb-sync' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
