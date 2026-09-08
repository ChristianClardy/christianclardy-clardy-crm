// Exchanges a DocuSign authorization code for tokens.
// The client_secret is loaded server-side from docusign_credentials (never
// exposed to the browser) rather than from a Vercel env var — it's entered
// once in Settings > DocuSign and stored there.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function loadCredentials() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/docusign_credentials?select=*&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const rows = await res.json();
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing service key.' });
    return;
  }

  const { code, redirect_uri } = req.body || {};
  if (!code)         return res.status(400).json({ error: 'Authorization code is required.' });
  if (!redirect_uri) return res.status(400).json({ error: 'redirect_uri is required.' });

  const creds = await loadCredentials();
  if (!creds?.client_id || !creds?.client_secret) {
    return res.status(400).json({ error: 'DocuSign app credentials are not configured. Add them in Settings > DocuSign.' });
  }

  const DOCUSIGN_BASE_URL = creds.environment === 'production'
    ? 'https://account.docusign.com'
    : 'https://account-d.docusign.com';

  const credentials = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');

  try {
    // Exchange code for access + refresh tokens
    const tokenRes = await fetch(`${DOCUSIGN_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
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
        error: tokenData.error_description || tokenData.error || 'Token exchange failed.',
      });
    }

    // Fetch the connected user's account info
    const userInfoRes = await fetch(`${DOCUSIGN_BASE_URL}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const defaultAccount =
      userInfo.accounts?.find((a) => a.is_default) || userInfo.accounts?.[0] || {};

    res.status(200).json({
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in:    tokenData.expires_in,
      account_id:    defaultAccount.account_id,
      account_name:  defaultAccount.account_name,
      base_uri:      defaultAccount.base_uri,
      user_name:     userInfo.name,
      email:         userInfo.email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
