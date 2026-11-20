const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { readFileSync } = require('fs');
const billing = require('./billing.js');
const { readRawBody } = require('./rawBody.js');
const stripe = require('./stripeInvoicing.js');

const COMPANY_A = '053ff852-852b-4709-8b3b-3fb27c43c0ab';
const COMPANY_B = '11111111-1111-4111-8111-111111111111';

function connection(companyId, account) {
  return {
    company_id: companyId,
    organization_id: '2c9485d2-9b17-48d4-bea7-72770c1e9eb9',
    stripe_account_id: account,
    status: 'connected',
    livemode: false,
  };
}

function emptyState() {
  return {
    connections: [connection(COMPANY_A, 'acct_turf'), connection(COMPANY_B, 'acct_principle')],
    payments: [],
    stripeInvoices: [{
      stripe_invoice_id: 'in_deposit',
      company_id: COMPANY_A,
      project_id: 'proj-1',
      kind: 'deposit',
    }],
    processedEventIds: new Set(),
  };
}

test('tax is 8.25% of the subtotal including shipping', () => {
  const amounts = stripe.distributionInvoiceAmounts({
    lines: [
      { description: 'Kentucky Pro', qty: 1, rate: 6285 },
    ],
    deliveryFee: 400,
    taxRate: 0.0825,
  });
  assert.equal(amounts.subtotal, 6285);
  assert.equal(amounts.shipping, 400);
  assert.equal(amounts.taxable, 6685);
  assert.equal(amounts.tax, 551.51);
  assert.equal(amounts.total, 7236.51);
  assert.equal(amounts.pricingIncomplete, false);
  assert.deepEqual(amounts.lines.map((line) => line.description), ['Kentucky Pro', 'Shipping']);
  assert.equal(stripe.percentString(0.0825), '8.25');
});

test('deposit is half the contract and the final invoice is the remainder plus change orders', () => {
  const deposit = stripe.jobInvoiceAmounts({ contractValue: 10000, kind: 'deposit', taxRate: 0.0825 });
  assert.equal(deposit.subtotal, 5000);
  assert.equal(deposit.shipping, 0);
  assert.equal(deposit.tax, 412.5);
  assert.equal(deposit.total, 5412.5);
  const finalInvoice = stripe.jobInvoiceAmounts({
    contractValue: 10000,
    changeOrders: 500,
    kind: 'final',
    taxRate: 0.0825,
    depositSubtotal: deposit.depositSubtotal,
  });
  assert.equal(finalInvoice.subtotal, 5500);
  assert.equal(finalInvoice.tax, 453.75);
  assert.equal(finalInvoice.total, 5953.75);
  const odd = stripe.jobInvoiceAmounts({ contractValue: 10.01, kind: 'deposit' });
  const rest = stripe.jobInvoiceAmounts({ contractValue: 10.01, kind: 'final', depositSubtotal: odd.depositSubtotal });
  assert.equal(stripe.roundMoney(odd.subtotal + rest.subtotal), 10.01);
});

test('draft calls stay unsent and tax the shipping line with the manual tax rate', () => {
  const calls = stripe.buildDraftCalls({
    accountId: 'acct_turf',
    customerId: 'cus_1',
    taxRateId: 'txr_tx',
    daysUntilDue: 14,
    idempotencyKey: 'clardy-inv:turf:distribution:order-1',
    description: 'Materials and shipping',
    metadata: { company_id: COMPANY_A, kind: 'distribution', clardy_order_id: 'order-1' },
    lines: [
      { description: 'Kentucky Pro', amount: 6285 },
      { description: 'Shipping', amount: 400 },
    ],
    stripeInvoiceId: 'in_1',
  });
  const invoice = calls[0];
  assert.equal(invoice.path, '/v1/invoices');
  assert.equal(invoice.accountId, 'acct_turf');
  assert.match(invoice.idempotencyKey, /^clardy-inv:/);
  const encoded = invoice.body.toString();
  assert.match(encoded, /collection_method=send_invoice/);
  assert.match(encoded, /auto_advance=false/);
  assert.match(encoded, /days_until_due=14/);
  assert.match(encoded, /metadata%5Bkind%5D=distribution/);
  assert.match(encoded, /customer_balance/);
  assert.doesNotMatch(encoded, /automatic_tax/);
  assert.equal(calls.some((call) => call.path.includes('/finalize') || call.path.endsWith('/send')), false);
  const shipping = calls.find((call) => call.body.toString().includes('Shipping'));
  assert.match(shipping.body.toString(), /amount=40000/);
  assert.match(shipping.body.toString(), /tax_rates%5B0%5D=txr_tx/);
  const finalize = stripe.buildFinalizeCalls({ stripeInvoiceId: 'in_1', accountId: 'acct_turf' });
  assert.deepEqual(finalize.map((call) => call.path), ['/v1/invoices/in_1/finalize', '/v1/invoices/in_1/send']);
});

