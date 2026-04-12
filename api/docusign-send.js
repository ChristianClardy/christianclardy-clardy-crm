// Creates and sends a DocuSign envelope for a document stored in Supabase Storage.
// Reads the connected DocuSign credentials from company_profiles.settings.docusign.

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing service key.' });
    return;
  }

  const { file_url, file_name, signers } = req.body || {};

  if (!file_url)                      return res.status(400).json({ error: 'file_url is required.' });
  if (!file_name)                     return res.status(400).json({ error: 'file_name is required.' });
  if (!Array.isArray(signers) || signers.length === 0)
    return res.status(400).json({ error: 'At least one signer is required.' });

  try {
    // Load DocuSign credentials from company profile
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/company_profiles?select=settings&limit=1`,
      {
        headers: {
          apikey:        SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    const profiles = await profileRes.json();
    const docusign = profiles[0]?.settings?.docusign;

    if (!docusign?.access_token) {
      return res.status(400).json({ error: 'DocuSign account is not connected. Configure it in Settings.' });
    }

    // Download the document from its storage URL
    const docRes = await fetch(file_url);
    if (!docRes.ok) return res.status(400).json({ error: 'Could not download the document from storage.' });
    const docBuffer = await docRes.arrayBuffer();
    const docBase64 = Buffer.from(docBuffer).toString('base64');

    const ext = file_name.split('.').pop()?.toLowerCase() || 'pdf';

    // Build the envelope
    const envelopeBody = {
      emailSubject: `Please sign: ${file_name}`,
      documents: [
        {
          documentBase64: docBase64,
          name:           file_name,
          fileExtension:  ext,
          documentId:     '1',
        },
      ],
      recipients: {
        signers: signers.map((signer, i) => ({
          email:       signer.email,
          name:        signer.name,
          recipientId: String(i + 1),
          routingOrder: String(i + 1),
          tabs: {
            signHereTabs: [
              {
                // Will attach to any "**signature**" anchor text in the doc,
                // or fall back to the bottom of the last page if not found.
                anchorString:              '**signature**',
                anchorIgnoreIfNotPresent:  'true',
                anchorXOffset:             '0',
                anchorYOffset:             '0',
                anchorUnits:               'pixels',
              },
            ],
          },
        })),
      },
      status: 'sent',
    };

    const apiBase = `${docusign.base_uri}/restapi/v2.1/accounts/${docusign.account_id}/envelopes`;

    const envelopeRes = await fetch(apiBase, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${docusign.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelopeBody),
    });

    const envelopeData = await envelopeRes.json();

    if (!envelopeRes.ok) {
      return res.status(envelopeRes.status).json({
        error: envelopeData.message || envelopeData.errorCode || 'Failed to create DocuSign envelope.',
      });
    }

    res.status(200).json({
      envelope_id: envelopeData.envelopeId,
      status:      envelopeData.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
