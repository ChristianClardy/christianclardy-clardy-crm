// Per-company Stripe Invoicing. Test mode only.
//
// Each company connects its own Stripe account with Connect Standard
// (OAuth). The platform secret key stays in the environment. Calls for a
// company send Stripe-Account: acct_... . OAuth tokens are not stored.
//
// Drafts use collection_method=send_invoice and auto_advance=false.
// Finalize & Send is a separate staff action. Payments are the record of
// money received. This file does not send email or text through Resend
// or Twilio. Stripe's own invoice email runs only from Finalize & Send.
//
// Env (names only; never log the values):
//   STRIPE_SECRET_KEY                  platform test key (sk_test_...). Live keys are refused.
//   STRIPE_CONNECT_CLIENT_ID           Connect client id (ca_...) from the test Connect settings.
//   STRIPE_INVOICING_WEBHOOK_SECRET    signing secret for the connected-account webhook.
// The SaaS subscription webhook keeps STRIPE_WEBHOOK_SECRET and
// POST /api/invite?action=billing-webhook. Do not point both at one secret.

const crypto = require('crypto');
const billing = require('./billing.js');
const { sbFetch, sbList, sbGetById, sbInsert, sbUpdate } = require('./supabaseAdmin.js');

const SUPABASE_URL = 'https://fneasddxtejasvsojgcu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOUNDING_ORG_ID = '2c9485d2-9b17-48d4-bea7-72770c1e9eb9';

const INVOICING_ENV = ['STRIPE_SECRET_KEY', 'STRIPE_CONNECT_CLIENT_ID', 'STRIPE_INVOICING_WEBHOOK_SECRET'];
const DEPOSIT_FRACTION = 0.5;
const DEFAULT_TAX_RATE = 0.0825;
const DEFAULT_DAYS = 14;
const HANDLED_EVENTS = new Set([
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.finalized',
  'charge.refunded',
  'credit_note.created',
  'customer_cash_balance_transaction.created',
  'cash_balance.funds_available',
]);

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function taxOn(taxable, rate) {
  const cents = Math.round(Number(taxable) * 100);
  const r = Number(rate);
  if (!Number.isFinite(cents) || !Number.isFinite(r)) return 0;
  return Math.round(cents * r) / 100;
}

function toCents(dollars) {
  return Math.round(roundMoney(dollars) * 100);
}

function dollarsFromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return roundMoney(n / 100);
}

function percentString(rate) {
  const percent = Math.round(Number(rate) * 1000000) / 10000;
  return String(percent);
}

function parseTaxInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const rate = n > 1 ? n / 100 : n;
  if (rate >= 1) return null;
  return Math.round(rate * 1000000) / 1000000;
}

function lineSell(line) {
  if (line?.rate_unknown) return null;
  if (line?.rate == null || line?.rate === '' || line?.qty == null || line?.qty === '') return null;
  const qty = Number(line.qty);
  const rate = Number(line.rate);
  if (!Number.isFinite(qty) || !Number.isFinite(rate)) return null;
  return roundMoney(qty * rate);
}

// 50% of the pre-tax contract, then 8.25% (or the company rate) on that
// amount. Shipping on a job invoice is 0, so the taxable subtotal is the
// deposit or the final balance. Approved change orders are billed on the
// final invoice, not on the deposit.
function jobInvoiceAmounts({ contractValue, changeOrders = 0, kind, taxRate = DEFAULT_TAX_RATE, depositSubtotal = null }) {
  const contract = roundMoney(contractValue);
  const changes = roundMoney(changeOrders);
  const computedDeposit = roundMoney(contract * DEPOSIT_FRACTION);
  const deposit = depositSubtotal == null ? computedDeposit : roundMoney(depositSubtotal);
  const subtotal = kind === 'deposit' ? deposit : roundMoney(contract - deposit + changes);
  const shipping = 0;
  const taxable = roundMoney(subtotal + shipping);
  const tax = taxOn(taxable, taxRate);
  return {
    subtotal,
    shipping,
    taxable,
    tax,
    taxRate: Number(taxRate),
    total: roundMoney(taxable + tax),
    depositSubtotal: deposit,
    lines: subtotal ? [{ description: kind === 'deposit' ? '50% deposit' : 'Final balance', amount: subtotal }] : [],
  };
}

// Materials plus shipping, then tax on that sum. Matches src/lib/turf/money.js
// orderTotals: taxOn(knownSub + delivery, rate).
function distributionInvoiceAmounts({ lines, deliveryFee, taxRate = DEFAULT_TAX_RATE }) {
  let knownSub = 0;
  const priced = [];
  let unpriced = 0;
  for (const line of lines || []) {
    const sell = lineSell(line);
    if (sell == null) {
      unpriced += 1;
      continue;
    }
    knownSub = roundMoney(knownSub + sell);
    priced.push({ description: line.description || 'Materials', amount: sell });
  }
  const shipping = roundMoney(deliveryFee || 0);
  const taxable = roundMoney(knownSub + shipping);
  const tax = taxOn(taxable, taxRate);
  const invoiceLines = priced.slice();
  if (shipping) invoiceLines.push({ description: 'Shipping', amount: shipping });
  return {
    subtotal: knownSub,
    shipping,
    taxable,
    tax,
    taxRate: Number(taxRate),
    total: roundMoney(taxable + tax),
    pricingIncomplete: unpriced > 0,
    lines: invoiceLines,
  };
}

function manualInvoiceAmounts({ amount, taxRate = DEFAULT_TAX_RATE, description }) {
  const subtotal = roundMoney(amount);
  const tax = taxOn(subtotal, taxRate);
  return {
    subtotal,
    shipping: 0,
    taxable: subtotal,
    tax,
    taxRate: Number(taxRate),
    total: roundMoney(subtotal + tax),
    pricingIncomplete: false,
    lines: subtotal ? [{ description: description || 'Invoice', amount: subtotal }] : [],
  };
}

function buildDraftCalls({ accountId, customerId, taxRateId, daysUntilDue, lines, metadata, idempotencyKey, description, stripeInvoiceId }) {
  const invoiceForm = new URLSearchParams();
  invoiceForm.set('customer', customerId);
  invoiceForm.set('collection_method', 'send_invoice');
  invoiceForm.set('auto_advance', 'false');
  invoiceForm.set('days_until_due', String(daysUntilDue || DEFAULT_DAYS));
  invoiceForm.set('pending_invoice_items_behavior', 'exclude');
  invoiceForm.set('payment_settings[payment_method_types][0]', 'card');
  invoiceForm.set('payment_settings[payment_method_types][1]', 'us_bank_account');
  invoiceForm.set('payment_settings[payment_method_types][2]', 'customer_balance');
  invoiceForm.set('payment_settings[payment_method_options][customer_balance][funding_type]', 'bank_transfer');
  invoiceForm.set('payment_settings[payment_method_options][customer_balance][bank_transfer][type]', 'us_bank_transfer');
  if (description) invoiceForm.set('description', description);
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value != null && value !== '') invoiceForm.set(`metadata[${key}]`, String(value));
  }
  const calls = [{
    method: 'POST',
    path: '/v1/invoices',
    accountId,
    idempotencyKey: `${idempotencyKey}:invoice`,
    body: invoiceForm,
  }];
  (lines || []).forEach((line, index) => {
    const form = new URLSearchParams();
    form.set('customer', customerId);
    form.set('invoice', stripeInvoiceId || '{invoice}');
    form.set('currency', 'usd');
    form.set('amount', String(toCents(line.amount)));
    form.set('description', line.description);
    if (taxRateId) form.set('tax_rates[0]', taxRateId);
    calls.push({
      method: 'POST',
      path: '/v1/invoiceitems',
      accountId,
      idempotencyKey: `${idempotencyKey}:line:${index}`,
      body: form,
    });
  });
  return calls;
}

