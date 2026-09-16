// QuickBooks OAuth 2.0 — build and return the authorization URL.
// GET or POST: accepts { redirect_uri } (body or query param).
// Returns { auth_url } pointing to Intuit's authorization endpoint.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QB_SCOPE    = 'com.intuit.quickbooks.accounting';

async function loadQBCredentials() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/quickbooks_credentials?select=*&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const rows = await r.json();
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).send('Method Not Allowed');
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server misconfiguration: missing service key.' });

  try {
    const body = req.method === 'POST'
      ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body)
      : {};
    const redirect_uri = body?.redirect_uri || req.query?.redirect_uri;
    if (!redirect_uri) return res.status(400).json({ error: 'redirect_uri is required.' });

    const creds = await loadQBCredentials();
    if (!creds?.client_id) {
      return res.status(400).json({ error: 'QuickBooks is not configured. Add credentials in Settings first.' });
    }

    const state = String(Date.now());
    const params = new URLSearchParams({
      client_id:     creds.client_id,
      scope:         QB_SCOPE,
      redirect_uri,
      response_type: 'code',
      state,
    });

    return res.status(200).json({ auth_url: `${QB_AUTH_URL}?${params.toString()}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
