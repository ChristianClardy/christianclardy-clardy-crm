// GET /api/docusign-status?envelope_id=...
// Fetches current envelope status from DocuSign, syncs it to the DB, and saves
// the signed contract into the CRM once the envelope is completed.

const { requireStaff } = require('./_lib/staffAuth.js');
const { syncEnvelope, getEnvelopeRow } = require('./_lib/docusign.js');

module.exports = async function handler(req, res) {
  // Staff only: this endpoint uses the service role key.
  if (req.method !== 'OPTIONS' && !(await requireStaff(req, res))) return;
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Missing service key.' });

  const envelope_id = req.query?.envelope_id;
  if (!envelope_id) return res.status(400).json({ error: 'envelope_id is required.' });

  try {
    const row = await getEnvelopeRow(envelope_id);
    if (!row) return res.status(404).json({ error: 'Envelope not found.' });
    const { status, signed_document_url } = await syncEnvelope(row);
    return res.status(200).json({ status, envelope_id, signed_document_url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
