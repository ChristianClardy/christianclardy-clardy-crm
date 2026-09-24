// Shared DocuSign helpers for api/ functions: loading the connected account,
// refreshing its OAuth token, syncing an envelope's status, and — once an
// envelope is fully signed — saving the signed PDF into the CRM.
//
// syncEnvelope() is the single entry point used by the webhook, the manual
// status refresh, and the daily cron, so all three behave identically and are
// safe to run more than once for the same envelope.

const { sbFetch, sbList, sbGetById, sbInsert } = require('./supabaseAdmin.js');
const { handleEnvelopeCompleted } = require('./dealAutomation.js');

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = 'Attachements';

const TERMINAL_STATUSES = new Set(['completed', 'voided', 'declined']);

// Multiple company_profiles rows can exist (e.g. one per legacy org record)
// with only one actually carrying a connected DocuSign account, so picking
// "any" row via limit=1 can land on one without settings.docusign. Prefer an
// org-scoped row that has DocuSign connected, then any org-scoped row, then
// fall back to searching all profiles for one with DocuSign connected.
async function loadProfile(organizationId) {
  if (organizationId) {
    const scoped = await sbList('company_profiles', { select: 'id,settings', filters: { organization_id: `eq.${organizationId}` } });
    const scopedWithDocusign = scoped.find((p) => p.settings?.docusign);
    if (scopedWithDocusign) return scopedWithDocusign;
    if (scoped.length) return scoped[0];
  }
  const all = await sbList('company_profiles', { select: 'id,settings' });
  return all.find((p) => p.settings?.docusign) || all[0] || null;
}

async function refreshTokenIfNeeded(docusign, profileId) {
  const expiresAt = docusign.expires_at ? new Date(docusign.expires_at) : null;
  const needsRefresh = !expiresAt || (expiresAt.getTime() - Date.now() < 5 * 60 * 1000);
  if (!needsRefresh || !docusign.refresh_token) return docusign;

  const creds = (await sbList('docusign_credentials', { limit: 1 }))[0];
  if (!creds?.client_id || !creds?.client_secret) return docusign;

  const DOCUSIGN_BASE_URL = creds.environment === 'production'
    ? 'https://account.docusign.com'
    : 'https://account-d.docusign.com';

  const credentials = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
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

  // Persist updated tokens (re-read settings so other keys aren't clobbered)
  const current = await sbGetById('company_profiles', profileId, 'settings');
  await sbFetch(`company_profiles?id=eq.${profileId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ settings: { ...(current?.settings || {}), docusign: updated } }),
  });

  return updated;
}

// Returns { docusign, profileId } with a fresh access token, or null if no
// DocuSign account is connected.
async function getDocusign(organizationId) {
  const profile = await loadProfile(organizationId);
  if (!profile?.settings?.docusign?.access_token) return null;
  const docusign = await refreshTokenIfNeeded(profile.settings.docusign, profile.id);
  return { docusign, profileId: profile.id };
}

function envelopeApi(docusign, envelopeId, suffix = '') {
  return `${docusign.base_uri}/restapi/v2.1/accounts/${docusign.account_id}/envelopes/${encodeURIComponent(envelopeId)}${suffix}`;
}

// Works out every CRM record the signed contract should be filed under:
// the record it was sent from, the client, and the project when known.
async function filingTargets(row) {
  const targets = [];
  const add = (type, id) => { if (id && !targets.some((t) => t.type === type && t.id === id)) targets.push({ type, id }); };
  const { entity_type: type, entity_id: id } = row;
  if (!type || !id) return targets;
  add(type, id);

  if (type === 'lead') {
    const lead = await sbGetById('leads', id, 'linked_contact_id');
    add('client', lead?.linked_contact_id);
  } else if (type === 'deal') {
    const deal = await sbGetById('deals', id, 'lead_id');
    if (deal?.lead_id) {
      add('lead', deal.lead_id);
      const lead = await sbGetById('leads', deal.lead_id, 'linked_contact_id');
      add('client', lead?.linked_contact_id);
    }
  } else if (type === 'estimate') {
    const est = await sbGetById('estimates', id, 'client_id,project_id');
    add('client', est?.client_id);
    add('project', est?.project_id);
  } else if (type === 'project') {
    const project = await sbGetById('projects', id, 'client_id');
    add('client', project?.client_id);
  }
  return targets;
}

// Downloads the fully signed PDF (all documents + DocuSign's certificate of
// completion), stores it, and files it under each related CRM record.
async function saveSignedContract(row, docusign) {
  const pdfRes = await fetch(envelopeApi(docusign, row.envelope_id, '/documents/combined?certificate=true'), {
    headers: { Authorization: `Bearer ${docusign.access_token}` },
  });
  if (!pdfRes.ok) throw new Error(`Signed PDF download failed: ${pdfRes.status} ${await pdfRes.text()}`);
  const pdf = Buffer.from(await pdfRes.arrayBuffer());

  const path = `signed-contracts/${row.envelope_id}.pdf`;
  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: pdf,
  });
  if (!upRes.ok) throw new Error(`Signed PDF upload failed: ${upRes.status} ${await upRes.text()}`);
  const url = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;

  const baseName = (row.document_name || 'Contract').replace(/\.pdf$/i, '');
  const filename = `SIGNED - ${baseName}.pdf`;
  for (const target of await filingTargets(row)) {
    const existing = await sbList('attachments', {
      select: 'id',
      filters: { entity_type: `eq.${target.type}`, entity_id: `eq.${target.id}`, url: `eq.${url}` },
      limit: 1,
    });
    if (existing.length) continue;
    await sbInsert('attachments', {
      entity_type: target.type,
      entity_id: target.id,
      filename,
      url,
      file_type: 'application/pdf',
      file_size: pdf.length,
      uploaded_by: 'DocuSign (auto-saved)',
      category: 'contract',
      ...(row.organization_id ? { organization_id: row.organization_id } : {}),
    });
  }

  await sbFetch(`docusign_envelopes?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ signed_document_url: url, signed_saved_at: new Date().toISOString() }),
  });
  return url;
}

