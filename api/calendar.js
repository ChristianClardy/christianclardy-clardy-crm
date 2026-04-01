// Uses native fetch (Node 18+) to call Supabase REST API directly.
// No imports needed — avoids all ESM/CJS module issues.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  try {
    if (!SERVICE_KEY) {
      res.status(500).send('Missing SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    // Fetch all calendar events
    const eventsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/calendar_events?select=*&order=start_datetime.asc`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Accept: 'application/json',
        },
      }
    );

    if (!eventsRes.ok) {
      res.status(500).send(`DB error: ${eventsRes.status} ${await eventsRes.text()}`);
      return;
    }

    const events = await eventsRes.json();

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(generateICS(events || []));

  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
};

function toICSDate(dateStr, allDay) {
  if (!dateStr) return null;
  // Times are stored as local (timestamp without time zone).
  // Use floating format (no Z) so Apple/Google Calendar treats them as local.
  const s = String(dateStr).replace(' ', 'T').slice(0, 19);
  const [datePart, timePart = '00:00:00'] = s.split('T');
  if (allDay) return datePart.replace(/-/g, '');
  return datePart.replace(/-/g, '') + 'T' + timePart.replace(/:/g, '');
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n');
}

function generateICS(events) {
  const stamp = toICSDate(new Date().toISOString(), false);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clardy.io//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Clardy.io',
    'X-WR-TIMEZONE:UTC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT5M',
    'X-PUBLISHED-TTL:PT5M',
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
