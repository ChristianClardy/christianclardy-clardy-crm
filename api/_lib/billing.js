// Stripe test-mode integration point. No charge is made unless Christian
// adds test keys. Live keys are refused. Job payments are not touched.
//
// Webhook: POST /api/invite?action=billing-webhook
// Checkout: POST /api/invite?action=billing-checkout  { plan_key }
// Status:   POST /api/invite?action=billing-status

const crypto = require('crypto');

const PRICE_ENV = {
  starter: 'STRIPE_PRICE_STARTER',
  professional: 'STRIPE_PRICE_PROFESSIONAL',
  enterprise: 'STRIPE_PRICE_ENTERPRISE',
};

const REQUIRED = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_PROFESSIONAL',
  'STRIPE_PRICE_ENTERPRISE',
  'VITE_STRIPE_PUBLISHABLE_KEY',
];

function missingKeys(env = process.env) {
  return REQUIRED.filter((key) => !env[key]);
}

function assertTestKey(secret) {
  if (!secret) return;
  if (secret.startsWith('sk_live') || secret.startsWith('rk_live')) {
    const err = new Error('Refusing a live Stripe key. Use a test key (sk_test_...).');
    err.status = 400;
    err.code = 'live_key_refused';
    throw err;
  }
}

function publicStatus(env = process.env) {
  const missing = missingKeys(env);
  let mode = 'unconfigured';
  if (env.STRIPE_SECRET_KEY) {
    assertTestKey(env.STRIPE_SECRET_KEY);
    mode = env.STRIPE_SECRET_KEY.startsWith('sk_test') ? 'test' : 'unknown';
  }
  return {
    configured: missing.length === 0 && mode === 'test',
    mode,
    missing,
  };
}

function checkoutBody({ orgId, priceId, successUrl, cancelUrl, customerEmail }) {
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', orgId);
  params.set('metadata[organization_id]', orgId);
  params.set('subscription_data[metadata][organization_id]', orgId);
  if (customerEmail) params.set('customer_email', customerEmail);
  return params;
}

// Stripe-Signature: t=timestamp,v1=hex
function verifyStripeSignature(rawBody, header, secret, now = Date.now()) {
  if (!rawBody || !header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(',').map((piece) => {
    const [k, v] = piece.split('=');
    return [k, v];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(now - Number(timestamp) * 1000);
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Maps a verified Stripe event onto apply_subscription_status arguments.
// Unknown events return null. Never reads payment amounts for jobs.
function subscriptionUpdateFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const obj = event.data?.object || {};
  const orgId = obj.metadata?.organization_id || obj.client_reference_id || obj.subscription_details?.metadata?.organization_id;
  if (!orgId) return null;
  if (event.type === 'checkout.session.completed') {
    return {
      orgId,
      status: 'active',
      stripeCustomer: obj.customer || null,
      stripeSubscription: obj.subscription || null,
      periodEnd: null,
    };
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const status = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'past_due',
      incomplete: 'incomplete',
      incomplete_expired: 'canceled',
    }[obj.status] || 'past_due';
    const periodEnd = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null;
    return {
      orgId,
      status: event.type === 'customer.subscription.deleted' ? 'canceled' : status,
      stripeCustomer: obj.customer || null,
      stripeSubscription: obj.id || null,
      periodEnd,
    };
  }
  return null;
}

async function createCheckout({ orgId, planKey, origin, customerEmail, env = process.env, fetchImpl = fetch }) {
  const missing = missingKeys(env);
  if (missing.length) {
    return { status: 501, body: { error: 'stripe_not_configured', missing } };
  }
  try {
    assertTestKey(env.STRIPE_SECRET_KEY);
  } catch (err) {
    return { status: err.status || 400, body: { error: err.code || 'live_key_refused', message: err.message } };
  }
  const priceEnv = PRICE_ENV[planKey];
  const priceId = priceEnv ? env[priceEnv] : null;
  if (!priceId) {
    return { status: 400, body: { error: 'unknown_plan' } };
  }
  const params = checkoutBody({
    orgId,
    priceId,
    successUrl: `${origin}/Settings?tab=billing&checkout=success`,
    cancelUrl: `${origin}/Settings?tab=billing&checkout=cancel`,
    customerEmail,
  });
  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { status: res.status, body: { error: payload.error?.message || 'Stripe refused the checkout session.' } };
  }
  return { status: 200, body: { url: payload.url } };
}

module.exports = {
  PRICE_ENV,
  REQUIRED,
  missingKeys,
  assertTestKey,
  publicStatus,
  checkoutBody,
  verifyStripeSignature,
  subscriptionUpdateFromEvent,
  createCheckout,
};
