const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const billing = require('./billing.js');

test('missing Stripe keys are reported and no request is made', async () => {
  let called = false;
  const result = await billing.createCheckout({
    orgId: 'org-1',
    planKey: 'starter',
    origin: 'https://example.test',
    env: {},
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  assert.equal(result.status, 501);
  assert.equal(result.body.error, 'stripe_not_configured');
  assert.ok(result.body.missing.includes('STRIPE_SECRET_KEY'));
  assert.equal(called, false);
});

test('a live secret key is refused before any Stripe call', async () => {
  let called = false;
  const env = Object.fromEntries(billing.REQUIRED.map((key) => [key, 'sk_test_x']));
  env.STRIPE_SECRET_KEY = 'sk_live_nope';
  const result = await billing.createCheckout({
    orgId: 'org-1',
    planKey: 'professional',
    origin: 'https://example.test',
    env,
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'live_key_refused');
  assert.equal(called, false);
});

test('test checkout sends the organization id and does not mention job payments', async () => {
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_STARTER: 'price_starter',
    STRIPE_PRICE_PROFESSIONAL: 'price_pro',
    STRIPE_PRICE_ENTERPRISE: 'price_ent',
    VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
  };
  let body = '';
  const result = await billing.createCheckout({
    orgId: '2c9485d2-9b17-48d4-bea7-72770c1e9eb9',
    planKey: 'starter',
    origin: 'https://app.example',
    customerEmail: 'owner@example.com',
    env,
    fetchImpl: async (_url, opts) => {
      body = opts.body;
      assert.equal(opts.headers.Authorization, 'Bearer sk_test_123');
      return { ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }) };
    },
  });
  assert.equal(result.status, 200);
  assert.match(result.body.url, /^https:\/\/checkout\.stripe\.com\//);
  const decoded = decodeURIComponent(body);
  assert.match(decoded, /metadata\[organization_id\]=2c9485d2-9b17-48d4-bea7-72770c1e9eb9/);
  assert.match(decoded, /price_starter/);
  assert.doesNotMatch(decoded, /amount_received/);
});

test('webhook signature accepts a fresh test payload and maps the subscription', () => {
  const secret = 'whsec_test';
  const event = {
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_123', customer: 'cus_123', status: 'active', metadata: { organization_id: 'org-9' }, current_period_end: 1_800_000_000 } },
  };
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  assert.equal(billing.verifyStripeSignature(raw, `t=${t},v1=${sig}`, secret), true);
  assert.equal(billing.verifyStripeSignature(raw, `t=${t},v1=deadbeef`, secret), false);
  const update = billing.subscriptionUpdateFromEvent(event);
  assert.deepEqual(update, {
    orgId: 'org-9',
    status: 'active',
    stripeCustomer: 'cus_123',
    stripeSubscription: 'sub_123',
    periodEnd: new Date(1_800_000_000 * 1000).toISOString(),
  });
});
