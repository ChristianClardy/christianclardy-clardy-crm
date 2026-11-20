import { apiFetch } from "@/lib/apiFetch";

// Staff calls for /api/stripe-invoicing (rewritten to /api/invite). The
// browser never sees a Stripe secret. Connect, drafts, and Finalize & Send
// happen on the server.

export const STRIPE_INVOICING_ENV = [
  "STRIPE_SECRET_KEY",
  "STRIPE_CONNECT_CLIENT_ID",
  "STRIPE_INVOICING_WEBHOOK_SECRET",
];

export async function stripeCall(action, payload = {}) {
  const res = await apiFetch("/api/stripe-invoicing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Stripe ${action} failed.`);
    err.code = data.error;
    throw err;
  }
  return data;
}

// Used when a job is approved or completed, and when an order is marked
// invoiced. Failures stay quiet so saving the job still works before Stripe
// is connected or before migration 068 is applied. This does not send.
export async function queueStripeDraft(payload) {
  try {
    return await stripeCall("ensure-draft", { ...payload, quiet: true });
  } catch {
    return { skipped: true };
  }
}

export function payUrlForInvoice(invoice, { stripeConnected }) {
  if (stripeConnected) return invoice?.stripe_hosted_invoice_url || null;
  return invoice?.qb_payment_link || null;
}
