import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Shared secret token check
  const calToken = process.env.CALENDAR_TOKEN;
  if (calToken && req.query.token !== calToken) {
    res.status(401).send('Unauthorized');
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { uid } = req.query;

  let userEmail = null;

  // If a user ID is provided, look up their email to filter events
  if (uid) {
    const { data: { user }, error } = await supabase.auth.admin.getUserById(uid);
    if (error || !user) {
      res.status(404).send('User not found');
      return;
    }
    userEmail = user.email;
  }

  let query = supabase
    .from('calendar_events')
    .select('*')
    .order('start_datetime', { ascending: true });

  // Filter to only this user's events if uid was provided
  if (userEmail) {
    query = query.eq('assigned_to', userEmail);
  }

  const { data: events, error } = await query;

  if (error) {
    res.status(500).send('Error fetching calendar events');
    return;
  }

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(generateICS(events || [], userEmail));
}

function toICSDate(dateStr, allDay) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (allDay) {
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }
  return d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n');
}

function generateICS(events, userEmail) {
  const calName = userEmail ? `Clardy.io – ${userEmail}` : 'Clardy.io';
  const stamp = toICSDate(new Date().toISOString(), false);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clardy.io//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calName}`,
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
    if (ev.event_type)  lines.push(`CATEGORIES:${esc(ev.event_type)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
