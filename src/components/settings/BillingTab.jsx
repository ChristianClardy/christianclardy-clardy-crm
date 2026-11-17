import { useState } from "react";
import { useTenant } from "@/lib/TenantContext";
import { STRIPE_ENV_KEYS } from "@/lib/tenantCatalog";
import { tenantDemo } from "@/lib/tenantPreview";
import { apiFetch } from "@/lib/apiFetch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const PLAN_BLURB = {
  starter: "CRM, jobs, estimates, and invoices. 5 seats.",
  professional: "Adds messaging, subs, and distribution. 25 seats. 14-day trial for new workspaces.",
  enterprise: "Every module, including install tracking, purchasing, and time tracking. The founding workspace is on this plan at no charge.",
};

export default function BillingTab() {
  const demo = tenantDemo();
  const { organization, subscription, isAdmin } = useTenant();
  const sub = demo?.subscription || subscription;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(demo ? { type: "info", text: "Stripe isn't connected. Add the test keys below. No charge is made until then." } : null);

  const checkout = async (planKey) => {
    if (demo) {
      setMessage({ type: "info", text: `Checkout for ${planKey} waits on Stripe test keys. Nothing was charged.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/invite?action=billing-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: planKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.url) { window.location.href = body.url; return; }
      if (body.error === "stripe_not_configured") {
        setMessage({ type: "info", text: `Stripe isn't connected. Add: ${body.missing.join(", ")}` });
      } else {
        setMessage({ type: "error", text: body.message || body.error || "Checkout didn't start." });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{organization?.name || demo?.organization?.name}</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-900 capitalize">{sub?.plan_key || "No plan"} · {sub?.status || "not set"}</h3>
        <p className="mt-1 text-sm text-slate-500">{PLAN_BLURB[sub?.plan_key] || "Choose a plan when you're ready to subscribe."}</p>
        {sub?.trial_ends_at && sub.status === "trialing" && (
          <p className="mt-2 text-sm text-amber-800">Trial ends {new Date(sub.trial_ends_at).toLocaleDateString()}.</p>
        )}
        {sub?.status === "comped" && <p className="mt-2 text-sm text-emerald-800">This workspace is comped. Billing does not change job payments.</p>}
      </div>

      {message && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${message.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{message.text}</p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(PLAN_BLURB).map(([key, blurb]) => (
          <div key={key} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold capitalize text-slate-900">{key}</p>
            <p className="mt-1 flex-1 text-xs text-slate-500">{blurb}</p>
            {isAdmin && key !== "enterprise" && (
              <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => checkout(key)}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Choose {key}
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Stripe test mode</p>
        <p className="mt-1">Add these on the Vercel project for Production and Preview. Use test keys only (`sk_test_`, `pk_test_`, `whsec_`). A live key is refused. The webhook is `POST /api/invite?action=billing-webhook` and needs the raw request body.</p>
        <ul className="mt-2 list-disc pl-5">
          {STRIPE_ENV_KEYS.map((key) => <li key={key}><code>{key}</code></li>)}
        </ul>
      </div>
    </div>
  );
}
