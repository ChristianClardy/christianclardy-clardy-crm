// POST /api/create-project-from-lead
// Called when a lead is moved to Won. Creates a Project record using the
// service-role key, bypassing browser auth-token contention.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { lead_id, client_id, name, address, notes, contract_value, company_id, organization_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const payload = {
    name,
    client_id: client_id || null,
    status: 'planning',
    contract_value: Number(contract_value) || 0,
    address: address || '',
    notes: notes || '',
    company_id: company_id || null,
    organization_id: organization_id || null,
  };

  const r = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error('[create-project-from-lead] Supabase error:', err);
    return res.status(500).json({ error: err });
  }

  const rows = await r.json();
  return res.status(200).json(rows[0] || rows);
};
