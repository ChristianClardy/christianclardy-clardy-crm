// POST /api/public-lead
// Accepts lead form data + org slug, looks up the org, inserts the lead with organization_id

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function findClientMatch(field, value) {
  if (!value) return null;
  const url = `${SUPABASE_URL}/rest/v1/clients?${field}=eq.${encodeURIComponent(value)}&select=id,linked_lead_id&limit=1`;
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

// Best-effort: also add this person to the contact book (clients table) and
// link it back to the lead, so leads captured from the public form show up
// in Contacts without any manual re-entry.
async function syncLeadToContact(lead) {
  if (!lead?.id) return;

  let client = (await findClientMatch('email', lead.email)) || (await findClientMatch('phone', lead.phone));

  if (!client) {
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        name: lead.full_name || 'Unknown Lead',
        email: lead.email || '',
        phone: lead.phone || '',
        address: lead.property_address || lead.address || '',
        notes: lead.notes || '',
        status: 'active',
        linked_lead_id: lead.id,
      }),
    });
    if (!createRes.ok) return;
    [client] = await createRes.json();
  } else if (!client.linked_lead_id) {
    await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${client.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ linked_lead_id: lead.id }),
    });
  }

  if (client?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ linked_contact_id: client.id }),
    });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { org, ...leadData } = body;

    let organization_id = null;

    if (org) {
      // Look up org by slug or UUID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org);
      const field = isUuid ? 'id' : 'slug';
      const orgRes = await fetch(
        `${SUPABASE_URL}/rest/v1/organizations?${field}=eq.${encodeURIComponent(org)}&select=id&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const orgRows = await orgRes.json();
      organization_id = orgRows?.[0]?.id || null;
    }

    const lead = {
      ...leadData,
      status: 'new',
      created_at: new Date().toISOString(),
      ...(organization_id ? { organization_id } : {}),
    };

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(lead),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      return res.status(500).json({ error: `DB insert failed: ${err}` });
    }

    const [createdLead] = await insertRes.json();
    try {
      await syncLeadToContact(createdLead);
    } catch (syncErr) {
      console.error('public-lead contact sync error:', syncErr);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('public-lead error:', err);
    return res.status(500).json({ error: err.message });
  }
};
