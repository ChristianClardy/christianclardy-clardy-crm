// POST /api/docusign-webhook
// Receives DocuSign Connect push notifications and updates envelope status in DB.
// Configure this URL in DocuSign Connect: https://yourdomain.com/api/docusign-webhook

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  // Always respond 200 so DocuSign doesn't retry
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // DocuSign JSON Connect payload
    const envelopeId = body.envelopeId || body.data?.envelopeSummary?.envelopeId;
    const rawStatus  = body.status     || body.data?.envelopeSummary?.status || '';
    const status     = rawStatus.toLowerCase();

    if (!envelopeId || !status || !SERVICE_KEY) return res.status(200).json({ received: true });

    const patch = { status };
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    if (status === 'voided')    patch.voided_at    = new Date().toISOString();
    if (status === 'declined')  patch.declined_at  = new Date().toISOString();

    await fetch(
      `${SUPABASE_URL}/rest/v1/docusign_envelopes?envelope_id=eq.${encodeURIComponent(envelopeId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify(patch),
      }
    );

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('docusign-webhook error:', err);
    return res.status(200).json({ received: true });
  }
};
