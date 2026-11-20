import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { STRIPE_INVOICING_ENV, stripeCall } from "@/lib/stripeInvoicing";

export default function CompanyStripePanel({ company, connection, migrationRequired, configured, missing, onChange }) {
  const [tax, setTax] = useState(String(connection?.tax_percent ?? 8.25));
  const [days, setDays] = useState(String(connection?.days_until_due ?? 14));
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const connected = connection?.status === "connected" && connection?.stripe_account_id;

  useEffect(() => {
    setTax(String(connection?.tax_percent ?? 8.25));
    setDays(String(connection?.days_until_due ?? 14));
  }, [connection?.tax_percent, connection?.days_until_due, connection?.status]);

  const run = async (key, work) => {
    setBusy(key);
    setMessage("");
    try {
      await work();
      onChange();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800">Stripe invoices</p>
          <p className="text-xs text-slate-500">
            {connected
              ? `Connected to ${connection.stripe_account_id}. Test mode. Drafts wait for Finalize & send.`
              : "Not connected. QuickBooks Pay now stays the link until this company connects its own Stripe account."}
          </p>
        </div>
        {connected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!busy || migrationRequired}
            onClick={() => run("disconnect", async () => {
              if (!await confirmAction(`Disconnect Stripe for ${company.name}? Invoices already in Stripe stay there.`)) return;
              await stripeCall("disconnect", { company_id: company.id });
            })}
          >
            {busy === "disconnect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={!!busy || migrationRequired || configured === false}
            onClick={() => run("connect", async () => {
              const { url } = await stripeCall("connect-url", { company_id: company.id });
              window.location.href = url;
            })}
          >
            {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect Stripe"}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Tax %
          <Input className="mt-1 h-8 w-24" inputMode="decimal" value={tax} disabled={migrationRequired} onChange={(event) => setTax(event.target.value)} />
        </label>
        <label className="text-xs text-slate-500">
          Days until due
          <Input className="mt-1 h-8 w-24" inputMode="numeric" value={days} disabled={migrationRequired} onChange={(event) => setDays(event.target.value)} />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!!busy || migrationRequired}
          onClick={() => run("save", () => stripeCall("save-settings", {
            company_id: company.id,
            tax_percent: tax,
            days_until_due: Number(days),
          }))}
        >
          {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">Tax is {tax || "8.25"}% of the subtotal, and the subtotal includes shipping. Stripe Tax automatic tax is not used.</p>
      {message && <p className="text-xs text-rose-700">{message}</p>}
      {missing?.length > 0 && (
        <p className="text-xs text-amber-800">Still needed on the server: {missing.join(", ")}.</p>
      )}
    </div>
  );
}

export function StripeSetupNote({ status }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <p className="font-medium text-slate-900">Stripe Connect, test mode</p>
      <p className="mt-1">Each company connects its own Stripe account. Turf&apos;n Texas stays separate from the account that bills Clardy.io subscriptions. Clardy stores the account id only. Secret keys stay in the server environment, and a live key is refused.</p>
      <ul className="mt-2 list-disc pl-5">
        {STRIPE_INVOICING_ENV.map((key) => <li key={key}><code>{key}</code></li>)}
      </ul>
      <p className="mt-2">Webhook for connected accounts: <code>{origin}/api/stripe-invoicing</code></p>
      <p>Connect redirect: <code>{origin}/StripeConnectCallback</code></p>
      {status?.migration_required && (
        <p className="mt-2 text-amber-900">Migration <code>supabase/migrations/068_company_stripe_invoicing.sql</code> has not been applied. Connect and drafts wait until it is, after a backup.</p>
      )}
    </div>
  );
}
