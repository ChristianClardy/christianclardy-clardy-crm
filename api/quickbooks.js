// QuickBooks Online API — one function (Vercel Hobby is at its 12-function
// limit), routed by `action`. The work lives in api/_lib/quickbooks.js.
//
// Staff only (POST { action, ... }):
//   status                         connection status, mappings, last sync
//   config-save                    { client_id, client_secret, environment, webhook_verifier }
//   auth-url                       { redirect_uri } → Intuit sign-in URL (signed state)
//   (sign-in return: GET /quickbooks/callback → ?action=oauth-callback, below)
//   disconnect
//   options                        items + accounts to map in Settings
//   settings-save                  { settings }
//   push-invoice                   { invoice_id, send?, send_to? } create/update (and email) in QuickBooks
//   push-payment / delete-payment  { payment_id }
//   push-bill / delete-bill        { sub_invoice_id }
//   sync                           { force? } pull changes from QuickBooks
//   job-pnl                        { project_id } QuickBooks profit & loss for the job
//   ar-aging                       open invoices by days late
// Public, verified by Intuit's signature:
//   POST /api/quickbooks?action=webhook
// Public, verified by the signed OAuth state (only staff can start sign-in):
//   GET /quickbooks/callback (vercel.json rewrite to ?action=oauth-callback):
//   Intuit's redirect after sign-in. Exchanges the code on the server and
//   answers with a 302 to Settings, never an HTML page, so the code in the
//   URL can't leak through a Referer header (Intuit security requirement).

const { requireStaff } = require('./_lib/staffAuth.js');
const qb = require('./_lib/quickbooks.js');

const readRaw = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { data += c; });
  req.on('end', () => resolve(data));
  req.on('error', reject);
});

async function handleWebhook(req, res) {
  // Read the raw body before anything parses it: the signature covers the
  // exact bytes, and touching req.body on Vercel would parse (and consume) it.
  const raw = await readRaw(req);
  if (!(await qb.verifyWebhook(raw, req.headers['intuit-signature']))) return res.status(401).json({ error: 'Bad signature' });
  try {
    await qb.sync({ force: true });
  } catch (err) {
    console.error('quickbooks webhook sync failed:', err.message);
  }
  return res.status(200).json({ ok: true });
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end();
}

async function handleOAuthCallback(req, res) {
  const { code, realmId, state, error } = req.query || {};
  const back = (params) => redirect(res, `/Settings?tab=quickbooks&${new URLSearchParams(params)}`);
  if (error) return back({ qb: 'error', reason: error === 'access_denied' ? 'denied' : 'failed' });
  if (!code || !realmId) return back({ qb: 'error', reason: 'failed' });
  try {
    await qb.exchangeCode({ code, realmId, state });
    return back({ qb: 'connected' });
  } catch (err) {
    console.error('quickbooks oauth callback failed:', err.message);
    return back({ qb: 'error', reason: /expired|not started/i.test(err.message) ? 'expired' : 'failed' });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (req.query?.action === 'oauth-callback') {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
    return handleOAuthCallback(req, res);
  }
  if (req.query?.action === 'webhook') {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    return handleWebhook(req, res);
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const user = await requireStaff(req, res);
  if (!user) return;

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  try {
    let result;
    switch (body.action) {
      case 'status':         result = await qb.status(); break;
      case 'config-save':    result = await saveConfig(body); break;
      case 'auth-url':       result = { auth_url: await qb.authUrl(required(body, 'redirect_uri'), user) }; break;
      case 'disconnect':     await qb.disconnect(); result = { ok: true }; break;
      case 'options':        result = await qb.listOptions(); break;
      case 'settings-save':  result = await qb.saveSettings(body.settings || {}); break;
      case 'push-invoice':   result = await qb.pushInvoice(required(body, 'invoice_id'), { send: !!body.send, sendTo: body.send_to }); break;
      case 'push-payment':   result = await qb.pushPayment(required(body, 'payment_id')); break;
      case 'delete-payment': result = await qb.deletePayment(required(body, 'payment_id')); break;
      case 'push-bill':      result = await qb.pushBill(required(body, 'sub_invoice_id')); break;
      case 'delete-bill':    result = await qb.deleteBill(required(body, 'sub_invoice_id')); break;
      case 'sync':           result = await qb.sync({ force: !!body.force, minIntervalMs: body.force ? 0 : 5 * 60 * 1000 }); break;
      case 'job-pnl':        result = await qb.jobPnl(required(body, 'project_id')); break;
      case 'ar-aging':       result = await qb.arAging(); break;
      default: return res.status(400).json({ error: `Unknown action: ${body.action || '(none)'}` });
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

function required(body, key) {
  if (!body[key]) throw qb.httpError(400, `${key} is required.`);
  return body[key];
}

// App keys from developer.intuit.com. A blank secret / verifier keeps the
// saved one, so the form never has to show them.
async function saveConfig(body) {
  const { client_id, client_secret, environment, webhook_verifier } = body;
  if (!client_id) throw qb.httpError(400, 'Client ID is required.');
  if (!['sandbox', 'production'].includes(environment)) throw qb.httpError(400, 'Pick Sandbox or Production.');
  const current = await qb.getCredentials();
  const secret = client_secret || current?.client_secret;
  if (!secret) throw qb.httpError(400, 'Client Secret is required.');
  const { sbFetch } = require('./_lib/supabaseAdmin.js');
  const row = { id: 1, client_id, client_secret: secret, environment, webhook_verifier: webhook_verifier || current?.webhook_verifier || null };
  await sbFetch('quickbooks_credentials', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return { client_id, environment, webhook_configured: !!row.webhook_verifier };
}
