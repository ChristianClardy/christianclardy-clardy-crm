// QuickBooks credentials configuration.
// GET  — returns { configured, client_id (masked), environment } from quickbooks_credentials table.
// POST — upserts { client_id, client_secret, environment } into quickbooks_credentials (single row, id=1).

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server misconfiguration: missing service key.' });

  try {
    if (req.method === 'GET') {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/quickbooks_credentials?select=id,client_id,environment&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const rows = await r.json();
      const row = rows[0] || null;
      if (!row) return res.status(200).json({ configured: false, client_id: null, environment: null });
      return res.status(200).json({
        configured: true,
        client_id: row.client_id || null,
        environment: row.environment || 'sandbox',
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { client_id, client_secret, environment } = body || {};
      if (!client_id)     return res.status(400).json({ error: 'client_id is required.' });
      if (!client_secret) return res.status(400).json({ error: 'client_secret is required.' });
      if (!environment)   return res.status(400).json({ error: 'environment is required.' });

      // Delete any existing row then insert fresh (single-row pattern).
      await fetch(`${SUPABASE_URL}/rest/v1/quickbooks_credentials?id=gte.0`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
      });

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/quickbooks_credentials`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify({ id: 1, client_id, client_secret, environment }),
      });
      if (!insertRes.ok) {
        const err = await insertRes.text();
        return res.status(insertRes.status).json({ error: err });
      }

      return res.status(200).json({ client_id, environment });
    }

    return res.status(405).send('Method Not Allowed');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
