// Creates and sends a DocuSign envelope.
// Handles token refresh, org-scoped profile loading, and saves envelope to DB.
//
// Accepts either the original single-document shape ({ file_url, file_name })
// or a multi-document "documents" array — used by the Deal Contracts tab to
// bundle a contract template + attached documents + an estimate PDF into one
// envelope. Each entry in `documents` may carry its own `merge_fields`
// ([{ anchor, value }]) — rendered as locked DocuSign anchor-string text tabs
// so customer/deal info is merged into the document text at send time.

const SUPABASE_URL           = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY            = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOCUSIGN_CLIENT_ID     = process.env.DOCUSIGN_CLIENT_ID;
const DOCUSIGN_CLIENT_SECRET = process.env.DOCUSIGN_CLIENT_SECRET;
const DOCUSIGN_BASE_URL      = process.env.DOCUSIGN_ENV === 'production'
  ? 'https://account.docusign.com'
  : 'https://account-d.docusign.com';

async function loadProfile(organization_id) {
  let url = `${SUPABASE_URL}/rest/v1/company_profiles?select=id,settings&limit=1`;
  if (organization_id) url += `&organization_id=eq.${encodeURIComponent(organization_id)}`;
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const rows = await res.json();
  return rows[0] || null;
}

async function refreshTokenIfNeeded(docusign, profileId) {
  const expiresAt = docusign.expires_at ? new Date(docusign.expires_at) : null;
  const needsRefresh = !expiresAt || (expiresAt.getTime() - Date.now() < 5 * 60 * 1000);
  if (!needsRefresh || !docusign.refresh_token) return docusign;
  if (!DOCUSIGN_CLIENT_ID || !DOCUSIGN_CLIENT_SECRET) return docusign;

  const credentials = Buffer.from(`${DOCUSIGN_CLIENT_ID}:${DOCUSIGN_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch(`${DOCUSIGN_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: docusign.refresh_token }),
  });
  if (!tokenRes.ok) return docusign;

  const tokenData = await tokenRes.json();
  const updated = {
    ...docusign,
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token || docusign.refresh_token,
    expires_at:    new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  };

  // Persist updated tokens
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
    body: JSON.stringify({ settings: { ...currentSettings, docusign: updated } }),
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

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const {
    file_url, file_name,            // legacy single-document shape (still supported)
    documents: documentsInput,      // new: [{ file_url, file_name, merge_fields? }]
    subject,
    signers, organization_id, entity_type, entity_id, sent_by,
  } = body || {};

  const documents = Array.isArray(documentsInput) && documentsInput.length > 0
    ? documentsInput
    : (file_url && file_name ? [{ file_url, file_name }] : []);

  if (documents.length === 0) return res.status(400).json({ error: 'file_url/file_name or a non-empty documents array is required.' });
  for (const d of documents) {
    if (!d.file_url) return res.status(400).json({ error: 'Each document requires a file_url.' });
    if (!d.file_name) return res.status(400).json({ error: 'Each document requires a file_name.' });
  }
  if (!Array.isArray(signers) || signers.length === 0)
    return res.status(400).json({ error: 'At least one signer is required.' });

  try {
    // Load profile (org-scoped; fallback to any profile)
    let profile = await loadProfile(organization_id);
    if (!profile?.settings?.docusign && organization_id) profile = await loadProfile(null);
    if (!profile?.settings?.docusign?.access_token) {
      return res.status(400).json({ error: 'DocuSign account is not connected. Configure it in Settings.' });
    }

    let docusign = await refreshTokenIfNeeded(profile.settings.docusign, profile.id);

    // Download + base64-encode every document, each becoming its own entry
    // in the envelope so DocuSign presents them as one signing session.
    const envelopeDocuments = [];
    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      const docRes = await fetch(d.file_url);
      if (!docRes.ok) return res.status(400).json({ error: `Could not download "${d.file_name}" from storage.` });
      const docBase64 = Buffer.from(await docRes.arrayBuffer()).toString('base64');
      const ext = d.file_name.split('.').pop()?.toLowerCase() || 'pdf';
      envelopeDocuments.push({
        documentBase64: docBase64,
        name: d.file_name,
        fileExtension: ext,
        documentId: String(i + 1),
      });
    }

    // Merge fields render as locked (non-editable) anchor-string text tabs —
    // DocuSign finds the literal token text (e.g. "{{client_name}}") in the
    // document and stamps the resolved value there. Attached to the first
    // signer since every envelope has at least one; the signer never edits
    // them because `locked: true`.
    const textTabs = [];
    documents.forEach((d, i) => {
      for (const mf of d.merge_fields || []) {
        if (!mf.anchor) continue;
        textTabs.push({
          documentId: String(i + 1),
          anchorString: mf.anchor,
          anchorIgnoreIfNotPresent: 'true',
          anchorXOffset: '0', anchorYOffset: '0', anchorUnits: 'pixels',
          tabLabel: mf.anchor,
          value: mf.value ?? '',
          locked: 'true',
          font: 'helvetica', fontSize: 'size9',
        });
      }
    });

    const emailSubject = subject || `Please sign: ${documents[0].file_name}`;

    // Build envelope
    const envelopeBody = {
      emailSubject,
      documents: envelopeDocuments,
      recipients: {
        signers: signers.map((signer, i) => ({
          email: signer.email,
          name: signer.name,
          recipientId: String(i + 1),
          routingOrder: String(i + 1),
          tabs: {
            signHereTabs: [{
              anchorString: '**signature**',
              anchorIgnoreIfNotPresent: 'true',
              anchorXOffset: '0', anchorYOffset: '0', anchorUnits: 'pixels',
            }],
            ...(i === 0 && textTabs.length > 0 ? { textTabs } : {}),
          },
        })),
      },
      status: 'sent',
    };

    const apiBase = `${docusign.base_uri}/restapi/v2.1/accounts/${docusign.account_id}/envelopes`;
    const envelopeRes = await fetch(apiBase, {
      method: 'POST',
      headers: { Authorization: `Bearer ${docusign.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(envelopeBody),
    });
    const envelopeData = await envelopeRes.json();
    if (!envelopeRes.ok) {
      return res.status(envelopeRes.status).json({
        error: envelopeData.message || envelopeData.errorCode || 'Failed to create DocuSign envelope.',
      });
    }

    // Save envelope record
    const documentLabel = documents.length === 1
      ? documents[0].file_name
      : `${documents[0].file_name} + ${documents.length - 1} more`;
    const envelopeRecord = {
      envelope_id:   envelopeData.envelopeId,
      subject:       emailSubject,
      document_name: documentLabel,
      status:        envelopeData.status || 'sent',
      signers:       signers,
      sent_at:       new Date().toISOString(),
      created_at:    new Date().toISOString(),
      ...(organization_id ? { organization_id } : {}),
      ...(entity_type     ? { entity_type }     : {}),
      ...(entity_id       ? { entity_id }       : {}),
      ...(sent_by         ? { sent_by }         : {}),
    };
    await fetch(`${SUPABASE_URL}/rest/v1/docusign_envelopes`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(envelopeRecord),
    });

    return res.status(200).json({ envelope_id: envelopeData.envelopeId, status: envelopeData.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