function buildFinalizeCalls({ stripeInvoiceId, accountId }) {
  return [
    { method: 'POST', path: `/v1/invoices/${stripeInvoiceId}/finalize`, accountId, idempotencyKey: `clardy-finalize:${stripeInvoiceId}`, body: new URLSearchParams() },
    { method: 'POST', path: `/v1/invoices/${stripeInvoiceId}/send`, accountId, idempotencyKey: `clardy-send:${stripeInvoiceId}`, body: new URLSearchParams() },
  ];
}

function buildTaxRateCall({ accountId, taxRate, companyId, idempotencyKey }) {
  const form = new URLSearchParams();
  form.set('display_name', 'Texas');
  form.set('description', 'Flat rate on the subtotal, including shipping');
  form.set('percentage', percentString(taxRate));
  form.set('inclusive', 'false');
  form.set('country', 'US');
  form.set('state', 'TX');
  form.set('jurisdiction', 'TX');
  form.set('metadata[company_id]', companyId);
  return {
    method: 'POST',
    path: '/v1/tax_rates',
    accountId,
    idempotencyKey,
    body: form,
  };
}

function hasEvent(state, id) {
  const ids = state?.processedEventIds;
  if (!ids) return false;
  if (typeof ids.has === 'function') return ids.has(id);
  return Array.isArray(ids) && ids.includes(id);
}

function routeEvent(event, connections) {
  if (!event) return { ignored: true, reason: 'invalid_event' };
  if (event.livemode === true) return { ignored: true, reason: 'live_event_refused' };
  if (!event.account) return { ignored: true, reason: 'missing_account' };
  const matches = (connections || []).filter((row) => row.stripe_account_id === event.account && row.status === 'connected' && row.livemode !== true);
  if (matches.length !== 1) return { ignored: true, reason: 'unknown_account' };
  const metaCompany = event.data?.object?.metadata?.company_id;
  if (metaCompany && metaCompany !== matches[0].company_id) return { ignored: true, reason: 'company_mismatch' };
  return { company: matches[0] };
}

function dateFromUnix(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString().slice(0, 10);
  return new Date(n * 1000).toISOString().slice(0, 10);
}

function findStripeInvoice(state, stripeInvoiceId) {
  if (!stripeInvoiceId) return null;
  return (state.stripeInvoices || []).find((row) => row.stripe_invoice_id === stripeInvoiceId) || null;
}

function paymentLinks(row) {
  if (!row) return {};
  const links = {};
  if (row.project_id) links.linked_job_id = row.project_id;
  if (row.turf_order_id) links.turf_order_id = row.turf_order_id;
  if (row.distribution_order_id) links.distribution_order_id = row.distribution_order_id;
  if (row.turf_install_job_id) links.turf_install_job_id = row.turf_install_job_id;
  if (row.operations_job_id) links.operations_job_id = row.operations_job_id;
  return links;
}

function moneyRow(company, event, extra) {
  const { created, ...rest } = extra || {};
  return {
    company_id: company.company_id,
    organization_id: company.organization_id || null,
    stripe_account_id: event.account,
    stripe_event_id: event.id,
    payment_date: dateFromUnix(created),
    ...rest,
  };
}

function planWebhook(event, state = {}) {
  if (!event?.id || !event.type) return { ignored: true, reason: 'invalid_event' };
  if (hasEvent(state, event.id)) return { duplicate: true, eventId: event.id };
  const route = routeEvent(event, state.connections);
  if (route.ignored) return route;
  if (!HANDLED_EVENTS.has(event.type)) return { ignored: true, reason: 'unhandled_type' };
  const company = route.company;
  const obj = event.data?.object || {};
  const plan = {
    duplicate: false,
    ignored: false,
    companyId: company.company_id,
    eventRow: {
      event_id: event.id,
      company_id: company.company_id,
      organization_id: company.organization_id || FOUNDING_ORG_ID,
      stripe_account_id: event.account,
      event_type: event.type,
    },
    paymentWrites: [],
    invoicePatches: [],
  };

  if (event.type === 'invoice.finalized') {
    plan.invoicePatches.push({ stripe_invoice_id: obj.id, status: 'open', hosted_invoice_url: obj.hosted_invoice_url || null });
    return plan;
  }
  if (event.type === 'invoice.payment_failed') {
    plan.invoicePatches.push({ stripe_invoice_id: obj.id, status: 'payment_failed', hosted_invoice_url: obj.hosted_invoice_url || null });
    return plan;
  }
  if (event.type === 'invoice.paid') {
    plan.paymentWrites.push(collectionWrite(obj, event, company, state));
    plan.invoicePatches.push({ stripe_invoice_id: obj.id, status: 'paid', hosted_invoice_url: obj.hosted_invoice_url || null });
    return plan;
  }
  if (event.type === 'charge.refunded') {
    const refunded = dollarsFromCents(obj.amount_refunded);
    if (refunded > 0) {
      const link = findStripeInvoice(state, obj.invoice);
      plan.paymentWrites.push(moneyRow(company, event, {
        stripe_object_id: `refund:${obj.id}`,
        stripe_charge_id: obj.id,
        stripe_invoice_id: obj.invoice || null,
        stripe_payment_intent_id: obj.payment_intent || null,
        stripe_customer_id: obj.customer || null,
        amount_received: roundMoney(-refunded),
        payment_method: 'Stripe refund',
        reference_number: obj.id,
        notes: `Stripe refund ${obj.id}`,
        created: obj.created,
        ...paymentLinks(link),
      }));
    }
    return plan;
  }
  if (event.type === 'credit_note.created') {
    const refunds = Array.isArray(obj.refunds) ? obj.refunds : [];
    const pre = Number(obj.pre_payment_amount) || 0;
    const post = Number(obj.post_payment_amount) || 0;
    const outOfBand = Number(obj.out_of_band_amount) || 0;
    if (pre > 0 && post === 0 && outOfBand === 0 && refunds.length === 0) {
      plan.invoicePatches.push({ stripe_invoice_id: obj.invoice, status: 'open', credit_cents: pre });
      return plan;
    }
    if (refunds.length) return plan;
    const cents = outOfBand || post;
    if (cents > 0) {
      const link = findStripeInvoice(state, obj.invoice);
      plan.paymentWrites.push(moneyRow(company, event, {
        stripe_object_id: obj.id,
        stripe_invoice_id: obj.invoice || null,
        stripe_customer_id: obj.customer || null,
        amount_received: roundMoney(-dollarsFromCents(cents)),
        payment_method: 'Stripe credit',
        reference_number: obj.number || obj.id,
        notes: `Stripe credit note ${obj.number || obj.id}`,
        created: obj.created,
        ...paymentLinks(link),
      }));
    }
    return plan;
  }
  if (event.type === 'customer_cash_balance_transaction.created') {
    if (obj.type === 'funded') {
      plan.paymentWrites.push(moneyRow(company, event, {
        stripe_object_id: obj.id,
        stripe_customer_id: obj.customer || null,
        amount_received: dollarsFromCents(obj.net_amount),
        payment_method: 'ACH',
        reference_number: obj.id,
        notes: 'ACH cash balance',
        created: obj.created,
      }));
    } else if (obj.type === 'applied_to_payment') {
      const pi = obj.applied_to_payment?.payment_intent;
      const existing = (state.payments || []).find((row) => row.stripe_customer_id === obj.customer && row.payment_method === 'ACH' && row.stripe_object_id === obj.id)
        || (state.payments || []).find((row) => row.stripe_customer_id === obj.customer && row.payment_method === 'ACH' && !row.stripe_payment_intent_id);
      if (existing && pi) {
        plan.paymentWrites.push({ ...existing, stripe_payment_intent_id: pi, stripe_event_id: event.id });
      }
    }
    return plan;
  }
  // cash_balance.funds_available is the balance snapshot. The funded
  // transaction above is the receipt, so this event is recorded and does
  // not create a second payment.
  return plan;
}

