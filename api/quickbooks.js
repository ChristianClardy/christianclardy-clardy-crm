// Unified QuickBooks API handler — replaces 6 separate files to stay within
// Vercel Hobby plan's 12-function limit.
//
// Routes (all POST unless noted):
//   POST /api/quickbooks  { action: "config-get" }              → GET credentials status
//   POST /api/quickbooks  { action: "config-save", ... }        → save credentials
//   POST /api/quickbooks  { action: "auth-url", redirect_uri }  → get OAuth URL
//   POST /api/quickbooks  { action: "callback", code, realm_id, redirect_uri } → exchange code
//   POST /api/quickbooks  { action: "refresh", profile_id }     → refresh token
//   POST /api/quickbooks  { action: "create-invoice", invoice_id } → push invoice to QB
//   POST /api/quickbooks  { action: "send-invoice", qb_invoice_id, realm_id } → email invoice

const SUPABASE_URL  = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const QB_AUTH_URL   = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL  = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_SCOPE      = 'com.intuit.quickbooks.accounting';

// ─── Supabase helpers ────────────────────────────────────────────────────────

function sbHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  return r.json();
}

async function sbPatch(path, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}

async function loadQBCredentials() {
  const rows = await sbGet('quickbooks_credentials?select=*&limit=1');
  return rows[0] || null;
}

async function loadProfile(company_id) {
  const all = await sbGet('company_profiles?select=id,settings');
  if (company_id) {
    const scoped = all.filter(p => p.settings?.company_id === company_id || true);
    const withQB = scoped.find(p => p.settings?.quickbooks?.access_token);
    if (withQB) return withQB;
  }
  return all.find(p => p.settings?.quickbooks?.access_token) || all[0] || null;
}

// ─── Token refresh ───────────────────────────────────────────────────────────

async function refreshQBTokenIfNeeded(qbSettings, profileId) {
  const expiresAt = qbSettings.expires_at ? new Date(qbSettings.expires_at) : null;
  const needsRefresh = !expiresAt || (expiresAt.getTime() - Date.now() < 5 * 60 * 1000);
  if (!needsRefresh || !qbSettings.refresh_token) return qbSettings;

  const creds = await loadQBCredentials();
  if (!creds?.client_id || !creds?.client_secret) return qbSettings;

  const basicAuth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
  const tokenRes = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: qbSettings.refresh_token }),
  });
  if (!tokenRes.ok) return qbSettings;

  const tokenData = await tokenRes.json();
  const updated = {
    ...qbSettings,
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token || qbSettings.refresh_token,
    expires_at:    new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  };

  const profiles = await sbGet(`company_profiles?id=eq.${profileId}&select=settings&limit=1`);
  const currentSettings = profiles[0]?.settings || {};
  await sbPatch(`company_profiles?id=eq.${profileId}`, { settings: { ...currentSettings, quickbooks: updated } });

  return updated;
}

// ─── Action handlers ─────────────────────────────────────────────────────────

async function handleConfigGet() {
  const rows = await sbGet('quickbooks_credentials?select=id,client_id,environment&limit=1');
  const row = rows[0] || null;
  if (!row) return { configured: false, client_id: null, environment: null };
  return { configured: true, client_id: row.client_id || null, environment: row.environment || 'sandbox' };
}