// Pulls the envelope's real status from DocuSign (never trusting a webhook
// payload), records it, runs the won-deal automation on completion, and saves
// the signed contract if it hasn't been saved yet.
// Returns { status, signed_document_url }.
async function syncEnvelope(row) {
  const auth = await getDocusign(row.organization_id);
  if (!auth) throw new Error('DocuSign not connected.');
  const { docusign } = auth;

  const dsRes = await fetch(envelopeApi(docusign, row.envelope_id), {
    headers: { Authorization: `Bearer ${docusign.access_token}` },
  });
  const dsData = await dsRes.json();
  if (!dsRes.ok) throw new Error(dsData.message || 'DocuSign API error.');

  const status = (dsData.status || '').toLowerCase();
  if (status && status !== row.status) {
    const patch = { status };
    if (status === 'completed') patch.completed_at = dsData.completedDateTime || new Date().toISOString();
    if (status === 'voided')    patch.voided_at    = dsData.voidedDateTime || new Date().toISOString();
    if (status === 'declined')  patch.declined_at  = dsData.declinedDateTime || new Date().toISOString();
    await sbFetch(`docusign_envelopes?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (status === 'completed') await handleEnvelopeCompleted(row.entity_type, row.entity_id);
  }

  let signedUrl = row.signed_document_url || null;
  if (status === 'completed' && !signedUrl) {
    signedUrl = await saveSignedContract(row, docusign);
  }
  return { status, signed_document_url: signedUrl };
}

async function getEnvelopeRow(envelopeId) {
  return (await sbList('docusign_envelopes', { filters: { envelope_id: `eq.${envelopeId}` }, limit: 1 }))[0] || null;
}

module.exports = { TERMINAL_STATUSES, getDocusign, refreshTokenIfNeeded, loadProfile, syncEnvelope, getEnvelopeRow };