function collectionWrite(invoice, event, company, state) {
  const amount = dollarsFromCents(invoice.amount_paid);
  const pi = invoice.payment_intent || null;
  const payments = state.payments || [];
  const link = findStripeInvoice(state, invoice.id);
  const existing = payments.find((row) => row.stripe_object_id === invoice.id)
    || payments.find((row) => row.stripe_invoice_id === invoice.id && Number(row.amount_received) > 0)
    || (pi && payments.find((row) => row.stripe_payment_intent_id === pi && Number(row.amount_received) > 0));
  if (existing && existing.stripe_object_id !== invoice.id) {
    return {
      ...existing,
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: pi || existing.stripe_payment_intent_id,
      stripe_charge_id: invoice.charge || existing.stripe_charge_id,
      stripe_event_id: event.id,
      stripe_account_id: event.account,
      company_id: company.company_id,
      ...paymentLinks(link),
    };
  }
  return moneyRow(company, event, {
    stripe_object_id: invoice.id,
    stripe_invoice_id: invoice.id,
    stripe_charge_id: invoice.charge || null,
    stripe_payment_intent_id: pi,
    stripe_customer_id: invoice.customer || null,
    amount_received: amount,
    payment_method: 'Stripe',
    reference_number: invoice.number || invoice.id,
    notes: `Stripe ${link?.kind || invoice.metadata?.kind || 'invoice'} ${invoice.number || invoice.id}`,
    created: invoice.status_transitions?.paid_at,
    ...paymentLinks(link),
  });
}

function mergeBy(rows, writes, key) {
  const next = (rows || []).map((row) => ({ ...row }));
  for (const write of writes || []) {
    if (!write || !write[key]) continue;
    const index = next.findIndex((row) => row[key] === write[key]);
    if (index >= 0) next[index] = { ...next[index], ...write };
    else next.push({ ...write });
  }
  return next;
}

function applyPlan(state, plan) {
  if (!plan || plan.duplicate || plan.ignored) return state;
  const ids = new Set(state.processedEventIds || []);
  if (plan.eventRow?.event_id) ids.add(plan.eventRow.event_id);
  return {
    ...state,
    processedEventIds: ids,
    payments: mergeBy(state.payments, plan.paymentWrites, 'stripe_object_id'),
    stripeInvoices: mergeBy(state.stripeInvoices, plan.invoicePatches, 'stripe_invoice_id'),
  };
}

function reduceWebhook(state, event) {
  const plan = planWebhook(event, state);
  return { state: applyPlan(state, plan), plan };
}

function missingInvoicingEnv(env = process.env) {
  return INVOICING_ENV.filter((key) => !env[key]);
}

function safeMessage(payload, fallback) {
  const raw = payload?.error?.message || payload?.error_description || fallback;
  const text = String(raw || fallback);
  if (/sk_|rk_|whsec_|access_token|refresh_token/i.test(text)) return fallback;
  return text;
}

function missingSchema(err) {
  const msg = `${err?.message || ''} ${err?.code || ''}`;
  return /PGRST204|PGRST205|42P01|42703|schema cache|does not exist|Could not find the/i.test(msg);
}

