// Serverless function to invite a new user via Supabase Auth admin API.
// Uses the service role key (server-side only — never exposed to the browser).

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing service key.' });
    return;
  }

  const { email, full_name } = req.body || {};

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  try {
    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        data: full_name ? { full_name } : {},
      }),
    });

    const payload = await inviteRes.json();

    if (!inviteRes.ok) {
      res.status(inviteRes.status).json({ error: payload?.msg || payload?.message || 'Invite failed.' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
