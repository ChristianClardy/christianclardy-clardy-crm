// QuickBooks Online: connection, sync and reports (server only).
//
// Used by api/quickbooks.js (actions) and api/cron.js (daily sync).
// Tokens live in quickbooks_connection, which only the service role can read
// (048_quickbooks_sync.sql). quickbooks_links maps app records to QuickBooks
// records so nothing is created twice:
//   client  → Customer             project     → Customer (sub-customer job)
//   invoice → Invoice              payment     → Payment
//   sub_invoice → Bill             vendor (name) → Vendor
// Simple Start / Essentials have no Projects, so a job is a sub-customer of
// the client (Job=true, BillWithParent=true); income and costs coded to it
// roll up per job in QuickBooks reports.

const crypto = require('crypto');
const { sbFetch, sbList, sbGetById, sbInsert, sbUpdate } = require('./supabaseAdmin.js');

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const QB_SCOPE = 'com.intuit.quickbooks.accounting';
const MINOR_VERSION = '75';
const OPEN_PROJECT_STATUSES = new Set(['planning', 'in_progress', 'on_hold']);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const qbStr = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
// QuickBooks names: max 100 chars, no colons (colons separate sub-customers).
const qbName = (s) => String(s || '').replace(/[:\t\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);

// ─── Credentials & connection ───────────────────────────────────────────────

async function getCredentials() {
  return (await sbList('quickbooks_credentials', { limit: 1 }))[0] || null;
}

async function getConnection() {
  return (await sbList('quickbooks_connection', { filters: { id: 'eq.1' }, limit: 1 }))[0] || null;
}

async function saveConnection(patch) {
  const existing = await getConnection();
  const row = { ...patch, updated_at: new Date().toISOString() };
  if (existing) return sbUpdate('quickbooks_connection', 1, row);
  return sbInsert('quickbooks_connection', { id: 1, ...row });
}

const apiBase = (creds) => (creds?.environment === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com');

const basicAuth = (creds) => `Basic ${Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64')}`;

// OAuth state: signed so a forged callback can't attach someone else's
// QuickBooks company. Valid for 15 minutes.
function signState(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', `qb-state:${SERVICE_KEY}`).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', `qb-state:${SERVICE_KEY}`).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return Date.now() - data.t < 15 * 60 * 1000 ? data : null;
  } catch { return null; }
}

async function authUrl(redirectUri, user) {
  const creds = await getCredentials();
  if (!creds?.client_id) throw httpError(400, 'Add your Intuit app keys first.');
  const params = new URLSearchParams({
    client_id: creds.client_id,
    scope: QB_SCOPE,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: signState({ u: user?.email || user?.id || '' }),
  });
  return `${QB_AUTH_URL}?${params}`;
}

async function exchangeCode({ code, realmId, state, redirectUri }) {
  const st = readState(state);
  if (!st) throw httpError(400, 'This QuickBooks sign-in link expired or was not started from Clardy. Click Connect again.');
  const creds = await getCredentials();
  if (!creds?.client_id) throw httpError(400, 'QuickBooks app keys are missing.');
  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(creds), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  const tok = await res.json();
  if (!res.ok) throw new Error(tok.error_description || tok.error || 'QuickBooks did not accept the sign-in.');

  const previous = await getConnection();
  const sameCompany = previous?.realm_id === realmId;
  await saveConnection({
    realm_id: realmId,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    refresh_expires_at: tok.x_refresh_token_expires_in ? new Date(Date.now() + tok.x_refresh_token_expires_in * 1000).toISOString() : null,
    connected_by: st.u || null,
    connected_at: new Date().toISOString(),
    // A different QuickBooks company: start fresh (old links point at the old file).
    ...(sameCompany ? {} : { settings: {}, last_sync_at: null, last_sync_result: null }),
  });
  if (previous && !sameCompany) await sbFetch('quickbooks_links?id=not.is.null', { method: 'DELETE' });

  const info = await qbRequest(`/companyinfo/${realmId}`).catch(() => null);
  const company_name = info?.CompanyInfo?.CompanyName || null;
  await saveConnection({ company_name });
  return { company_name };
}

