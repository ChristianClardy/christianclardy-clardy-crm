import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Loader2, Receipt, FileText } from "lucide-react";
import PaymentReceiptModal from "@/components/payments/PaymentReceiptModal";
import PaymentSummaryReceiptModal from "@/components/payments/PaymentSummaryReceiptModal";
import { supabase } from "@/lib/supabase";
import { qbAutoPush } from "@/lib/quickbooks";
import { reconcileDraws, drawRemaining } from "@/lib/draws";
import { confirmAction } from "@/components/ui/confirm-dialog";

const emptyForm = {
  draw_id: "",
  amount_received: "",
  payment_date: "",
  payment_method: "Other",
  reference_number: "",
  notes: "",
};

// Payments drive the draw schedule: each save/delete re-runs
// reconcileDraws(), and onDrawsChanged lets the Billing tab reload its draws.
// requestPaymentFor (a draw) opens the dialog prefilled to pay that draw.
export default function ProjectPaymentManager({ projectId, contractValue = 0, acculynxJobId = "", onUpdated, onDrawsChanged, requestPaymentFor, onRequestHandled }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [qbNote, setQbNote] = useState("");
  const [draws, setDraws] = useState([]);
  const [qbLinks, setQbLinks] = useState({}); // payment id → { origin }

  useEffect(() => {
    loadPayments();
  }, [projectId]);

  const loadPayments = async () => {
    setLoading(true);
    const [data, drawRows] = await Promise.all([
      base44.entities.Payment.filter({ linked_job_id: projectId }, "-payment_date", 500),
      base44.entities.Draw.filter({ project_id: projectId }, "draw_number").catch(() => []),
    ]);
    setPayments(data);
    setDraws(drawRows);
    setLoading(false);
    loadQbLinks(data);
  };

  // "Record payment" on a draw in the Billing tab.
  useEffect(() => {
    if (!requestPaymentFor) return;
    setSaveError("");
    setEditingPayment(null);
    setForm({ ...emptyForm, draw_id: requestPaymentFor.id, amount_received: drawRemaining(requestPaymentFor) || "", payment_date: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
    onRequestHandled?.();
  }, [requestPaymentFor]);

  const afterPaymentChange = async () => {
    await reconcileDraws(projectId);
    const drawRows = await base44.entities.Draw.filter({ project_id: projectId }, "draw_number").catch(() => []);
    setDraws(drawRows);
    onDrawsChanged?.();
  };

  // Which payments are in QuickBooks, and which came from there.
  const loadQbLinks = async (list) => {
    if (!list.length) { setQbLinks({}); return; }
    const { data } = await supabase.from("quickbooks_links").select("entity_id, origin").eq("entity_type", "payment").in("entity_id", list.map((p) => p.id));
    setQbLinks(Object.fromEntries((data || []).map((l) => [l.entity_id, l])));
  };

  // Records the payment in QuickBooks (when connected and turned on in
  // Settings → QuickBooks). Saving in Clardy never waits on QuickBooks.
  const pushToQb = async (paymentId) => {
    const r = await qbAutoPush("push-payment", { payment_id: paymentId }, "auto_push_payments");
    if (r?.error) setQbNote(`Saved, but not sent to QuickBooks: ${r.error}`);
    else if (r && !r.skipped) setQbNote(r.unapplied > 0 ? `Sent to QuickBooks. $${Number(r.unapplied).toFixed(2)} wasn't matched to an open invoice and is held as a credit there.` : "Sent to QuickBooks and applied to the job's open invoices.");
  };

  const totalReceived = useMemo(() => payments.reduce((sum, payment) => sum + (Number(payment.amount_received) || 0), 0), [payments]);
  const remainingBalance = Math.max(0, (Number(contractValue) || 0) - totalReceived);

  const syncProjectTotals = async (paymentList) => {
    const received = paymentList.reduce((sum, payment) => sum + (Number(payment.amount_received) || 0), 0);
    await base44.entities.Project.update(projectId, {
      billed_to_date: received,
      sync_locked: true,
    });
    await onUpdated?.();
  };

  const openDialog = (payment = null) => {
    setSaveError("");
    if (payment) {
      setEditingPayment(payment);
      setForm({
        amount_received: payment.amount_received ?? "",
        draw_id: payment.draw_id || "",
        payment_date: payment.payment_date || "",
        payment_method: payment.payment_method || "Other",
        reference_number: payment.reference_number || "",
        notes: payment.notes || "",
      });
    } else {
      setEditingPayment(null);
      setForm({ ...emptyForm, payment_date: new Date().toISOString().slice(0, 10) });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    const payload = {
      linked_job_id: projectId,
      draw_id: form.draw_id || null,
      amount_received: parseFloat(form.amount_received) || 0,
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      reference_number: form.reference_number,
      notes: form.notes,
    };

    try {
      setQbNote("");
      const saved = editingPayment
        ? await base44.entities.Payment.update(editingPayment.id, payload)
        : await base44.entities.Payment.create(payload);
      const savedId = editingPayment?.id || saved?.id;
      // Payments that came from QuickBooks are edited there, not pushed back.
      if (savedId && qbLinks[savedId]?.origin !== "qb") await pushToQb(savedId);
      const refreshed = await base44.entities.Payment.filter({ linked_job_id: projectId }, "-payment_date", 500);
      setPayments(refreshed);
      loadQbLinks(refreshed);
      await afterPaymentChange();
      await syncProjectTotals(refreshed);
      setDialogOpen(false);
    } catch (err) {
      setSaveError(err?.message || "Failed to save payment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (paymentId) => {
    const link = qbLinks[paymentId];
    if (!await confirmAction(link?.origin === "qb"
      ? "Delete this payment from Clardy? It was recorded in QuickBooks and stays there; delete it in QuickBooks instead to remove it everywhere."
      : link ? "Delete this payment? It's also removed from QuickBooks." : "Delete this payment?")) return;
    if (link?.origin === "app") {
      const r = await qbAutoPush("delete-payment", { payment_id: paymentId });
      if (r?.error) { alert(`Couldn't remove it from QuickBooks, so it wasn't deleted: ${r.error}`); return; }
    }
    await base44.entities.Payment.delete(paymentId);
    const refreshed = await base44.entities.Payment.filter({ linked_job_id: projectId }, "-payment_date", 500);
    setPayments(refreshed);
    await afterPaymentChange();
    await syncProjectTotals(refreshed);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900">Payments Received</h3>
          <p className="text-xs text-slate-400 mt-0.5">Track manual and synced payments for this project.</p>
          {qbNote && <p className={`text-xs mt-1 ${qbNote.startsWith("Saved, but") ? "text-amber-700" : "text-emerald-700"}`}>{qbNote}</p>}
        </div>
        <div className="flex items-center gap-2">
          {payments.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setSummaryOpen(true)}>
              <FileText className="w-4 h-4 mr-1" /> Payment Summary
            </Button>
          )}
          <Button size="sm" onClick={() => openDialog()} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> Add Payment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 p-4 border-b border-slate-100 bg-slate-50">
        <div>
          <p className="text-xs text-slate-500 mb-1">Total Received</p>
          <p className="text-lg font-bold text-emerald-700">${totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Remaining Balance</p>
          <p className="text-lg font-bold text-amber-700">${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : payments.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No payments recorded yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Method</th>
                <th className="text-left px-4 py-3">Reference</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Notes</th>
                <th className="px-4 py-3 w-32" />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-100 hover:bg-amber-50/30">
                  <td className="px-4 py-3 text-slate-700">{payment.payment_date || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {payment.payment_method || "Other"}
                    {qbLinks[payment.id] && (
                      <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700" title={qbLinks[payment.id].origin === "qb" ? "Recorded in QuickBooks" : "Sent to QuickBooks"}>
                        QB{qbLinks[payment.id].origin === "qb" ? " ←" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{payment.reference_number || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">${Number(payment.amount_received || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-slate-500">{payment.notes || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-amber-700" title="View / Download Receipt" onClick={() => setReceiptPayment(payment)}>
                        <Receipt className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => openDialog(payment)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400" onClick={() => handleDelete(payment.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaymentSummaryReceiptModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        projectId={projectId}
        payments={payments}
        contractValue={contractValue}
      />

      {receiptPayment && (
        <PaymentReceiptModal
          open={Boolean(receiptPayment)}
          onClose={() => setReceiptPayment(null)}
          payment={receiptPayment}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? "Edit Payment" : "Add Payment"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Apply to draw</Label>
              <select
                value={form.draw_id}
                onChange={(e) => {
                  const d = draws.find((x) => x.id === e.target.value);
                  setForm((f) => ({ ...f, draw_id: e.target.value, amount_received: f.amount_received || (d ? drawRemaining(d) : "") }));
                }}
                className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
              >
                <option value="">Automatic: oldest unpaid draw first</option>
                {draws.map((d) => (
                  <option key={d.id} value={d.id}>
                    #{d.draw_number} {d.title}{d.status === "paid" && d.id !== form.draw_id ? " (paid)" : ` ($${drawRemaining(d).toLocaleString("en-US", { maximumFractionDigits: 2 })} left)`}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">The draw schedule updates from payments: a draw is marked paid once payments cover it, and anything extra goes to the next draw.</p>
            </div>
            <div>
              <Label>Amount *</Label>
              <Input type="number" min="0" step="0.01" value={form.amount_received} onChange={(e) => setForm(f => ({ ...f, amount_received: e.target.value }))} className="mt-1.5" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Payment Date *</Label>
                <Input type="date" value={form.payment_date} onChange={(e) => setForm(f => ({ ...f, payment_date: e.target.value }))} className="mt-1.5" required />
              </div>
              <div>
                <Label>Method</Label>
                <Select value={form.payment_method} onValueChange={(value) => setForm(f => ({ ...f, payment_method: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACH">ACH</SelectItem>
                    <SelectItem value="Check">Check</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="Financing">Financing</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Reference Number</Label>
              <Input value={form.reference_number} onChange={(e) => setForm(f => ({ ...f, reference_number: e.target.value }))} className="mt-1.5" placeholder="Check #, confirmation #, invoice ref..." />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1.5" placeholder="Optional notes" />
            </div>
            {saveError && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{saveError}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : editingPayment ? "Save Changes" : "Add Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}