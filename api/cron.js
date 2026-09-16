// Unified cron/utility handler — merges calendar.js and check-lead-stage-alerts.js
// to stay within Vercel Hobby plan's 12-function limit.
//
// Routes:
//   GET  /api/cron?action=calendar       → iCal feed
//   GET  /api/cron?action=stage-alerts   → lead stage alert cron

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
  'Estimate In Progress', 'Quote Delivered/Price Locked', 'Negotiating/Revising Scope',
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

module.exports = async function handler(req, res) {
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });

  const action = req.query.action;

  try {
    if (action === 'calendar') return await handleCalendar(req, res);
    if (action === 'stage-alerts') return await handleStageAlerts(req, res);
    return res.status(400).json({ error: 'action query param required: calendar or stage-alerts' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