async function disconnect() {
  const conn = await getConnection();
  const creds = await getCredentials();
  if (conn?.refresh_token && creds?.client_id) {
    await fetch(QB_REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: basicAuth(creds), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: conn.refresh_token }),
    }).catch(() => {});
  }
  // Links are kept so reconnecting the same company picks up where it left off.
  await sbFetch('quickbooks_connection?id=eq.1', { method: 'DELETE' });
}

async function refreshIfNeeded(conn, creds, force = false) {
  const expires = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (!force && expires - Date.now() > 5 * 60 * 1000) return conn;
  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(creds), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
  });
  const tok = await res.json();
  if (!res.ok) throw httpError(401, 'QuickBooks sign-in expired. Reconnect in Settings → QuickBooks.');
  return saveConnection({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || conn.refresh_token,
    expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    ...(tok.x_refresh_token_expires_in ? { refresh_expires_at: new Date(Date.now() + tok.x_refresh_token_expires_in * 1000).toISOString() } : {}),
  });
}

// path is relative to /v3/company/{realm}. Returns parsed JSON; throws with
// QuickBooks' own message (and .code, e.g. 6240 duplicate name).
async function qbRequest(path, { method = 'GET', body, query = {}, raw = false, retried = false } = {}) {
  const creds = await getCredentials();
  let conn = await getConnection();
  if (!creds || !conn) throw httpError(400, 'QuickBooks is not connected. Connect it in Settings → QuickBooks.');
  conn = await refreshIfNeeded(conn, creds);
  const params = new URLSearchParams({ minorversion: MINOR_VERSION, ...query });
  const res = await fetch(`${apiBase(creds)}/v3/company/${conn.realm_id}${path}?${params}`, {
    method,
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: raw ? body : JSON.stringify(body) } : {}),
  });
  if (res.status === 401 && !retried) {
    await refreshIfNeeded(conn, creds, true);
    return qbRequest(path, { method, body, query, raw, retried: true });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok || data.Fault) {
    const err = data.Fault?.Error?.[0];
    throw Object.assign(new Error(err ? `QuickBooks: ${err.Message}${err.Detail ? ` (${err.Detail})` : ''}` : `QuickBooks error ${res.status}`), { status: res.status >= 500 ? 502 : 400, code: err?.code });
  }
  return data;
}

async function qbQuery(sql) {
  const data = await qbRequest('/query', { query: { query: sql } });
  return data.QueryResponse || {};
}

// ─── Links ──────────────────────────────────────────────────────────────────

