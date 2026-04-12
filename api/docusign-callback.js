// Exchanges a DocuSign authorization code for tokens.
// The client_secret is kept server-side and never exposed to the browser.

const DOCUSIGN_CLIENT_ID     = process.env.DOCUSIGN_CLIENT_ID;
const DOCUSIGN_CLIENT_SECRET = process.env.DOCUSIGN_CLIENT_SECRET;
const DOCUSIGN_BASE_URL      = process.env.DOCUSIGN_ENV === 'production'
  ? 'https://account.docusign.com'
  : 'https://account-d.docusign.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  if (!DOCUSIGN_CLIENT_ID || !DOCUSIGN_CLIENT_SECRET) {
    res.status(500).json({ error: 'Server misconfiguration: DocuSign credentials not set.' });
    return;
  }

  const { code, redirect_uri } = req.body || {};
  if (!code)         return res.status(400).json({ error: 'Authorization code is required.' });
  if (!redirect_uri) return res.status(400).json({ error: 'redirect_uri is required.' });

  const credentials = Buffer.from(`${DOCUSIGN_CLIENT_ID}:${DOCUSIGN_CLIENT_SECRET}`).toString('base64');

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
