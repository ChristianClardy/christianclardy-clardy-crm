// Saves an attachment record to the DB using service role key (bypasses RLS)
// POST /api/upload-record  (application/json)

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { entity_type, entity_id, filename, url, file_type, file_size, uploaded_by, category, organization_id } = body;

    if (!entity_type || !entity_id || !url) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const record = { entity_type, entity_id, filename, url, file_type, file_size, uploaded_by, category };
    if (organization_id) record.organization_id = organization_id;

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/attachments`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(record),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      return res.status(500).json({ error: `DB insert failed: ${err}` });
    }

    const [record] = await insertRes.json();
    return res.status(200).json({ attachment: record });
  } catch (err) {
    console.error('upload-record error:', err);
    return res.status(500).json({ error: err.message });
  }
};
