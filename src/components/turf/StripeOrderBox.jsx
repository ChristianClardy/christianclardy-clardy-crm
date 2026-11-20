import { useEffect, useState } from "react";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { formatMoney } from "@/lib/turf/money";
import { stripeCall } from "@/lib/stripeInvoicing";

export default function StripeOrderBox({ orderId, brand, readOnly }) {
  const [invoice, setInvoice] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const lookup = brand === "turf"
    ? { turf_order_id: orderId, kind: "distribution" }
    : { distribution_order_id: orderId, kind: "distribution" };

  const load = () => {
    setNote("");
    stripeCall("lookup", lookup)
      .then((data) => {
        if (data.migration_required) setNote("Stripe invoicing waits on migration 068.");
        else setInvoice(data.invoice || null);
      })
      .catch((err) => setNote(err.message));
  };

  useEffect(() => {
    let live = true;
    stripeCall("lookup", lookup)
      .then((data) => {
        if (!live) return;
        if (data.migration_required) setNote("Stripe invoicing waits on migration 068.");
        else setInvoice(data.invoice || null);
      })
      .catch((err) => { if (live) setNote(err.message); });
    return () => { live = false; };
    // lookup identity follows the order id and brand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, brand]);

  const draft = async () => {
    setBusy(true);
    setNote("");
    try {
      const data = await stripeCall("ensure-draft", lookup);
      if (data.skipped) setNote(data.reason === "stripe_not_connected" ? "Connect Stripe for this company before creating a draft." : "The draft was not created.");
      setInvoice(data.invoice || null);
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!invoice) return;
    const ok = await confirmAction(
      `Subtotal ${formatMoney(invoice.subtotal)}, shipping ${formatMoney(invoice.shipping)}, tax ${formatMoney(invoice.tax)} (${invoice.tax_percent}% of the subtotal, including shipping). Total ${formatMoney(invoice.total)}. Stripe emails the customer. Nothing is sent until you confirm.`,
      { title: "Finalize and send?", confirmLabel: "Finalize & send" },
    );
    if (!ok) return;
    setBusy(true);
    setNote("");
    try {
      const data = await stripeCall("finalize", { stripe_invoice_id: invoice.stripe_invoice_id });
      setInvoice(data.invoice || invoice);
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <div className="font-semibold text-slate-900">Stripe invoice</div>
      <p className="mt-1 text-slate-500">A draft is not emailed. Finalize & send is the step that sends it. Tax is on materials plus shipping.</p>
      {invoice && (
        <p className="mt-2 text-slate-700">
          {invoice.status} · {formatMoney(invoice.total)}
          {invoice.hosted_invoice_url && (
            <>
              {" · "}
              <a className="font-medium text-emerald-700 underline" href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer">Pay now</a>
            </>
          )}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!invoice && <button type="button" disabled={readOnly || busy} className="h-9 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50" onClick={draft}>Create Stripe draft</button>}
        {invoice?.status === "draft" && <button type="button" disabled={readOnly || busy} className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50" onClick={send}>Finalize & send</button>}
        <button type="button" className="h-9 rounded-md px-3 text-sm text-slate-500" onClick={load}>Refresh</button>
      </div>
      {note && <p className="mt-2 text-amber-800">{note}</p>}
    </div>
  );
}
