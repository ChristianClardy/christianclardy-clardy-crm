// Creates and sends a DocuSign envelope.
// Handles token refresh, org-scoped profile loading, and saves envelope to DB.
//
// Accepts either the original single-document shape ({ file_url, file_name })
// or a multi-document "documents" array — used by the Deal Contracts tab to
// bundle a contract template + attached documents + an estimate PDF into one
// envelope. Each entry in `documents` may carry its own `merge_fields`
// ([{ anchor, value }]) — rendered as locked DocuSign anchor-string text tabs
// so customer/deal info is merged into the document text at send time.

const { getDocusign } = require('./_lib/docusign.js');

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// DocuSign calls this when the envelope is sent, signed, declined, or voided,
// so signed contracts are saved into the CRM automatically (see
// api/docusign-webhook.js). Always production: it shares the same database.
const WEBHOOK_URL = 'https://clardy.io/api/docusign-webhook';
const EVENT_NOTIFICATION = {
  url: WEBHOOK_URL,
  requireAcknowledgment: 'true',
  loggingEnabled: 'true',
  deliveryMode: 'SIM',
  events: ['envelope-sent', 'envelope-delivered', 'envelope-completed', 'envelope-declined', 'envelope-voided'],
  eventData: { version: 'restv2.1', format: 'json' },
};

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
    review, return_url,             // review: true -> create as a draft and hand back a
                                     // DocuSign Embedded Sender View URL instead of sending
                                     // immediately, so routing/signers/etc. can be finished
                                     // inside DocuSign's own UI before it actually sends.
  } = body || {};

  if (review && !return_url) return res.status(400).json({ error: 'return_url is required when review is true.' });

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
    // Load profile (org-scoped; falls back to any profile with DocuSign connected)
    const auth = await getDocusign(organization_id);
    if (!auth) {
      return res.status(400).json({ error: 'DocuSign account is not connected. Configure it in Settings.' });
    }
    const { docusign } = auth;

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
        const value = mf.value ?? '';
        // Multi-row summaries (e.g. an equipment or payment schedule) come
        // through as newline-joined text — a plain anchor text tab only
        // renders one line, so give those a box to wrap/scroll in instead.
        const isMultiLine = value.includes('\n');
        textTabs.push({
          documentId: String(i + 1),
          anchorString: mf.anchor,
          anchorIgnoreIfNotPresent: 'true',
          anchorXOffset: '0', anchorYOffset: '0', anchorUnits: 'pixels',
          // Unique per document: several documents in one package can carry
          // the same anchor (two templates both merging {{client_name}}), and
          // DocuSign links same-labelled tabs on a recipient into one shared
          // value — which would let one document's value overwrite another's.
          tabLabel: `${mf.anchor}-doc${i + 1}`,
          value,
          locked: 'true',
          font: 'helvetica', fontSize: 'size9',
          ...(isMultiLine ? { multiLine: 'true', width: '300', height: '90' } : {}),
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
      status: review ? 'created' : 'sent',
      eventNotification: EVENT_NOTIFICATION,
    };

    const apiBase = `${docusign.base_uri}/restapi/v2.1/accounts/${docusign.account_id}/envelopes`;
    const createEnvelope = (payload) => fetch(apiBase, {
      method: 'POST',
      headers: { Authorization: `Bearer ${docusign.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let envelopeRes = await createEnvelope(envelopeBody);
    let envelopeData = await envelopeRes.json();
    // Some DocuSign plans don't allow per-envelope webhooks. Never let that
    // block sending: retry without it (the status refresh and daily sync
    // still pick up the signed contract).
    if (!envelopeRes.ok && /connect|event.?notification|permission/i.test(`${envelopeData.errorCode} ${envelopeData.message}`)) {
      console.warn('docusign-send: eventNotification rejected, retrying without it:', envelopeData.errorCode, envelopeData.message);
      delete envelopeBody.eventNotification;
      envelopeRes = await createEnvelope(envelopeBody);
      envelopeData = await envelopeRes.json();
    }
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
      status:        envelopeData.status || (review ? 'created' : 'sent'),
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

    if (review) {
      // Embedded Sender View — only valid while the envelope is still a
      // draft ('created'). DocuSign redirects the browser to return_url
      // once the user finishes (or cancels) reviewing/sending there.
      const senderViewRes = await fetch(`${apiBase}/${envelopeData.envelopeId}/views/sender`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${docusign.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnUrl: return_url,
          viewAccess: 'envelope',
          // Explicit settings so the review screen opens fully editable —
          // recipients/routing, field placement, and attached documents —
          // rather than relying on whatever DocuSign's own defaults are.
          settings: {
            startingScreen: 'Prepare',
            showBackButton: 'true',
            recipientSettings: { showEditRecipients: 'true', showContactsList: 'true' },
            documentSettings: { showEditDocuments: 'true', showEditPages: 'true' },
          },
        }),
      });
      const senderViewData = await senderViewRes.json();
      if (!senderViewRes.ok) {
        return res.status(senderViewRes.status).json({
          error: senderViewData.message || senderViewData.errorCode || 'Failed to open DocuSign for review.',
        });
      }
      return res.status(200).json({ envelope_id: envelopeData.envelopeId, sender_view_url: senderViewData.url });
    }

    return res.status(200).json({ envelope_id: envelopeData.envelopeId, status: envelopeData.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