async function getLink(entityType, entityId) {
  return (await sbList('quickbooks_links', { filters: { entity_type: `eq.${entityType}`, entity_id: `eq.${entityId}` }, limit: 1 }))[0] || null;
}
async function getLinkByQb(qbType, qbId) {
  return (await sbList('quickbooks_links', { filters: { qb_type: `eq.${qbType}`, qb_id: `eq.${qbId}` }, limit: 1 }))[0] || null;
}
async function setLink(entityType, entityId, qbType, qbId, syncToken, origin = 'app') {
  const existing = await getLink(entityType, entityId);
  const row = { qb_type: qbType, qb_id: String(qbId), sync_token: syncToken ?? null, synced_at: new Date().toISOString() };
  if (existing) return sbFetch(`quickbooks_links?id=eq.${existing.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  return sbInsert('quickbooks_links', { entity_type: entityType, entity_id: String(entityId), origin, ...row });
}
async function removeLink(entityType, entityId) {
  await sbFetch(`quickbooks_links?entity_type=eq.${entityType}&entity_id=eq.${encodeURIComponent(entityId)}`, { method: 'DELETE' });
}

// ─── Customers, jobs, vendors ───────────────────────────────────────────────

async function findByName(entity, displayName) {
  const r = await qbQuery(`select * from ${entity} where DisplayName = '${qbStr(displayName)}'`);
  return r[entity]?.[0] || null;
}

// Creates a named entity, reusing an existing one with the same name.
async function createNamed(entity, body, { reuse = () => true, alternate } = {}) {
  try {
    const data = await qbRequest(`/${entity.toLowerCase()}`, { method: 'POST', body });
    return data[entity];
  } catch (err) {
    if (String(err.code) !== '6240') throw err; // 6240 = duplicate name
    const existing = await findByName(entity, body.DisplayName);
    if (existing && reuse(existing)) return existing;
    if (!alternate) throw err;
    return createNamed(entity, { ...body, DisplayName: alternate }, { reuse });
  }
}

async function ensureCustomer(client) {
  const link = await getLink('client', client.id);
  if (link) return link.qb_id;
  if (client.qb_customer_id) { await setLink('client', client.id, 'Customer', client.qb_customer_id); return client.qb_customer_id; }
  const name = qbName(client.name || client.contact_person || client.email || `Client ${client.id.slice(0, 8)}`);
  const customer = await createNamed('Customer', {
    DisplayName: name,
    ...(client.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
    ...(client.phone ? { PrimaryPhone: { FreeFormNumber: client.phone } } : {}),
    ...(client.address ? { BillAddr: { Line1: client.address } } : {}),
    ...(client.company ? { CompanyName: qbName(client.company) } : {}),
  }, { reuse: (c) => !c.Job, alternate: qbName(`${name} (Client)`) });
  await setLink('client', client.id, 'Customer', customer.Id, customer.SyncToken);
  await sbUpdate('clients', client.id, { qb_customer_id: customer.Id }).catch(() => {});
  return customer.Id;
}

// The project's job (sub-customer of its client). Without a client, the job
// is a top-level customer named after the project.
async function ensureJob(project) {
  const link = await getLink('project', project.id);
  if (link) return link.qb_id;
  const client = project.client_id ? await sbGetById('clients', project.client_id) : null;
  const parentId = client ? await ensureCustomer(client) : null;
  const name = qbName(project.name || `Project ${project.id.slice(0, 8)}`);
  const body = {
    DisplayName: name,
    ...(parentId ? { Job: true, ParentRef: { value: parentId }, BillWithParent: true } : {}),
    ...(project.address ? { ShipAddr: { Line1: project.address } } : {}),
    ...(client?.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
  };
  const job = await createNamed('Customer', body, {
    reuse: (c) => (parentId ? c.ParentRef?.value === parentId : !c.Job),
    alternate: qbName(`${name} - ${client?.name || 'Job'}`),
  });
  await setLink('project', project.id, 'Customer', job.Id, job.SyncToken);
  return job.Id;
}

const vendorKey = (name) => String(name || '').trim().toLowerCase();

async function ensureVendor(name) {
  const key = vendorKey(name);
  if (!key) throw httpError(400, 'Add the vendor / subcontractor name first.');
  const link = await getLink('vendor', key);
  if (link) return link.qb_id;
  const sub = (await sbList('subcontractors', { filters: { name: `ilike.${String(name).trim()}` }, limit: 1 }).catch(() => []))[0];
  const display = qbName(name);
  const vendor = await createNamed('Vendor', {
    DisplayName: display,
    ...(sub?.email ? { PrimaryEmailAddr: { Address: sub.email } } : {}),
    ...(sub?.phone ? { PrimaryPhone: { FreeFormNumber: sub.phone } } : {}),
    ...(sub?.contact_person ? { GivenName: qbName(sub.contact_person).slice(0, 25) } : {}),
  }, { alternate: qbName(`${display} (Vendor)`) });
  await setLink('vendor', key, 'Vendor', vendor.Id, vendor.SyncToken);
  return vendor.Id;
}

// ─── Options for Settings ───────────────────────────────────────────────────

async function listOptions() {
  const [items, accounts] = await Promise.all([
    qbQuery("select Id, Name, Type, Active from Item where Active = true maxresults 1000"),
    qbQuery("select Id, Name, AccountType, Active from Account where Active = true maxresults 1000"),
  ]);
  const acct = accounts.Account || [];
  return {
    items: (items.Item || []).filter((i) => ['Service', 'NonInventory'].includes(i.Type)).map((i) => ({ id: i.Id, name: i.Name })),
    expense_accounts: acct.filter((a) => ['Cost of Goods Sold', 'Expense', 'Other Expense'].includes(a.AccountType)).map((a) => ({ id: a.Id, name: a.Name, type: a.AccountType })),
    deposit_accounts: acct.filter((a) => ['Bank', 'Other Current Asset'].includes(a.AccountType)).map((a) => ({ id: a.Id, name: a.Name, type: a.AccountType })),
  };
}

async function requireSettings(keys) {
  const conn = await getConnection();
  if (!conn) throw httpError(400, 'QuickBooks is not connected. Connect it in Settings → QuickBooks.');
  const s = conn.settings || {};
  const missing = keys.filter((k) => !s[k]);
  if (missing.length) {
    const label = { income_item_id: 'the product/service invoices are booked to', expense_account_id: 'the account sub bills are coded to' };
    throw httpError(400, `Pick ${missing.map((k) => label[k] || k).join(' and ')} in Settings → QuickBooks first.`);
  }
  return s;
}

// ─── Invoices ───────────────────────────────────────────────────────────────

function invoiceLines(invoice, itemId) {
  const items = (Array.isArray(invoice.line_items) ? invoice.line_items : [])
    .map((li) => ({
      description: li.description || li.name || li.item || '',
      qty: Number(li.quantity ?? li.qty ?? 1) || 1,
      amount: money(li.amount ?? li.total ?? (Number(li.quantity ?? li.qty ?? 1) * Number(li.unit_price ?? li.rate ?? 0))),
    }))
    .filter((li) => li.amount);
  const lines = items.length ? items : [{ description: invoice.notes || invoice.invoice_name || 'Progress payment', qty: 1, amount: money(invoice.amount) }];
  return lines.map((li) => ({
    Amount: li.amount,
    DetailType: 'SalesItemLineDetail',
    Description: String(li.description).slice(0, 4000),
    SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: li.qty, UnitPrice: money(li.amount / li.qty) },
  }));
}

// Creates or updates the QuickBooks invoice. With send=true QuickBooks emails
// it to the client (with the Pay now link when QuickBooks Payments is on).
async function pushInvoice(invoiceId, { send = false, sendTo } = {}) {
  const s = await requireSettings(['income_item_id']);
  const invoice = await sbGetById('invoices', invoiceId);
  if (!invoice) throw httpError(404, 'Invoice not found.');
  const project = invoice.linked_job_id ? await sbGetById('projects', invoice.linked_job_id) : null;
  if (!project) throw httpError(400, 'Link this invoice to a project first.');
  const client = project.client_id ? await sbGetById('clients', project.client_id) : null;
  const jobId = await ensureJob(project);
  const email = sendTo || client?.email || '';

  const body = {
    CustomerRef: { value: jobId },
    Line: invoiceLines(invoice, s.income_item_id),
    ...(invoice.due_date ? { DueDate: invoice.due_date } : {}),
    ...(invoice.invoice_id ? { DocNumber: String(invoice.invoice_id).slice(0, 21) } : {}),
    ...(email ? { BillEmail: { Address: email } } : {}),
    CustomerMemo: { value: String(invoice.invoice_name || '').slice(0, 1000) },
    PrivateNote: `Clardy invoice ${invoice.id}${invoice.invoice_type ? ` · ${invoice.invoice_type}` : ''}`,
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true,
  };

  const link = await getLink('invoice', invoice.id) || (invoice.qb_invoice_id ? { qb_id: invoice.qb_invoice_id } : null);
  let qbInv;
  if (link) {
    const current = (await qbRequest(`/invoice/${link.qb_id}`)).Invoice;
    qbInv = (await qbRequest('/invoice', { method: 'POST', body: { ...body, Id: current.Id, SyncToken: current.SyncToken, sparse: true } })).Invoice;
  } else {
    qbInv = (await qbRequest('/invoice', { method: 'POST', body })).Invoice;
  }

  if (send) {
    if (!email) throw httpError(400, 'The client has no email address. Add one to send through QuickBooks.');
    await qbRequest(`/invoice/${qbInv.Id}/send`, { method: 'POST', body: '', raw: true, query: { sendTo: email } });
  }

  // Customer-facing pay link (QuickBooks Payments must be on for it to exist).
  const withLink = await qbRequest(`/invoice/${qbInv.Id}`, { query: { include: 'invoiceLink' } }).catch(() => null);
  const payLink = withLink?.Invoice?.InvoiceLink || null;
  const latest = withLink?.Invoice || qbInv;

  await setLink('invoice', invoice.id, 'Invoice', latest.Id, latest.SyncToken);
  const balance = Number(latest.Balance ?? latest.TotalAmt);
  await sbUpdate('invoices', invoice.id, {
    qb_invoice_id: latest.Id,
    qb_sync_status: 'synced',
    qb_last_synced_at: new Date().toISOString(),
    qb_payment_link: payLink,
    invoice_status: balance <= 0 && Number(latest.TotalAmt) > 0 ? 'paid' : (send || invoice.invoice_status !== 'draft' ? 'sent' : invoice.invoice_status),
    ...(send ? { date_sent: today() } : {}),
  });
  return { qb_invoice_id: latest.Id, pay_link: payLink, sent: !!send, email: send ? email : null, online_payments: !!payLink };
}

// ─── Payments ───────────────────────────────────────────────────────────────

async function recomputeProjectPaid(projectId) {
  if (!projectId) return;
  const rows = await sbList('payments', { select: 'amount_received', filters: { linked_job_id: `eq.${projectId}` } });
  const received = money(rows.reduce((s, r) => s + (Number(r.amount_received) || 0), 0));
  await sbUpdate('projects', projectId, { billed_to_date: received }).catch(() => {});
  // Payments drive the draw schedule (050_payments_drive_draws.sql).
  await sbFetch('rpc/reconcile_project_draws', { method: 'POST', body: JSON.stringify({ p_project_id: projectId }) }).catch(() => {});
}

// Records an app payment in QuickBooks, applied to the job's oldest open
// invoices (anything left over stays as a customer credit in QuickBooks).
async function pushPayment(paymentId) {
  const payment = await sbGetById('payments', paymentId);
  if (!payment) throw httpError(404, 'Payment not found.');
  const existing = await getLink('payment', payment.id);
  if (existing?.origin === 'qb') return { skipped: true, reason: 'Recorded in QuickBooks' };
  const project = payment.linked_job_id ? await sbGetById('projects', payment.linked_job_id) : null;
  if (!project) throw httpError(400, 'Link this payment to a project first.');
  const s = (await getConnection())?.settings || {};
  const jobId = await ensureJob(project);

  // An edit replaces the QuickBooks payment so it re-applies correctly.
  if (existing) await deleteQbPayment(existing.qb_id);

  const open = (await qbQuery(`select * from Invoice where CustomerRef = '${qbStr(jobId)}' and Balance > '0' orderby TxnDate`)).Invoice || [];
  let left = money(payment.amount_received);
  const lines = [];
  for (const inv of open) {
    if (left <= 0) break;
    const apply = money(Math.min(left, Number(inv.Balance)));
    lines.push({ Amount: apply, LinkedTxn: [{ TxnId: inv.Id, TxnType: 'Invoice' }] });
    left = money(left - apply);
  }
  const body = {
    CustomerRef: { value: jobId },
    TotalAmt: money(payment.amount_received),
    TxnDate: payment.payment_date || today(),
    ...(payment.reference_number ? { PaymentRefNum: String(payment.reference_number).slice(0, 21) } : {}),
    ...(s.deposit_account_id ? { DepositToAccountRef: { value: s.deposit_account_id } } : {}),
    PrivateNote: [`Clardy payment ${payment.id}`, payment.payment_method, payment.notes].filter(Boolean).join(' · ').slice(0, 4000),
    ...(lines.length ? { Line: lines } : {}),
  };
  const qbPay = (await qbRequest('/payment', { method: 'POST', body })).Payment;
  await setLink('payment', payment.id, 'Payment', qbPay.Id, qbPay.SyncToken, 'app');
  await markPaidInvoices(lines.map((l) => l.LinkedTxn[0].TxnId));
  return { qb_payment_id: qbPay.Id, applied_to: lines.length, unapplied: left };
}

async function deleteQbPayment(qbId) {
  const current = await qbRequest(`/payment/${qbId}`).then((d) => d.Payment).catch(() => null);
  if (current) await qbRequest('/payment', { method: 'POST', query: { operation: 'delete' }, body: { Id: current.Id, SyncToken: current.SyncToken } });
}

// The app payment was deleted: remove its QuickBooks payment too (only ones
// the app created; QuickBooks-entered payments are left alone).
async function deletePayment(paymentId) {
  const link = await getLink('payment', paymentId);
  if (!link) return { skipped: true };
  if (link.origin === 'app') await deleteQbPayment(link.qb_id);
  await removeLink('payment', paymentId);
  return { deleted: link.origin === 'app' };
}

async function markPaidInvoices(qbInvoiceIds) {
  for (const id of new Set(qbInvoiceIds)) {
    const inv = (await qbRequest(`/invoice/${id}`).catch(() => null))?.Invoice;
    if (inv) await applyQbInvoice(inv);
  }
}

// ─── Bills (subcontractor / vendor invoices) ────────────────────────────────

async function pushBill(subInvoiceId) {
  const s = await requireSettings(['expense_account_id']);
  const bill = await sbGetById('sub_invoices', subInvoiceId);
  if (!bill) throw httpError(404, 'Sub invoice not found.');
  const project = bill.project_id ? await sbGetById('projects', bill.project_id) : null;
  const vendorId = await ensureVendor(bill.vendor_name);
  const jobId = project ? await ensureJob(project) : null;
  const body = {
    VendorRef: { value: vendorId },
    TxnDate: (bill.created_at || new Date().toISOString()).slice(0, 10),
    ...(bill.due_date ? { DueDate: bill.due_date } : {}),
    ...(bill.invoice_number ? { DocNumber: String(bill.invoice_number).slice(0, 21) } : {}),
    PrivateNote: [`Clardy sub invoice ${bill.id}`, bill.notes].filter(Boolean).join(' · ').slice(0, 4000),
    Line: [{
      Amount: money(bill.amount),
      DetailType: 'AccountBasedExpenseLineDetail',
      Description: [project?.name, bill.cost_code && `Cost code ${bill.cost_code}`, bill.invoice_number && `Inv ${bill.invoice_number}`].filter(Boolean).join(' · ').slice(0, 4000),
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: s.expense_account_id },
        ...(jobId ? { CustomerRef: { value: jobId } } : {}),
        BillableStatus: 'NotBillable',
      },
    }],
  };
  const link = await getLink('sub_invoice', bill.id);
  let qbBill;
  if (link) {
    const current = (await qbRequest(`/bill/${link.qb_id}`)).Bill;
    qbBill = (await qbRequest('/bill', { method: 'POST', body: { ...body, Id: current.Id, SyncToken: current.SyncToken } })).Bill;
  } else {
    qbBill = (await qbRequest('/bill', { method: 'POST', body })).Bill;
  }
  await setLink('sub_invoice', bill.id, 'Bill', qbBill.Id, qbBill.SyncToken);
  return { qb_bill_id: qbBill.Id };
}

async function deleteBill(subInvoiceId) {
  const link = await getLink('sub_invoice', subInvoiceId);
  if (!link) return { skipped: true };
  const current = (await qbRequest(`/bill/${link.qb_id}`).catch(() => null))?.Bill;
  if (current) await qbRequest('/bill', { method: 'POST', query: { operation: 'delete' }, body: { Id: current.Id, SyncToken: current.SyncToken } });
  await removeLink('sub_invoice', subInvoiceId);
  return { deleted: true };
}

// ─── Pull from QuickBooks ───────────────────────────────────────────────────

async function applyQbInvoice(inv) {
  const link = await getLinkByQb('Invoice', inv.Id);
  if (!link) return false;
  const paid = Number(inv.Balance) <= 0 && Number(inv.TotalAmt) > 0;
  const row = await sbGetById('invoices', link.entity_id);
  if (!row) return false;
  const status = paid ? 'paid' : (row.invoice_status === 'paid' ? 'sent' : row.invoice_status);
  if (status !== row.invoice_status) await sbUpdate('invoices', row.id, { invoice_status: status, qb_last_synced_at: new Date().toISOString() });
  await setLink('invoice', row.id, 'Invoice', inv.Id, inv.SyncToken);
  return status !== row.invoice_status;
}

// Which project a QuickBooks customer is: a linked job, else a linked
// client's single open project.
async function projectForCustomer(customerId) {
  const job = await getLinkByQb('Customer', customerId);
  if (!job) return null;
  if (job.entity_type === 'project') return sbGetById('projects', job.entity_id);
  if (job.entity_type === 'client') {
    const projects = await sbList('projects', { filters: { client_id: `eq.${job.entity_id}` } });
    const open = projects.filter((p) => OPEN_PROJECT_STATUSES.has(p.status));
    return open.length === 1 ? open[0] : null;
  }
  return null;
}

async function applyQbPayment(pay, result) {
  const link = await getLinkByQb('Payment', pay.Id);
  if (pay.status === 'Deleted') {
    if (link?.origin === 'qb') {
      const row = await sbGetById('payments', link.entity_id);
      await sbFetch(`payments?id=eq.${link.entity_id}`, { method: 'DELETE' });
      await removeLink('payment', link.entity_id);
      await recomputeProjectPaid(row?.linked_job_id);
      result.payments_removed++;
    }
    return;
  }
  for (const line of pay.Line || []) {
    for (const t of line.LinkedTxn || []) if (t.TxnType === 'Invoice') result._invoices.add(t.TxnId);
  }
  if (link?.origin === 'app') return; // the app created it; nothing to bring back
  const fields = {
    amount_received: money(pay.TotalAmt),
    payment_date: pay.TxnDate,
    payment_method: pay.PaymentMethodRef?.name || (pay.CreditCardPayment ? 'Credit Card' : 'QuickBooks'),
    reference_number: pay.PaymentRefNum || null,
  };
  if (link) {
    const row = await sbGetById('payments', link.entity_id);
    if (row) {
      await sbUpdate('payments', row.id, fields);
      await setLink('payment', row.id, 'Payment', pay.Id, pay.SyncToken, 'qb');
      await recomputeProjectPaid(row.linked_job_id);
      result.payments_updated++;
      return;
    }
  }
  const project = pay.CustomerRef?.value ? await projectForCustomer(pay.CustomerRef.value) : null;
  if (!project) { result.unmatched.push(`Payment of $${money(pay.TotalAmt).toFixed(2)} from ${pay.CustomerRef?.name || 'unknown customer'} on ${pay.TxnDate}`); return; }
  const row = await sbInsert('payments', {
    ...fields,
    linked_job_id: project.id,
    notes: 'Recorded in QuickBooks',
    ...(project.organization_id ? { organization_id: project.organization_id } : {}),
    ...(project.company_id ? { company_id: project.company_id } : {}),
  });
  await setLink('payment', row.id, 'Payment', pay.Id, pay.SyncToken, 'qb');
  await recomputeProjectPaid(project.id);
  result.payments_added++;
}

async function applyQbBill(bill, result) {
  const link = await getLinkByQb('Bill', bill.Id);
  if (!link) return;
  if (bill.status === 'Deleted') { await removeLink('sub_invoice', link.entity_id); return; }
  const row = await sbGetById('sub_invoices', link.entity_id);
  if (!row) return;
  const paid = Number(bill.Balance) <= 0;
  if (paid && row.status !== 'paid') {
    await sbUpdate('sub_invoices', row.id, { status: 'paid', paid_date: row.paid_date || today() });
    result.bills_paid++;
  } else if (!paid && row.status === 'paid' && Number(bill.Balance) > 0) {
    await sbUpdate('sub_invoices', row.id, { status: 'approved', paid_date: null });
  }
  await setLink('sub_invoice', row.id, 'Bill', bill.Id, bill.SyncToken);
}

// Pulls what changed in QuickBooks since the last sync (Change Data Capture,
// max 30 days back). Safe to run any number of times.
async function sync({ force = false, minIntervalMs = 0 } = {}) {
  const conn = await getConnection();
  if (!conn) throw httpError(400, 'QuickBooks is not connected.');
  if (!force && minIntervalMs && conn.last_sync_at && Date.now() - new Date(conn.last_sync_at).getTime() < minIntervalMs) {
    return { skipped: true, last_sync_at: conn.last_sync_at, ...(conn.last_sync_result || {}) };
  }
  const startedAt = new Date().toISOString();
  const thirtyDaysAgo = Date.now() - 29 * 86400000;
  const since = new Date(Math.max(thirtyDaysAgo, conn.last_sync_at ? new Date(conn.last_sync_at).getTime() - 5 * 60000 : thirtyDaysAgo)).toISOString();
  const data = await qbRequest('/cdc', { query: { entities: 'Payment,Invoice,Bill', changedSince: since } });
  const result = { payments_added: 0, payments_updated: 0, payments_removed: 0, invoices_updated: 0, bills_paid: 0, unmatched: [], _invoices: new Set() };
  const groups = data.CDCResponse?.[0]?.QueryResponse || [];
  const of = (name) => groups.flatMap((g) => g[name] || []);
  for (const pay of of('Payment')) await applyQbPayment(pay, result);
  const invoices = of('Invoice');
  for (const inv of invoices) { if (await applyQbInvoice(inv)) result.invoices_updated++; result._invoices.delete(inv.Id); }
  for (const id of result._invoices) {
    const inv = (await qbRequest(`/invoice/${id}`).catch(() => null))?.Invoice;
    if (inv && await applyQbInvoice(inv)) result.invoices_updated++;
  }
  for (const bill of of('Bill')) await applyQbBill(bill, result);
  delete result._invoices;
  await saveConnection({ last_sync_at: startedAt, last_sync_result: result });
  return { ...result, last_sync_at: startedAt };
}

// ─── Reports ────────────────────────────────────────────────────────────────

function reportGroups(report) {
  const out = {};
  const walk = (rows) => {
    for (const row of rows || []) {
      if (row.group && row.Summary?.ColData) out[row.group] = Number(row.Summary.ColData[row.Summary.ColData.length - 1]?.value) || 0;
      if (row.Rows?.Row) walk(row.Rows.Row);
    }
  };
  walk(report?.Rows?.Row);
  return out;
}

async function jobPnl(projectId) {
  const link = await getLink('project', projectId);
  if (!link) return { linked: false };
  const report = await qbRequest('/reports/ProfitAndLoss', { query: { customer: link.qb_id, start_date: '2000-01-01', end_date: today(), accounting_method: 'Accrual' } });
  const g = reportGroups(report);
  const income = money(g.Income);
  const cogs = money(g.COGS);
  const expenses = money(g.Expenses);
  return {
    linked: true,
    income,
    cost_of_goods_sold: cogs,
    expenses,
    total_costs: money(cogs + expenses + (g.OtherExpenses || 0)),
    net_income: money(g.NetIncome ?? income - cogs - expenses),
    as_of: today(),
  };
}

async function arAging() {
  const open = (await qbQuery("select * from Invoice where Balance > '0' maxresults 1000")).Invoice || [];
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  const now = Date.now();
  const rows = [];
  for (const inv of open) {
    const due = inv.DueDate ? new Date(`${inv.DueDate}T00:00:00`).getTime() : now;
    const late = Math.floor((now - due) / 86400000);
    const bal = money(inv.Balance);
    const key = late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90_plus';
    buckets[key] = money(buckets[key] + bal);
    const job = await getLinkByQb('Customer', inv.CustomerRef?.value);
    rows.push({ qb_invoice_id: inv.Id, doc_number: inv.DocNumber || null, customer: inv.CustomerRef?.name || '', project_id: job?.entity_type === 'project' ? job.entity_id : null, due_date: inv.DueDate || null, days_late: Math.max(0, late), balance: bal });
  }
  rows.sort((a, b) => b.days_late - a.days_late);
  return { total: money(Object.values(buckets).reduce((s, v) => s + v, 0)), buckets, invoices: rows };
}

// ─── Webhooks ───────────────────────────────────────────────────────────────

async function verifyWebhook(rawBody, signature) {
  const creds = await getCredentials();
  if (!creds?.webhook_verifier || !signature) return false;
  const expected = crypto.createHmac('sha256', creds.webhook_verifier).update(rawBody).digest('base64');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function status() {
  const creds = await getCredentials();
  const conn = await getConnection();
  return {
    configured: !!creds?.client_id,
    client_id: creds?.client_id || null,
    environment: creds?.environment || null,
    webhook_configured: !!creds?.webhook_verifier,
    connected: !!conn,
    company_name: conn?.company_name || null,
    realm_id: conn?.realm_id || null,
    connected_at: conn?.connected_at || null,
    connected_by: conn?.connected_by || null,
    refresh_expires_at: conn?.refresh_expires_at || null,
    settings: conn?.settings || {},
    last_sync_at: conn?.last_sync_at || null,
    last_sync_result: conn?.last_sync_result || null,
  };
}

async function saveSettings(settings) {
  const conn = await getConnection();
  if (!conn) throw httpError(400, 'Connect QuickBooks first.');
  const allowed = ['income_item_id', 'income_item_name', 'expense_account_id', 'expense_account_name', 'deposit_account_id', 'deposit_account_name', 'auto_push_payments', 'auto_push_bills'];
  const next = { ...(conn.settings || {}) };
  for (const k of allowed) if (k in settings) next[k] = settings[k];
  await saveConnection({ settings: next });
  return next;
}

module.exports = {
  getCredentials, getConnection, authUrl, exchangeCode, disconnect, status, saveSettings, listOptions,
  pushInvoice, pushPayment, deletePayment, pushBill, deleteBill, sync, jobPnl, arAging, verifyWebhook,
  httpError,
};
