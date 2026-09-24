// POST /api/docusign-webhook
// Receives DocuSign Connect notifications (set per envelope via
// eventNotification in api/docusign-send.js, or account-level Connect).
// The payload is only used for the envelope id: the real status is re-read
// from DocuSign by syncEnvelope(), so a forged request can't mark anything
// signed. On completion the signed contract is saved into the CRM.

const { syncEnvelope, getEnvelopeRow } = require('./_lib/docusign.js');

module.exports = async function handler(req, res) {
  // Always respond 200 so DocuSign doesn't retry forever
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const envelopeId = body.envelopeId || body.data?.envelopeId || body.data?.envelopeSummary?.envelopeId;
    if (!envelopeId || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(200).json({ received: true });

    const row = await getEnvelopeRow(envelopeId);
    if (row) await syncEnvelope(row);

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('docusign-webhook error:', err);
    return res.status(200).json({ received: true });
  }
};