function signState(payload, secret) {
  const body = Buffer.from(JSON.stringify({ ...payload, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', `stripe-state:${secret}`).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readState(state, secret) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig || !secret) return null;
  const expected = crypto.createHmac('sha256', `stripe-state:${secret}`).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return Date.now() - data.t < 15 * 60 * 1000 ? data : null;
  } catch {
    return null;
  }
}

function connectAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'read_write',
    redirect_uri: redirectUri,
    state,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

function publicInvoicingStatus(env = process.env) {
  const missing = missingInvoicingEnv(env);
  let mode = 'unconfigured';
  if (env.STRIPE_SECRET_KEY) {
    billing.assertTestKey(env.STRIPE_SECRET_KEY);
    mode = env.STRIPE_SECRET_KEY.startsWith('sk_test') ? 'test' : 'unknown';
  }
  return {
    configured: missing.length === 0 && mode === 'test',
    mode,
    missing,
    env: INVOICING_ENV,
  };
}

async function stripeRequest({ env, fetchImpl = fetch, accountId, path, body, idempotencyKey, method = 'POST', base = 'https://api.stripe.com' }) {
  billing.assertTestKey(env.STRIPE_SECRET_KEY);
  const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  if (accountId) headers['Stripe-Account'] = accountId;
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 255);
  const res = await fetchImpl(`${base}${path}`, {
    method,
    headers,
    body: body ? body.toString() : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(safeMessage(payload, 'Stripe refused the request.'));
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }
  return payload;
}

function bearer(req) {
  return (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '');
}

async function accessFor(token) {
  if (!token || !SERVICE_KEY) return { is_owner: false, company_ids: [] };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_company_access`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return { is_owner: false, company_ids: [] };
  const data = await res.json();
  return {
    is_owner: data?.is_owner === true,
    company_ids: Array.isArray(data?.company_ids) ? data.company_ids : [],
  };
}

function allowedCompany(access, companyId) {
  if (!companyId) return false;
  if (access?.is_owner) return true;
  return (access?.company_ids || []).includes(companyId);
}

function compact(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

async function upsertPayment(row) {
  const clean = compact(row);
  const existing = await sbList('payments', { filters: { stripe_object_id: `eq.${clean.stripe_object_id}` }, limit: 1 });
  if (existing[0]) {
    const patch = { ...clean };
    delete patch.stripe_object_id;
    return sbUpdate('payments', existing[0].id, patch);
  }
  const saved = await sbInsert('payments', clean);
  if (saved?.linked_job_id) {
    try {
      await sbFetch('rpc/reconcile_project_draws', { method: 'POST', body: JSON.stringify({ p_project_id: saved.linked_job_id }) });
    } catch {
      // The payment row is already the record. Draws catch up on the next reconcile.
    }
  }
  return saved;
}

async function patchStoredInvoice(patch) {
  if (!patch?.stripe_invoice_id) return;
  const rows = await sbList('stripe_invoices', { filters: { stripe_invoice_id: `eq.${patch.stripe_invoice_id}` }, limit: 1 });
  const row = rows[0];
  if (!row) return;
  await sbUpdate('stripe_invoices', row.id, compact({
    status: patch.status,
    hosted_invoice_url: patch.hosted_invoice_url,
  }));
  if (!row.invoice_id) return;
  const invoicePatch = compact({
    stripe_status: patch.status,
    stripe_hosted_invoice_url: patch.hosted_invoice_url,
  });
  if (patch.status === 'paid') invoicePatch.invoice_status = 'paid';
  if (patch.status === 'open') invoicePatch.invoice_status = 'sent';
  await sbUpdate('invoices', row.invoice_id, invoicePatch);
}

async function loadWebhookState(event) {
  const obj = event.data?.object || {};
  const account = event.account || '';
  const connections = account
    ? await sbList('company_stripe_connections', { filters: { stripe_account_id: `eq.${account}` }, limit: 5 })
    : [];
  const seen = await sbList('stripe_webhook_events', { filters: { event_id: `eq.${event.id}` }, limit: 1 });
  const invoiceId = obj.object === 'invoice' ? obj.id : (obj.invoice || null);
  const pi = obj.payment_intent || obj.applied_to_payment?.payment_intent || null;
  const payments = [];
  const pull = async (filters) => {
    const rows = await sbList('payments', { filters, limit: 20 });
    payments.push(...rows);
  };
  if (invoiceId) await pull({ stripe_invoice_id: `eq.${invoiceId}` });
  if (obj.object === 'invoice') await pull({ stripe_object_id: `eq.${obj.id}` });
  if (obj.object === 'charge') await pull({ stripe_object_id: `eq.refund:${obj.id}` });
  if (obj.object === 'customer_cash_balance_transaction') await pull({ stripe_object_id: `eq.${obj.id}` });
  if (pi) await pull({ stripe_payment_intent_id: `eq.${pi}` });
  if (obj.customer && obj.object === 'customer_cash_balance_transaction') {
    await pull({ stripe_customer_id: `eq.${obj.customer}`, payment_method: 'eq.ACH' });
  }
  const stripeInvoices = invoiceId
    ? await sbList('stripe_invoices', { filters: { stripe_invoice_id: `eq.${invoiceId}` }, limit: 1 })
    : [];
  const byObject = new Map();
  for (const row of payments) byObject.set(row.stripe_object_id || row.id, row);
  return {
    connections,
    payments: [...byObject.values()],
    stripeInvoices,
    processedEventIds: new Set(seen.map((row) => row.event_id)),
  };
}

async function applyWebhookEvent(event, deps = {}) {
  const state = deps.state || await loadWebhookState(event);
  const plan = planWebhook(event, state);
  if (plan.duplicate) return { received: true, duplicate: true };
  if (plan.ignored) return { received: true, ignored: true, reason: plan.reason };
  if (deps.persist === false) return { received: true, plan };
  for (const write of plan.paymentWrites) await upsertPayment(write);
  for (const patch of plan.invoicePatches) await patchStoredInvoice(patch);
  try {
    await sbInsert('stripe_webhook_events', plan.eventRow);
  } catch (err) {
    if (!/duplicate|23505/i.test(err.message || '')) throw err;
  }
  return { received: true, company_id: plan.companyId, type: event.type };
}

function connectionView(company, row) {
  const rate = row?.tax_rate == null ? DEFAULT_TAX_RATE : Number(row.tax_rate);
  return {
    company_id: company.id,
    name: company.name,
    status: row?.status || 'disconnected',
    stripe_account_id: row?.status === 'connected' ? row.stripe_account_id : null,
    tax_percent: Number(percentString(rate)),
    days_until_due: row?.days_until_due || DEFAULT_DAYS,
    livemode: false,
    charges_enabled: row?.charges_enabled === true,
    connected_at: row?.connected_at || null,
  };
}

async function listCompaniesFor(token) {
  const access = await accessFor(token);
  const companies = await sbList('company_profiles', { select: 'id,name,is_active', order: 'name.asc', limit: 200 });
  let connections = [];
  let migrationRequired = false;
  try {
    connections = await sbList('company_stripe_connections', { limit: 200 });
  } catch (err) {
    if (!missingSchema(err)) throw err;
    migrationRequired = true;
  }
  const byCompany = new Map(connections.map((row) => [row.company_id, row]));
  const visible = companies.filter((company) => company.is_active !== false && allowedCompany(access, company.id));
  return {
    migration_required: migrationRequired,
    companies: visible.map((company) => connectionView(company, byCompany.get(company.id))),
  };
}

async function requireCompany(token, companyId) {
  const access = await accessFor(token);
  if (!allowedCompany(access, companyId)) {
    const err = new Error('You do not have access to that company.');
    err.status = 403;
    throw err;
  }
  const company = await sbGetById('company_profiles', companyId, 'id,name,organization_id');
  if (!company) {
    const err = new Error('Company not found.');
    err.status = 404;
    throw err;
  }
  return company;
}

async function loadConnection(companyId) {
  const rows = await sbList('company_stripe_connections', { filters: { company_id: `eq.${companyId}` }, limit: 1 });
  return rows[0] || null;
}

async function saveConnection(company, patch) {
  const existing = await loadConnection(company.id);
  const row = {
    ...patch,
    company_id: company.id,
    organization_id: company.organization_id || FOUNDING_ORG_ID,
    livemode: false,
  };
  if (existing) {
    const rows = await sbFetch(`company_stripe_connections?company_id=eq.${company.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    return rows[0];
  }
  return sbInsert('company_stripe_connections', {
    status: 'disconnected',
    tax_rate: DEFAULT_TAX_RATE,
    days_until_due: DEFAULT_DAYS,
    ...row,
  });
}

function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

async function exchangeCode({ code, env, fetchImpl }) {
  const form = new URLSearchParams();
  form.set('client_secret', env.STRIPE_SECRET_KEY);
  form.set('code', code);
  form.set('grant_type', 'authorization_code');
  const payload = await stripeRequest({
    env,
    fetchImpl,
    path: '/oauth/token',
    body: form,
    base: 'https://connect.stripe.com',
  });
  return {
    accountId: payload.stripe_user_id || null,
    livemode: payload.livemode === true,
    liveToken: typeof payload.access_token === 'string' && payload.access_token.startsWith('sk_live'),
  };
}

async function deauthorize({ accountId, env, fetchImpl }) {
  if (!accountId) return;
  const form = new URLSearchParams();
  form.set('client_id', env.STRIPE_CONNECT_CLIENT_ID);
  form.set('stripe_user_id', accountId);
  await stripeRequest({
    env,
    fetchImpl,
    path: '/oauth/deauthorize',
    body: form,
    base: 'https://connect.stripe.com',
  }).catch(() => {});
}

async function ensureTaxRate({ company, connection, env, fetchImpl }) {
  const rate = connection.tax_rate == null ? DEFAULT_TAX_RATE : Number(connection.tax_rate);
  if (connection.stripe_tax_rate_id) return connection.stripe_tax_rate_id;
  const call = buildTaxRateCall({
    accountId: connection.stripe_account_id,
    taxRate: rate,
    companyId: company.id,
    idempotencyKey: `clardy-tax:${company.id}:${percentString(rate)}`,
  });
  const created = await stripeRequest({ env, fetchImpl, ...call });
  await saveConnection(company, { stripe_tax_rate_id: created.id, tax_rate: rate });
  return created.id;
}

function customerSource(customer) {
  return {
    sourceKey: customer.sourceKey,
    name: customer.name || 'Customer',
    email: customer.email || null,
    clientId: customer.clientId || null,
    turfCustomerId: customer.turfCustomerId || null,
    distributionCustomerId: customer.distributionCustomerId || null,
  };
}

async function ensureCustomer({ company, connection, customer, env, fetchImpl }) {
  const source = customerSource(customer);
  const existing = await sbList('stripe_customers', {
    filters: { company_id: `eq.${company.id}`, source_key: `eq.${source.sourceKey}` },
    limit: 1,
  });
  if (existing[0]?.stripe_customer_id) return existing[0].stripe_customer_id;
  const form = new URLSearchParams();
  form.set('name', source.name);
  if (source.email) form.set('email', source.email);
  form.set('metadata[company_id]', company.id);
  if (source.clientId) form.set('metadata[client_id]', source.clientId);
  form.set('cash_balance[settings][reconciliation_mode]', 'automatic');
  const created = await stripeRequest({
    env,
    fetchImpl,
    accountId: connection.stripe_account_id,
    path: '/v1/customers',
    body: form,
    idempotencyKey: `clardy-cus:${company.id}:${source.sourceKey}`,
  });
  await sbInsert('stripe_customers', compact({
    company_id: company.id,
    organization_id: company.organization_id || FOUNDING_ORG_ID,
    source_key: source.sourceKey,
    client_id: source.clientId,
    turf_customer_id: source.turfCustomerId,
    distribution_customer_id: source.distributionCustomerId,
    stripe_customer_id: created.id,
  }));
  return created.id;
}

async function approvedChanges(projectId) {
  const rows = await sbList('change_orders', { filters: { project_id: `eq.${projectId}` }, limit: 200 });
  return roundMoney(rows.filter((row) => String(row.status || '').toLowerCase() === 'approved').reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

async function resolveDraft(body) {
  if (body.turf_order_id) {
    const order = await sbGetById('turf_orders', body.turf_order_id);
    if (!order) return null;
    const lines = await sbList('turf_order_lines', { filters: { order_id: `eq.${order.id}` }, limit: 200 });
    const customer = order.customer_id ? await sbGetById('turf_customers', order.customer_id) : null;
    return draftFromOrder({ order, lines, customer, sourceKey: `turf_order:${order.id}`, turfOrderId: order.id });
  }
  if (body.distribution_order_id) {
    const order = await sbGetById('distribution_orders', body.distribution_order_id);
    if (!order) return null;
    const lines = await sbList('distribution_order_lines', { filters: { order_id: `eq.${order.id}` }, limit: 200 });
    const customer = order.customer_id ? await sbGetById('distribution_customers', order.customer_id) : null;
    return draftFromOrder({ order, lines, customer, sourceKey: `distribution_order:${order.id}`, distributionOrderId: order.id });
  }
  if (body.turf_install_job_id) return resolveJob('turf_install_jobs', body.turf_install_job_id, 'turf_install', body.kind);
  if (body.operations_job_id) return resolveJob('operations_jobs', body.operations_job_id, 'operations_job', body.kind);
  if (body.project_id) return resolveProject(body.project_id, body.kind || 'deposit');
  if (body.client_id && body.kind === 'final') {
    const projects = await sbList('projects', { filters: { client_id: `eq.${body.client_id}` }, order: 'updated_at.desc', limit: 20 });
    const project = projects.find((row) => row.status === 'completed') || projects[0];
    if (!project) return null;
    return resolveProject(project.id, 'final');
  }
  if (body.invoice_id) return resolveExistingInvoice(body.invoice_id, body.kind);
  return null;
}

function draftFromOrder({ order, lines, customer, sourceKey, turfOrderId, distributionOrderId }) {
  return {
    kind: 'distribution',
    companyId: order.company_id,
    sourceKey,
    turfOrderId: turfOrderId || null,
    distributionOrderId: distributionOrderId || null,
    title: `Materials ${order.order_number || ''}`.trim(),
    description: `Materials and shipping for ${order.order_number || 'order'}`,
    customer: {
      sourceKey: customer?.id ? `${turfOrderId ? 'turf_customer' : 'distribution_customer'}:${customer.id}` : `order:${order.id}`,
      name: customer?.name || order.bill_to_name || order.contact_name || 'Customer',
      email: customer?.email || null,
      turfCustomerId: turfOrderId ? customer?.id : null,
      distributionCustomerId: distributionOrderId ? customer?.id : null,
    },
    amountsFor(taxRate) {
      return distributionInvoiceAmounts({ lines, deliveryFee: order.delivery_fee, taxRate });
    },
  };
}

async function resolveJob(table, id, sourcePrefix, kind) {
  const job = await sbGetById(table, id);
  if (!job) return null;
  const wanted = kind === 'final' ? 'final' : 'deposit';
  let client = null;
  if (job.project_id) {
    const project = await sbGetById('projects', job.project_id, 'id,client_id,name,contract_value,company_id');
    if (project?.client_id) client = await sbGetById('clients', project.client_id, 'id,name,email');
  }
  return {
    kind: wanted,
    companyId: job.company_id,
    sourceKey: `${sourcePrefix}:${job.id}`,
    projectId: job.project_id || null,
    turfInstallJobId: sourcePrefix === 'turf_install' ? job.id : null,
    operationsJobId: sourcePrefix === 'operations_job' ? job.id : null,
    clientId: client?.id || null,
    title: wanted === 'deposit' ? `50% deposit — ${job.name}` : `Final balance — ${job.name}`,
    description: wanted === 'deposit' ? `50% deposit for ${job.name}` : `Final balance for ${job.name}`,
    customer: {
      sourceKey: client?.id ? `client:${client.id}` : `${sourcePrefix}:${job.id}`,
      name: client?.name || job.customer_name || job.name || 'Customer',
      email: client?.email || null,
      clientId: client?.id || null,
    },
    async amountsFor(taxRate) {
      const changes = job.project_id ? await approvedChanges(job.project_id) : 0;
      const deposit = await depositedSubtotal(job.company_id, `${sourcePrefix}:${job.id}`, job.project_id);
      const contract = job.sell_amount != null ? job.sell_amount : 0;
      return jobInvoiceAmounts({ contractValue: contract, changeOrders: changes, kind: wanted, taxRate, depositSubtotal: wanted === 'final' ? deposit : null });
    },
  };
}

async function resolveProject(projectId, kind) {
  const project = await sbGetById('projects', projectId);
  if (!project) return null;
  const wanted = kind === 'final' ? 'final' : 'deposit';
  const client = project.client_id ? await sbGetById('clients', project.client_id, 'id,name,email') : null;
  return {
    kind: wanted,
    companyId: project.company_id,
    sourceKey: `project:${project.id}`,
    projectId: project.id,
    clientId: client?.id || null,
    title: wanted === 'deposit' ? `50% deposit — ${project.name}` : `Final balance — ${project.name}`,
    description: wanted === 'deposit' ? `50% deposit for ${project.name}` : `Final balance for ${project.name}`,
    customer: {
      sourceKey: client?.id ? `client:${client.id}` : `project:${project.id}`,
      name: client?.name || project.name,
      email: client?.email || null,
      clientId: client?.id || null,
    },
    async amountsFor(taxRate) {
      const changes = await approvedChanges(project.id);
      const deposit = await depositedSubtotal(project.company_id, `project:${project.id}`, project.id);
      return jobInvoiceAmounts({
        contractValue: project.contract_value,
        changeOrders: changes,
        kind: wanted,
        taxRate,
        depositSubtotal: wanted === 'final' ? deposit : null,
      });
    },
  };
}

async function depositedSubtotal(companyId, sourceKey, projectId) {
  const filters = { company_id: `eq.${companyId}`, kind: 'eq.deposit' };
  if (projectId) filters.project_id = `eq.${projectId}`;
  else filters.source_key = `eq.${sourceKey}`;
  const rows = await sbList('stripe_invoices', { filters, limit: 1 });
  return rows[0] ? Number(rows[0].subtotal) : null;
}

async function resolveExistingInvoice(invoiceId, kind) {
  const invoice = await sbGetById('invoices', invoiceId);
  if (!invoice) return null;
  let companyId = invoice.company_id;
  if (!companyId && invoice.linked_job_id) {
    const project = await sbGetById('projects', invoice.linked_job_id, 'id,company_id,client_id,name');
    companyId = project?.company_id || null;
  }
  const project = invoice.linked_job_id ? await sbGetById('projects', invoice.linked_job_id, 'id,company_id,client_id,name') : null;
  const client = project?.client_id ? await sbGetById('clients', project.client_id, 'id,name,email') : null;
  const inferred = /final/i.test(invoice.invoice_type || '') ? 'final' : (/deposit/i.test(invoice.invoice_type || '') ? 'deposit' : null);
  const wanted = kind || invoice.stripe_kind || inferred || 'deposit';
  if (!['deposit', 'final', 'distribution'].includes(wanted)) return null;
  return {
    kind: wanted,
    companyId,
    sourceKey: `invoice:${invoice.id}`,
    projectId: invoice.linked_job_id || null,
    clientId: client?.id || null,
    invoiceId: invoice.id,
    turfOrderId: invoice.turf_order_id || null,
    distributionOrderId: invoice.distribution_order_id || null,
    title: invoice.invoice_name || 'Invoice',
    description: invoice.invoice_name || 'Invoice',
    customer: {
      sourceKey: client?.id ? `client:${client.id}` : `invoice:${invoice.id}`,
      name: client?.name || invoice.invoice_name || 'Customer',
      email: client?.email || null,
      clientId: client?.id || null,
    },
    amountsFor(taxRate) {
      return manualInvoiceAmounts({ amount: invoice.amount, taxRate, description: invoice.invoice_name || 'Invoice' });
    },
  };
}

function presentInvoice(row) {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    kind: row.kind,
    status: row.status,
    stripe_invoice_id: row.stripe_invoice_id,
    hosted_invoice_url: row.hosted_invoice_url,
    subtotal: Number(row.subtotal || 0),
    shipping: Number(row.shipping || 0),
    tax: Number(row.tax || 0),
    total: Number(row.total || 0),
    tax_percent: Number(percentString(row.tax_rate == null ? DEFAULT_TAX_RATE : row.tax_rate)),
    days_until_due: row.days_until_due,
    invoice_id: row.invoice_id,
  };
}

async function findDraftRow(draft) {
  const rows = await sbList('stripe_invoices', {
    filters: { company_id: `eq.${draft.companyId}`, kind: `eq.${draft.kind}`, source_key: `eq.${draft.sourceKey}` },
    limit: 1,
  });
  return rows[0] || null;
}

async function createDraft(body, { env, fetchImpl, token }) {
  const draft = await resolveDraft(body);
  if (!draft?.companyId) {
    const err = new Error('Nothing to invoice.');
    err.status = 404;
    throw err;
  }
  const company = await requireCompany(token, draft.companyId);
  const connection = await loadConnection(company.id);
  if (!connection || connection.status !== 'connected' || !connection.stripe_account_id) {
    if (body.quiet) return { skipped: true, reason: 'stripe_not_connected' };
    const err = new Error('Connect Stripe for this company in Settings → Companies.');
    err.status = 409;
    err.code = 'stripe_not_connected';
    throw err;
  }
  const taxRate = connection.tax_rate == null ? DEFAULT_TAX_RATE : Number(connection.tax_rate);
  const amounts = await draft.amountsFor(taxRate);
  if (amounts.pricingIncomplete) {
    if (body.quiet) return { skipped: true, reason: 'pricing_incomplete' };
    const err = new Error('A price is still missing, so the Stripe invoice was not created.');
    err.status = 400;
    throw err;
  }
  if (!(amounts.subtotal > 0)) {
    if (body.quiet) return { skipped: true, reason: 'no_amount' };
    const err = new Error('The invoice total is zero.');
    err.status = 400;
    throw err;
  }
  const existing = await findDraftRow(draft);
  if (existing?.stripe_invoice_id) return { invoice: presentInvoice(existing), existing: true };
  const days = connection.days_until_due || DEFAULT_DAYS;
  const idempotencyKey = `clardy-inv:${company.id}:${draft.kind}:${draft.sourceKey}`;
  let clardyInvoiceId = existing?.invoice_id || draft.invoiceId || null;
  if (!clardyInvoiceId) {
    const created = await sbInsert('invoices', compact({
      invoice_id: `ST-${draft.kind}-${Date.now()}`,
      invoice_name: draft.title,
      invoice_type: draft.kind === 'deposit' ? 'Deposit' : draft.kind === 'final' ? 'Final' : 'Materials',
      amount: amounts.total,
      invoice_status: 'draft',
      company_id: company.id,
      organization_id: company.organization_id || FOUNDING_ORG_ID,
      linked_job_id: draft.projectId,
      notes: draft.description,
      due_date: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
      stripe_kind: draft.kind,
      stripe_status: 'draft',
      stripe_account_id: connection.stripe_account_id,
      stripe_subtotal: amounts.subtotal,
      stripe_shipping: amounts.shipping,
      stripe_tax: amounts.tax,
      turf_order_id: draft.turfOrderId,
      distribution_order_id: draft.distributionOrderId,
    }));
    clardyInvoiceId = created.id;
  }
  const customerId = await ensureCustomer({ company, connection, customer: draft.customer, env, fetchImpl });
  const taxRateId = await ensureTaxRate({ company, connection, env, fetchImpl });
  const metadata = {
    company_id: company.id,
    kind: draft.kind,
    clardy_invoice_id: clardyInvoiceId,
    clardy_job_id: draft.projectId || draft.turfInstallJobId || draft.operationsJobId || '',
    clardy_order_id: draft.turfOrderId || draft.distributionOrderId || '',
  };
  const invoiceCall = buildDraftCalls({
    accountId: connection.stripe_account_id,
    customerId,
    taxRateId,
    daysUntilDue: days,
    lines: [],
    metadata,
    idempotencyKey,
    description: `${draft.description}. Tax ${percentString(taxRate)}% on the subtotal, including shipping.`,
  })[0];
  const stripeInvoice = await stripeRequest({ env, fetchImpl, ...invoiceCall });
  const lineCalls = buildDraftCalls({
    accountId: connection.stripe_account_id,
    customerId,
    taxRateId,
    daysUntilDue: days,
    lines: amounts.lines.map((line) => ({
      ...line,
      description: line.description === '50% deposit' || line.description === 'Final balance'
        ? `${line.description} — ${draft.title.replace(/^.* — /, '')}`
        : line.description,
    })),
    metadata,
    idempotencyKey,
    stripeInvoiceId: stripeInvoice.id,
  }).slice(1);
  for (const call of lineCalls) await stripeRequest({ env, fetchImpl, ...call });
  const record = {
    company_id: company.id,
    organization_id: company.organization_id || FOUNDING_ORG_ID,
    kind: draft.kind,
    source_key: draft.sourceKey,
    invoice_id: clardyInvoiceId,
    project_id: draft.projectId || null,
    client_id: draft.clientId || draft.customer.clientId || null,
    turf_install_job_id: draft.turfInstallJobId || null,
    operations_job_id: draft.operationsJobId || null,
    turf_order_id: draft.turfOrderId || null,
    distribution_order_id: draft.distributionOrderId || null,
    stripe_invoice_id: stripeInvoice.id,
    stripe_customer_id: customerId,
    stripe_account_id: connection.stripe_account_id,
    hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
    status: 'draft',
    subtotal: amounts.subtotal,
    shipping: amounts.shipping,
    tax: amounts.tax,
    total: amounts.total,
    tax_rate: taxRate,
    days_until_due: days,
    idempotency_key: idempotencyKey,
  };
  const saved = existing
    ? await sbUpdate('stripe_invoices', existing.id, compact(record))
    : await sbInsert('stripe_invoices', compact(record));
  await sbUpdate('invoices', clardyInvoiceId, compact({
    amount: amounts.total,
    stripe_invoice_id: stripeInvoice.id,
    stripe_status: 'draft',
    stripe_kind: draft.kind,
    stripe_account_id: connection.stripe_account_id,
    stripe_subtotal: amounts.subtotal,
    stripe_shipping: amounts.shipping,
    stripe_tax: amounts.tax,
    company_id: company.id,
  }));
  return { invoice: presentInvoice(saved), existing: false };
}

async function finalizeInvoice(body, { env, fetchImpl, token }) {
  let row = null;
  if (body.stripe_invoice_id) {
    const rows = await sbList('stripe_invoices', { filters: { stripe_invoice_id: `eq.${body.stripe_invoice_id}` }, limit: 1 });
    row = rows[0] || null;
  } else if (body.invoice_id) {
    const rows = await sbList('stripe_invoices', { filters: { invoice_id: `eq.${body.invoice_id}` }, limit: 1 });
    row = rows[0] || null;
  }
  if (!row?.stripe_invoice_id) {
    const err = new Error('Create a Stripe draft before sending.');
    err.status = 404;
    throw err;
  }
  const company = await requireCompany(token, row.company_id);
  const connection = await loadConnection(company.id);
  if (!connection || connection.status !== 'connected') {
    const err = new Error('Connect Stripe for this company in Settings → Companies.');
    err.status = 409;
    throw err;
  }
  if (row.status !== 'draft') return { invoice: presentInvoice(row), existing: true };
  const calls = buildFinalizeCalls({ stripeInvoiceId: row.stripe_invoice_id, accountId: connection.stripe_account_id });
  const finalized = await stripeRequest({ env, fetchImpl, ...calls[0] });
  await stripeRequest({ env, fetchImpl, ...calls[1] });
  const hosted = finalized.hosted_invoice_url || null;
  const saved = await sbUpdate('stripe_invoices', row.id, {
    status: 'open',
    hosted_invoice_url: hosted,
    finalized_at: new Date().toISOString(),
    sent_at: new Date().toISOString(),
  });
  if (row.invoice_id) {
    await sbUpdate('invoices', row.invoice_id, compact({
      invoice_status: 'sent',
      date_sent: new Date().toISOString().slice(0, 10),
      stripe_status: 'open',
      stripe_hosted_invoice_url: hosted,
    }));
  }
  return { invoice: presentInvoice({ ...row, ...saved, status: 'open', hosted_invoice_url: hosted }) };
}

async function lookupInvoice(body, token) {
  try {
    const draft = await resolveDraft({ ...body, kind: body.kind || 'distribution' });
    if (!draft?.companyId) return { invoice: null };
    await requireCompany(token, draft.companyId);
    const row = await findDraftRow(draft);
    return { invoice: presentInvoice(row) };
  } catch (err) {
    if (missingSchema(err)) return { invoice: null, migration_required: true };
    throw err;
  }
}

async function handleStaff(req, res, body) {
  const { requireStaff } = require('./staffAuth.js');
  const user = await requireStaff(req, res);
  if (!user) return;
  const env = process.env;
  const action = body.action;
  try {
    if (action === 'status') {
      let mode = 'unconfigured';
      try {
        const status = publicInvoicingStatus(env);
        mode = status.mode;
        const listed = await listCompaniesFor(bearer(req));
        return res.status(200).json({ ...status, ...listed });
      } catch (err) {
        if (err.code === 'live_key_refused') {
          return res.status(400).json({ error: err.code, message: err.message, mode: 'refused' });
        }
        throw err;
      }
    }
    let status;
    try {
      status = publicInvoicingStatus(env);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.code || 'live_key_refused', message: err.message });
    }
    if (!status.configured && action !== 'save-settings') {
      return res.status(501).json({ error: 'stripe_invoicing_not_configured', missing: status.missing });
    }
    if (action === 'connect-url') {
      const company = await requireCompany(bearer(req), body.company_id);
      const redirectUri = `${originOf(req)}/StripeConnectCallback`;
      const state = signState({ companyId: company.id, uid: user.id }, SERVICE_KEY);
      return res.status(200).json({
        url: connectAuthorizeUrl({ clientId: env.STRIPE_CONNECT_CLIENT_ID, redirectUri, state }),
      });
    }
    if (action === 'disconnect') {
      const company = await requireCompany(bearer(req), body.company_id);
      const connection = await loadConnection(company.id);
      if (connection?.stripe_account_id) await deauthorize({ accountId: connection.stripe_account_id, env, fetchImpl: fetch });
      await saveConnection(company, { status: 'disconnected', disconnected_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }
    if (action === 'save-settings') {
      const company = await requireCompany(bearer(req), body.company_id);
      const tax = parseTaxInput(body.tax_percent);
      const days = Number(body.days_until_due);
      if (tax == null) return res.status(400).json({ error: 'Enter a tax percent below 100.' });
      if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Days until due must be a whole number from 1 to 365.' });
      const connection = await loadConnection(company.id);
      const saved = await saveConnection(company, { tax_rate: tax, days_until_due: days, stripe_tax_rate_id: connection && Number(connection.tax_rate) === tax ? connection.stripe_tax_rate_id : null });
      if (saved.status === 'connected' && saved.stripe_account_id && status.configured) {
        await ensureTaxRate({ company, connection: saved, env, fetchImpl: fetch });
      }
      return res.status(200).json({ ok: true, tax_percent: Number(percentString(tax)), days_until_due: days });
    }
    if (action === 'ensure-draft') {
      const result = await createDraft(body, { env, fetchImpl: fetch, token: bearer(req) });
      return res.status(200).json(result);
    }
    if (action === 'finalize') {
      const result = await finalizeInvoice(body, { env, fetchImpl: fetch, token: bearer(req) });
      return res.status(200).json(result);
    }
    if (action === 'lookup') {
      const result = await lookupInvoice(body, bearer(req));
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: `Unknown action: ${action || '(none)'}` });
  } catch (err) {
    if (missingSchema(err)) {
      if (body.quiet) return res.status(200).json({ skipped: true, reason: 'migration_required' });
      return res.status(503).json({
        error: 'migration_required',
        message: 'Apply supabase/migrations/068_company_stripe_invoicing.sql after a backup. It has not been applied.',
      });
    }
    return res.status(err.status || 500).json({ error: err.code || err.message || 'stripe_failed' });
  }
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end();
}

async function handleOAuth(req, res) {
  const back = (params) => redirect(res, `/Settings?tab=companies&${new URLSearchParams(params)}`);
  const { code, state, error } = req.query || {};
  if (error) return back({ stripe: error === 'access_denied' ? 'denied' : 'error' });
  const parsed = readState(state, SERVICE_KEY);
  if (!parsed?.companyId) return back({ stripe: 'expired' });
  if (!code) return back({ stripe: 'error' });
  const env = process.env;
  try {
    billing.assertTestKey(env.STRIPE_SECRET_KEY);
  } catch {
    return back({ stripe: 'live_key' });
  }
  if (!env.STRIPE_CONNECT_CLIENT_ID) return back({ stripe: 'not_configured' });
  try {
    const company = await sbGetById('company_profiles', parsed.companyId, 'id,name,organization_id');
    if (!company) return back({ stripe: 'error' });
    const exchanged = await exchangeCode({ code, env, fetchImpl: fetch });
    if (!exchanged.accountId || exchanged.livemode || exchanged.liveToken) {
      await deauthorize({ accountId: exchanged.accountId, env, fetchImpl: fetch });
      return back({ stripe: 'live_key' });
    }
    await saveConnection(company, {
      stripe_account_id: exchanged.accountId,
      status: 'connected',
      livemode: false,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      connected_by: parsed.uid || null,
    });
    const connection = await loadConnection(company.id);
    await ensureTaxRate({ company, connection, env, fetchImpl: fetch });
    return back({ stripe: 'connected', company: company.id });
  } catch (err) {
    console.error('stripe connect callback failed:', safeMessage({ error: { message: err.message } }, 'connect_failed'));
    return back({ stripe: 'error' });
  }
}

async function handleWebhook(req, res, raw) {
  const env = process.env;
  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_INVOICING_WEBHOOK_SECRET'].filter((key) => !env[key]);
  if (missing.length) return res.status(501).json({ error: 'stripe_invoicing_not_configured', missing });
  try {
    billing.assertTestKey(env.STRIPE_SECRET_KEY);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.code || 'live_key_refused', message: err.message });
  }
  if (!raw) {
    return res.status(501).json({
      error: 'stripe_webhook_needs_raw_body',
      message: 'Signature checks need the exact request bytes. The stream is read before the body is parsed.',
    });
  }
  const ok = billing.verifyStripeSignature(raw, req.headers['stripe-signature'], env.STRIPE_INVOICING_WEBHOOK_SECRET);
  if (!ok) return res.status(400).json({ error: 'invalid_signature' });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }
  try {
    const result = await applyWebhookEvent(event);
    return res.status(200).json(result);
  } catch (err) {
    if (missingSchema(err)) {
      return res.status(503).json({ error: 'migration_required', message: 'Apply 068_company_stripe_invoicing.sql before accepting webhooks.' });
    }
    console.error('stripe invoicing webhook failed:', safeMessage({ error: { message: err.message } }, 'webhook_failed'));
    return res.status(500).json({ error: 'webhook_failed' });
  }
}

module.exports = {
  INVOICING_ENV,
  DEPOSIT_FRACTION,
  DEFAULT_TAX_RATE,
  DEFAULT_DAYS,
  roundMoney,
  taxOn,
  toCents,
  percentString,
  parseTaxInput,
  jobInvoiceAmounts,
  distributionInvoiceAmounts,
  manualInvoiceAmounts,
  buildDraftCalls,
  buildFinalizeCalls,
  buildTaxRateCall,
  planWebhook,
  applyPlan,
  reduceWebhook,
  routeEvent,
  signState,
  readState,
  connectAuthorizeUrl,
  publicInvoicingStatus,
  missingInvoicingEnv,
  handleStaff,
  handleOAuth,
  handleWebhook,
  applyWebhookEvent,
};