test('webhook signature uses the raw bytes and a retried event does not double a payment', async () => {
  const secret = 'whsec_invoicing';
  const event = {
    id: 'evt_paid',
    type: 'invoice.paid',
    account: 'acct_turf',
    livemode: false,
    data: {
      object: {
        id: 'in_deposit',
        object: 'invoice',
        amount_paid: 541250,
        payment_intent: 'pi_card',
        charge: 'ch_1',
        customer: 'cus_1',
        metadata: { company_id: COMPANY_A, kind: 'deposit' },
        status_transitions: { paid_at: 1700000000 },
      },
    },
  };
  const raw = JSON.stringify(event);
  const req = new EventEmitter();
  req.setEncoding = () => {};
  process.nextTick(() => {
    req.emit('data', raw);
    req.emit('end');
  });
  const body = await readRawBody(req);
  const stamp = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${stamp}.${body}`).digest('hex');
  assert.equal(billing.verifyStripeSignature(body, `t=${stamp},v1=${sig}`, secret), true);
  assert.equal(billing.verifyStripeSignature(body, `t=${stamp},v1=${sig}`, 'whsec_other'), false);
  assert.equal(await readRawBody({ rawBody: body }), body);
  assert.equal(await readRawBody({ body: { id: 'evt_paid' }, readableEnded: true }), null);

  let state = emptyState();
  let step = stripe.reduceWebhook(state, event);
  state = step.state;
  assert.equal(step.plan.companyId, COMPANY_A);
  assert.equal(state.payments.length, 1);
  assert.equal(state.payments[0].amount_received, 5412.5);
  assert.equal(state.payments[0].linked_job_id, 'proj-1');
  assert.equal(state.payments[0].stripe_invoice_id, 'in_deposit');
  step = stripe.reduceWebhook(state, event);
  assert.equal(step.plan.duplicate, true);
  assert.equal(step.state.payments.length, 1);

  const partial = stripe.reduceWebhook(emptyState(), {
    ...event,
    id: 'evt_partial',
    data: { object: { ...event.data.object, amount_paid: 20000 } },
  });
  const full = stripe.reduceWebhook(partial.state, {
    ...event,
    id: 'evt_full',
    data: { object: { ...event.data.object, amount_paid: 541250 } },
  });
  assert.equal(full.state.payments.length, 1);
  assert.equal(full.state.payments[0].amount_received, 5412.5);
});

test('events route to the connected company and ACH cash does not count twice', () => {
  const wrong = stripe.planWebhook({
    id: 'evt_wrong',
    type: 'invoice.paid',
    account: 'acct_principle',
    data: { object: { id: 'in_deposit', amount_paid: 100, metadata: { company_id: COMPANY_A } } },
  }, emptyState());
  assert.equal(wrong.reason, 'company_mismatch');

  const unknown = stripe.planWebhook({
    id: 'evt_unknown',
    type: 'invoice.paid',
    account: 'acct_other',
    data: { object: { id: 'in_x', amount_paid: 100 } },
  }, emptyState());
  assert.equal(unknown.reason, 'unknown_account');

  const live = stripe.planWebhook({ id: 'evt_live', type: 'invoice.paid', livemode: true, account: 'acct_turf' }, emptyState());
  assert.equal(live.reason, 'live_event_refused');

  let state = emptyState();
  state = stripe.reduceWebhook(state, {
    id: 'evt_fund',
    type: 'customer_cash_balance_transaction.created',
    account: 'acct_turf',
    livemode: false,
    data: { object: { id: 'ccsbtxn_1', object: 'customer_cash_balance_transaction', type: 'funded', customer: 'cus_1', net_amount: 541250, created: 1700000000 } },
  }).state;
  state = stripe.reduceWebhook(state, {
    id: 'evt_apply',
    type: 'customer_cash_balance_transaction.created',
    account: 'acct_turf',
    data: { object: { id: 'ccsbtxn_2', object: 'customer_cash_balance_transaction', type: 'applied_to_payment', customer: 'cus_1', applied_to_payment: { payment_intent: 'pi_ach' } } },
  }).state;
  state = stripe.reduceWebhook(state, {
    id: 'evt_avail',
    type: 'cash_balance.funds_available',
    account: 'acct_turf',
    data: { object: { object: 'cash_balance', customer: 'cus_1', available: { usd: 541250 } } },
  }).state;
  state = stripe.reduceWebhook(state, {
    id: 'evt_paid_ach',
    type: 'invoice.paid',
    account: 'acct_turf',
    data: { object: { id: 'in_deposit', object: 'invoice', amount_paid: 541250, payment_intent: 'pi_ach', customer: 'cus_1', metadata: { company_id: COMPANY_A, kind: 'deposit' } } },
  }).state;
  assert.equal(state.payments.length, 1);
  assert.equal(state.payments[0].amount_received, 5412.5);
  assert.equal(state.payments[0].payment_method, 'ACH');
  assert.equal(state.payments[0].company_id, COMPANY_A);
  assert.equal(state.payments[0].stripe_invoice_id, 'in_deposit');
  assert.equal(state.payments.some((row) => row.company_id === COMPANY_B), false);
});

test('refunds and credit notes reduce payments once', () => {
  let state = emptyState();
  state = stripe.reduceWebhook(state, {
    id: 'evt_paid',
    type: 'invoice.paid',
    account: 'acct_turf',
    data: { object: { id: 'in_deposit', object: 'invoice', amount_paid: 10000, charge: 'ch_1', payment_intent: 'pi_1', metadata: { company_id: COMPANY_A } } },
  }).state;
  state = stripe.reduceWebhook(state, {
    id: 'evt_refund',
    type: 'charge.refunded',
    account: 'acct_turf',
    data: { object: { id: 'ch_1', object: 'charge', amount_refunded: 4000, invoice: 'in_deposit', customer: 'cus_1', created: 1700000000 } },
  }).state;
  state = stripe.reduceWebhook(state, {
    id: 'evt_refund_again',
    type: 'charge.refunded',
    account: 'acct_turf',
    data: { object: { id: 'ch_1', object: 'charge', amount_refunded: 4000, invoice: 'in_deposit' } },
  }).state;
  state = stripe.reduceWebhook(state, {
    id: 'evt_cn',
    type: 'credit_note.created',
    account: 'acct_turf',
    data: { object: { id: 'cn_1', object: 'credit_note', invoice: 'in_deposit', refunds: [{ refund: 're_1' }], post_payment_amount: 4000, pre_payment_amount: 0, out_of_band_amount: 0 } },
  }).state;
  const amounts = state.payments.map((row) => row.amount_received).sort((a, b) => a - b);
  assert.deepEqual(amounts, [-40, 100]);
  state = stripe.reduceWebhook(state, {
    id: 'evt_oob',
    type: 'credit_note.created',
    account: 'acct_principle',
    data: { object: { id: 'cn_2', object: 'credit_note', invoice: 'in_other', refunds: [], post_payment_amount: 0, pre_payment_amount: 0, out_of_band_amount: 1500, metadata: { company_id: COMPANY_B } } },
  }).state;
  const principle = state.payments.find((row) => row.company_id === COMPANY_B);
  assert.equal(principle.amount_received, -15);
  assert.equal(principle.stripe_object_id, 'cn_2');
});

test('a live platform key is refused and the migration is present but not applied', () => {
  assert.throws(
    () => stripe.publicInvoicingStatus({
      STRIPE_SECRET_KEY: 'sk_live_nope',
      STRIPE_CONNECT_CLIENT_ID: 'ca_test',
      STRIPE_INVOICING_WEBHOOK_SECRET: 'whsec_test',
    }),
    /live Stripe key/i,
  );
  const sql = readFileSync('supabase/migrations/068_company_stripe_invoicing.sql', 'utf8');
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /company_stripe_connections/);
  assert.match(sql, /stripe_webhook_events/);
  assert.match(sql, /auto_advance/);
  assert.doesNotMatch(sql, /access_token\s+text|secret_key\s+text|client_secret\s+text/i);
});
