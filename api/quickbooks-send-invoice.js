// Triggers QuickBooks to email an invoice to the client with a payment link.
// POST: accepts { qb_invoice_id, realm_id, profile_id? }.
// Calls the QB "send invoice" endpoint: POST /v3/company/{realm_id}/invoice/{qb_invoice_id}/send
// Refreshes QB token if needed before calling the QB API.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const { refreshQBTokenIfNeeded, loadQBCredentials } = require('./quickbooks-refresh');

async function fetchProfiles(filter) {
  const url = `${SUPABASE_URL}/rest/v1/company_profiles?select=id,settings${filter}`;
  const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server misconfiguration: missing service key.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { qb_invoice_id, realm_id, profile_id, send_to_email } = body || {};
    if (!qb_invoice_id) return res.status(400).json({ error: 'qb_invoice_id is required.' });
    if (!realm_id)      return res.status(400).json({ error: 'realm_id is required.' });

    // Load the company profile.
    let profile = null;
    if (profile_id) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/company_profiles?id=eq.${profile_id}&select=id,settings&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const rows = await r.json();
      profile = rows[0] || null;
    } else {
      const all = await fetchProfiles('');
      profile = all.find((p) => p.settings?.quickbooks?.access_token) || null;
    }

    if (!profile?.settings?.quickbooks?.access_token) {
      return res.status(400).json({ error: 'QuickBooks is not connected. Configure it in Settings.' });
    }

    // Refresh token if needed.
    let qb = await refreshQBTokenIfNeeded(profile.settings.quickbooks, profile.id);

    // Determine API base URL.
    const creds = await loadQBCredentials();
    const apiBase = creds?.environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    // Build send endpoint — optionally append sendTo= if a recipient email is provided.
    let sendUrl = `${apiBase}/v3/company/${realm_id}/invoice/${qb_invoice_id}/send`;
    if (send_to_email) {
      sendUrl += `?sendTo=${encodeURIComponent(send_to_email)}`;
    }

    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${qb.access_token}`,
        'Content-Type': 'application/octet-stream', // QB requires this content-type for the send endpoint
        Accept: 'application/json',
      },
    });

    // QB returns 200/201 on success with the updated invoice object, or an
    // error payload on failure.
    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      return res.status(sendRes.status).json({
        error: sendData?.Fault?.Error?.[0]?.Message || 'Failed to send QB invoice.',
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
