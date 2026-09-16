// QuickBooks token refresh helper.
// POST: accepts { profile_id }.
// Checks if the stored access_token expires within 5 minutes; if so, refreshes
// using the stored refresh_token and persists the new tokens to
// company_profiles.settings.quickbooks.
// Returns the (possibly-refreshed) QB settings object.
//
// Also exported as refreshQBTokenIfNeeded(qbSettings, profileId) so other
// API files can call it directly without going through HTTP.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

async function loadQBCredentials() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/quickbooks_credentials?select=*&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const rows = await r.json();
  return rows[0] || null;
}

async function refreshQBTokenIfNeeded(qbSettings, profileId) {
  const expiresAt = qbSettings.expires_at ? new Date(qbSettings.expires_at) : null;
  const needsRefresh = !expiresAt || (expiresAt.getTime() - Date.now() < 5 * 60 * 1000);
  if (!needsRefresh || !qbSettings.refresh_token) return qbSettings;

  const creds = await loadQBCredentials();
  if (!creds?.client_id || !creds?.client_secret) return qbSettings;

  const basicAuth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
  const tokenRes = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: qbSettings.refresh_token,
    }),
  });
  if (!tokenRes.ok) return qbSettings;

  const tokenData = await tokenRes.json();
  const updated = {
    ...qbSettings,
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token || qbSettings.refresh_token,
    expires_at:    new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  };

  // Persist updated tokens to company_profiles.
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/company_profiles?id=eq.${profileId}&select=settings&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const profiles = await profileRes.json();
  const currentSettings = profiles[0]?.settings || {};
  await fetch(`${SUPABASE_URL}/rest/v1/company_profiles?id=eq.${profileId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ settings: { ...currentSettings, quickbooks: updated } }),
  });

  return updated;
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
    const { profile_id } = body || {};
    if (!profile_id) return res.status(400).json({ error: 'profile_id is required.' });

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/company_profiles?id=eq.${profile_id}&select=id,settings&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const profiles = await profileRes.json();
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const qbSettings = profile.settings?.quickbooks;
    if (!qbSettings?.access_token) {
      return res.status(400).json({ error: 'QuickBooks is not connected for this profile.' });
    }

    const refreshed = await refreshQBTokenIfNeeded(qbSettings, profile.id);
    return res.status(200).json(refreshed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Named export so sibling API files can import and call directly.
module.exports.refreshQBTokenIfNeeded = refreshQBTokenIfNeeded;
module.exports.loadQBCredentials = loadQBCredentials;