async function handleConfigSave(body) {
  const { client_id, client_secret, environment } = body;
  if (!client_id)     throw Object.assign(new Error('client_id is required.'),     { status: 400 });
  if (!client_secret) throw Object.assign(new Error('client_secret is required.'), { status: 400 });
  if (!environment)   throw Object.assign(new Error('environment is required.'),   { status: 400 });

  await fetch(`${SUPABASE_URL}/rest/v1/quickbooks_credentials?id=gte.0`, {
    method: 'DELETE',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
  });
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/quickbooks_credentials`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id: 1, client_id, client_secret, environment }),
  });
  if (!insertRes.ok) throw new Error(await insertRes.text());
  return { client_id, environment };
}

async function handleAuthUrl(body) {
  const { redirect_uri } = body;
  if (!redirect_uri) throw Object.assign(new Error('redirect_uri is required.'), { status: 400 });
  const creds = await loadQBCredentials();
  if (!creds?.client_id) throw Object.assign(new Error('QuickBooks is not configured. Add credentials in Settings first.'), { status: 400 });
  const params = new URLSearchParams({ client_id: creds.client_id, scope: QB_SCOPE, redirect_uri, response_type: 'code', state: String(Date.now()) });
  return { auth_url: `${QB_AUTH_URL}?${params.toString()}` };
}

async function handleCallback(body) {
  const { code, realm_id, redirect_uri } = body;
  if (!code)         throw Object.assign(new Error('code is required.'),         { status: 400 });
  if (!realm_id)     throw Object.assign(new Error('realm_id is required.'),     { status: 400 });
  if (!redirect_uri) throw Object.assign(new Error('redirect_uri is required.'), { status: 400 });

  const creds = await loadQBCredentials();
  if (!creds?.client_id || !creds?.client_secret) throw Object.assign(new Error('QuickBooks is not configured.'), { status: 400 });

  const basicAuth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
  const tokenRes = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange code for tokens.');

  const { access_token, refresh_token, expires_in } = tokenData;
  const apiBase = creds.environment === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';

  let company_name = null;
  try {
    const companyRes = await fetch(`${apiBase}/v3/company/${realm_id}/companyinfo/${realm_id}`, { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } });
    if (companyRes.ok) { const d = await companyRes.json(); company_name = d?.CompanyInfo?.CompanyName || null; }
  } catch (_) {}

  return { access_token, refresh_token, expires_in, realm_id, company_name };
}

async function handleRefresh(body) {
  const { profile_id } = body;
  if (!profile_id) throw Object.assign(new Error('profile_id is required.'), { status: 400 });
  const profiles = await sbGet(`company_profiles?id=eq.${profile_id}&select=id,settings&limit=1`);
  const profile = profiles[0];
  if (!profile) throw Object.assign(new Error('Profile not found.'), { status: 404 });
  const qbSettings = profile.settings?.quickbooks;
  if (!qbSettings?.access_token) throw Object.assign(new Error('QuickBooks is not connected for this profile.'), { status: 400 });
  return refreshQBTokenIfNeeded(qbSettings, profile.id);
}

async function handleCreateInvoice(body) {
  const { invoice_id, profile_id } = body;
  if (!invoice_id) throw Object.assign(new Error('invoice_id is required.'), { status: 400 });

  const invoices = await sbGet(`invoices?id=eq.${invoice_id}&select=*&limit=1`);
  const invoice = invoices[0];
  if (!invoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });

  const projects = await sbGet(`projects?id=eq.${invoice.linked_job_id}&select=*&limit=1`);
  const project = projects[0] || null;

  let client = null;
  if (project?.client_id) {
    const clients = await sbGet(`clients?id=eq.${project.client_id}&select=*&limit=1`);
    client = clients[0] || null;
  }
  if (!client) throw Object.assign(new Error('Could not resolve client for this invoice.'), { status: 400 });

  let profile;
  if (profile_id) {
    const rows = await sbGet(`company_profiles?id=eq.${profile_id}&select=id,settings&limit=1`);
    profile = rows[0] || null;
  } else {
    profile = await loadProfile(project?.company_id);
  }
  if (!profile?.settings?.quickbooks?.access_token) throw Object.assign(new Error('QuickBooks is not connected. Configure it in Settings.'), { status: 400 });

  let qb = await refreshQBTokenIfNeeded(profile.settings.quickbooks, profile.id);
  const creds = await loadQBCredentials();
  const apiBase = creds?.environment === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';
  const realm_id = qb.realm_id;
  if (!realm_id) throw Object.assign(new Error('realm_id missing from QB settings.'), { status: 400 });

  const qbHeaders = { Authorization: `Bearer ${qb.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' };

  let qb_customer_id = client.qb_customer_id || null;
  if (!qb_customer_id) {
    const customerBody = {
      DisplayName: client.name || client.full_name || `Client ${client.id}`,
      ...(client.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
      ...(client.phone ? { PrimaryPhone: { FreeFormNumber: client.phone } } : {}),
    };
    const custRes = await fetch(`${apiBase}/v3/company/${realm_id}/customer`, { method: 'POST', headers: qbHeaders, body: JSON.stringify(customerBody) });
    const custData = await custRes.json();
    if (!custRes.ok) throw new Error(custData?.Fault?.Error?.[0]?.Message || 'Failed to create QB customer.');
    qb_customer_id = custData?.Customer?.Id || null;
    if (!qb_customer_id) throw new Error('QB customer created but ID not returned.');
    await sbPatch(`clients?id=eq.${client.id}`, { qb_customer_id });
  }

  const invoiceBody = {
    Line: [{ Amount: invoice.amount, DetailType: 'SalesItemLineDetail', Description: invoice.notes || invoice.invoice_name || '', SalesItemLineDetail: { ItemRef: { value: '1', name: 'Services' }, Qty: 1, UnitPrice: invoice.amount } }],
    CustomerRef: { value: String(qb_customer_id) },
    ...(invoice.due_date ? { DueDate: invoice.due_date } : {}),
    ...(invoice.invoice_id ? { DocNumber: String(invoice.invoice_id) } : {}),
    ...(invoice.invoice_type ? { PrivateNote: invoice.invoice_type } : {}),
    BillEmail: { Address: client.email || '' },
    EmailStatus: 'NeedToSend',
  };

  const qbInvRes = await fetch(`${apiBase}/v3/company/${realm_id}/invoice`, { method: 'POST', headers: qbHeaders, body: JSON.stringify(invoiceBody) });
  const qbInvData = await qbInvRes.json();
  if (!qbInvRes.ok) throw new Error(qbInvData?.Fault?.Error?.[0]?.Message || 'Failed to create QB invoice.');

  const qb_invoice_id = qbInvData?.Invoice?.Id || null;
  if (!qb_invoice_id) throw new Error('QB invoice created but ID not returned.');

  const paymentBase = creds?.environment === 'production' ? 'https://app.qbo.intuit.com' : 'https://sandbox.qbo.intuit.com';
  const qb_payment_link = `${paymentBase}/app/invoice?txnId=${qb_invoice_id}`;

  await sbPatch(`invoices?id=eq.${invoice_id}`, { qb_invoice_id, qb_sync_status: 'synced', qb_last_synced_at: new Date().toISOString(), qb_payment_link, invoice_status: 'Sent' });

  return { qb_invoice_id, qb_payment_link, success: true };
}

async function handleSendInvoice(body) {
  const { qb_invoice_id, realm_id, profile_id, send_to_email } = body;
  if (!qb_invoice_id) throw Object.assign(new Error('qb_invoice_id is required.'), { status: 400 });
  if (!realm_id)      throw Object.assign(new Error('realm_id is required.'),      { status: 400 });

  let profile;
  if (profile_id) {
    const rows = await sbGet(`company_profiles?id=eq.${profile_id}&select=id,settings&limit=1`);
    profile = rows[0] || null;
  } else {
    const all = await sbGet('company_profiles?select=id,settings');
    profile = all.find(p => p.settings?.quickbooks?.access_token) || null;
  }
  if (!profile?.settings?.quickbooks?.access_token) throw Object.assign(new Error('QuickBooks is not connected.'), { status: 400 });

  let qb = await refreshQBTokenIfNeeded(profile.settings.quickbooks, profile.id);
  const creds = await loadQBCredentials();
  const apiBase = creds?.environment === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';

  let sendUrl = `${apiBase}/v3/company/${realm_id}/invoice/${qb_invoice_id}/send`;
  if (send_to_email) sendUrl += `?sendTo=${encodeURIComponent(send_to_email)}`;

  const sendRes = await fetch(sendUrl, { method: 'POST', headers: { Authorization: `Bearer ${qb.access_token}`, 'Content-Type': 'application/octet-stream', Accept: 'application/json' } });
  const sendData = await sendRes.json();
  if (!sendRes.ok) throw new Error(sendData?.Fault?.Error?.[0]?.Message || 'Failed to send QB invoice.');

  return { success: true };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server misconfiguration: missing service key.' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const { action } = body;
  if (!action) return res.status(400).json({ error: 'action is required.' });

  try {
    let result;
    if      (action === 'config-get')      result = await handleConfigGet();
    else if (action === 'config-save')     result = await handleConfigSave(body);
    else if (action === 'auth-url')        result = await handleAuthUrl(body);
    else if (action === 'callback')        result = await handleCallback(body);
    else if (action === 'refresh')         result = await handleRefresh(body);
    else if (action === 'create-invoice')  result = await handleCreateInvoice(body);
    else if (action === 'send-invoice')    result = await handleSendInvoice(body);
    else return res.status(400).json({ error: `Unknown action: ${action}` });

    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
};
