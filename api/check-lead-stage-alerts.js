// Vercel Cron target: checks how long each lead has sat in its current
// pipeline stage and creates an in-app notification for the assigned sales
// rep whenever the green/yellow/red threshold changes, but only while the
// lead is in the "hot" window (Site Visit Complete through the stage before
// Won/Lost). Uses the service role key to bypass RLS, same as the other
// api/*.js functions in this project.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Mirrors src/lib/leadStages.js — duplicated here because this is a plain
// CommonJS Vercel function and can't import that ESM module. Keep both in
// sync by hand if the lead pipeline stages ever change.
const LEAD_STAGES = [
  'New Lead',
  'Contact Attempted',
  'Contacted',
  'Appointment Scheduled',
  'Site Visit Complete',
  'Design Appointment Scheduled',
  'In Design',
  'Estimate In Progress',
  'Quote Delivered/Price Locked',
  'Negotiating/Revising Scope',
  'Contract Signed/Deposit Collected (Won)',
  'Lost/No Decision',
];
const WON_STATUS = 'Contract Signed/Deposit Collected (Won)';
const DEAD_LEAD_STATUSES = ['Lost/No Decision'];
const WATCH_START_INDEX = LEAD_STAGES.indexOf('Site Visit Complete');

function colorForDays(days) {
  if (days >= 5) return 'red';
  if (days >= 2) return 'yellow';
  return 'green';
}

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

module.exports = async function handler(req, res) {
  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });
  }

  // Vercel adds this header to requests it makes to Cron Job targets. If
  // CRON_SECRET is set, require it so the endpoint can't be triggered by
  // anyone who guesses the URL.
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const leads = await supabaseFetch(
      'leads?select=id,full_name,status,status_changed_at,assigned_sales_rep,stage_alert_color'
    );

    let checked = 0;
    let notified = 0;

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
        const employees = await supabaseFetch(
          `employees?full_name=eq.${encodeURIComponent(lead.assigned_sales_rep)}&select=email&limit=1`
        );
        const repEmail = employees?.[0]?.email;

        if (repEmail) {
          await supabaseFetch('notifications', {
            method: 'POST',
            body: JSON.stringify({
              user_email: repEmail,
              title: `${lead.full_name} is now ${color.toUpperCase()} (${days}d in "${lead.status}")`,
              message: `${lead.full_name} has been in stage "${lead.status}" for ${days} day(s) without moving forward.`,
              type: 'reminder',
              read: false,
              entity_type: 'lead',
              entity_id: lead.id,
            }),
          });
          notified++;
        }
      }

      // Persist the new color even without a rep to notify, so we don't
      // re-check this lead again until it changes further.
      await supabaseFetch(`leads?id=eq.${lead.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ stage_alert_color: color }),
      });
    }

    return res.status(200).json({ checked, notified });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
