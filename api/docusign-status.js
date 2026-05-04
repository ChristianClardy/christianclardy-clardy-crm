// GET /api/docusign-status?envelope_id=...
// Fetches current envelope status from DocuSign and syncs it to the DB.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Missing service key.' });

  const envelope_id = req.query?.envelope_id;
  if (!envelope_id) return res.status(400).json({ error: 'envelope_id is required.' });

  try {
    // Load envelope from DB
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/docusign_envelopes?envelope_id=eq.${encodeURIComponent(envelope_id)}&select=*&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const rows = await dbRes.json();
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Envelope not found.' });

    // Load company profile (org-scoped)
    let profileUrl = `${SUPABASE_URL}/rest/v1/company_profiles?select=id,settings&limit=1`;
    if (row.organization_id) profileUrl += `&organization_id=eq.${encodeURIComponent(row.organization_id)}`;
    const profileRes = await fetch(profileUrl, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    const profiles = await profileRes.json();
    const docusign = profiles[0]?.settings?.docusign;
    if (!docusign?.access_token) return res.status(400).json({ error: 'DocuSign not connected.' });

    // Fetch status from DocuSign
    const dsRes = await fetch(
      `${docusign.base_uri}/restapi/v2.1/accounts/${docusign.account_id}/envelopes/${envelope_id}`,
      { headers: { Authorization: `Bearer ${docusign.access_token}` } }
    );
    const dsData = await dsRes.json();
    if (!dsRes.ok) return res.status(dsRes.status).json({ error: dsData.message || 'DocuSign API error.' });

    const newStatus = dsData.status;

    // Sync status to DB if changed
    if (newStatus && newStatus !== row.status) {
      const patch = { status: newStatus };
      if (newStatus === 'completed') patch.completed_at = new Date().toISOString();
      if (newStatus === 'voided')    patch.voided_at    = new Date().toISOString();
      if (newStatus === 'declined')  patch.declined_at  = new Date().toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/docusign_envelopes?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify(patch),
      });
    }

    return res.status(200).json({ status: newStatus, envelope_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
