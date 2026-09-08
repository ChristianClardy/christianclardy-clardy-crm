// Manages the DocuSign OAuth app credentials (Integration Key + Client Secret)
// entered from Settings > DocuSign, stored in docusign_credentials.
//
// GET never returns client_secret to the browser — only client_id and
// environment, so the Settings page can show "configured" state without the
// secret ever round-tripping back out.

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server misconfiguration: missing service key.' });

  if (req.method === 'GET') {
    const creds = await loadCredentials();
    return res.status(200).json({
      configured:  !!creds,
      client_id:   creds?.client_id || null,
      environment: creds?.environment || 'sandbox',
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { client_id, client_secret, environment } = body;
    if (!client_id)     return res.status(400).json({ error: 'client_id is required.' });
    if (!client_secret) return res.status(400).json({ error: 'client_secret is required.' });

    const env = environment === 'production' ? 'production' : 'sandbox';
    const existing = await loadCredentials();
    const payload = { client_id, client_secret, environment: env, updated_at: new Date().toISOString() };

    const target = existing
      ? `${SUPABASE_URL}/rest/v1/docusign_credentials?id=eq.${existing.id}`
      : `${SUPABASE_URL}/rest/v1/docusign_credentials`;

    const writeRes = await fetch(target, {
      method: existing ? 'PATCH' : 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    if (!writeRes.ok) {
      const err = await writeRes.json().catch(() => ({}));
      return res.status(writeRes.status).json({ error: err.message || 'Failed to save DocuSign app credentials.' });
    }

    return res.status(200).json({ success: true, client_id, environment: env });
  }

  if (req.method === 'DELETE') {
    const existing = await loadCredentials();
    if (existing) {
      await fetch(`${SUPABASE_URL}/rest/v1/docusign_credentials?id=eq.${existing.id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).send('Method Not Allowed');
};
