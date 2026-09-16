// QuickBooks OAuth 2.0 callback — exchange authorization code for tokens.
// POST: accepts { code, realm_id, redirect_uri }.
// Returns { access_token, refresh_token, expires_in, realm_id, company_name }.
// The caller (browser) saves these to company_profiles.settings.quickbooks.

const SUPABASE_URL    = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY;
const QB_TOKEN_URL    = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server misconfiguration: missing service key.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { code, realm_id, redirect_uri } = body || {};
    if (!code)         return res.status(400).json({ error: 'code is required.' });
    if (!realm_id)     return res.status(400).json({ error: 'realm_id is required.' });
    if (!redirect_uri) return res.status(400).json({ error: 'redirect_uri is required.' });

    const creds = await loadQBCredentials();
    if (!creds?.client_id || !creds?.client_secret) {
      return res.status(400).json({ error: 'QuickBooks is not configured. Add credentials in Settings first.' });
    }

    // Exchange code for tokens.
    const basicAuth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
    const tokenRes = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(tokenRes.status).json({
        error: tokenData.error_description || tokenData.error || 'Failed to exchange code for tokens.',
      });
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    // Fetch company name from QB API.
    const apiBase = creds.environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    let company_name = null;
    try {
      const companyRes = await fetch(
        `${apiBase}/v3/company/${realm_id}/companyinfo/${realm_id}`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            Accept: 'application/json',
          },
        }
      );
      if (companyRes.ok) {
        const companyData = await companyRes.json();
        company_name = companyData?.CompanyInfo?.CompanyName || null;
      }
    } catch (_) {
      // Non-fatal — caller still gets tokens even if name lookup fails.
    }

    return res.status(200).json({
      access_token,
      refresh_token,
      expires_in,
      realm_id,
      company_name,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
