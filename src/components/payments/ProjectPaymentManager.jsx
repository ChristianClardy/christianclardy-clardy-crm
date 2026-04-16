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

const emptyForm = {
  amount_received: "",
  payment_date: "",
  payment_method: "Other",
  reference_number: "",
  notes: "",
};

export default function ProjectPaymentManager({ projectId, contractValue = 0, acculynxJobId = "", onUpdated, project, client, company }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [resolvedClient, setResolvedClient] = useState(null);
  const [resolvedCompany, setResolvedCompany] = useState(null);

  useEffect(() => {
    loadPayments();
  }, [projectId]);

  // Load client directly if not provided via props
  useEffect(() => {
    if (client) {
      setResolvedClient(client);
    } else if (project?.client_id) {
      base44.entities.Client.get(project.client_id)
        .then(setResolvedClient)
        .catch(() => setResolvedClient(null));
    } else {
      setResolvedClient(null);
    }
  }, [client, project?.client_id]);

  // Load company directly if not provided via props; fallback to client's company name
  useEffect(() => {
    const load = async () => {
      if (company) { setResolvedCompany(company); return; }
      if (project?.company_id) {
        const c = await base44.entities.CompanyProfile.get(project.company_id).catch(() => null);
        if (c) { setResolvedCompany(c); return; }
      }
      // Last resort: look up by the client's company name string
      if (resolvedClient?.company) {
        const all = await base44.entities.CompanyProfile.list("name", 200).catch(() => []);
        const found = all.find(c => c.name === resolvedClient.company) || null;
        setResolvedCompany(found);
      }
    };
    load();
  }, [company, project?.company_id, resolvedClient?.company]);

  const loadPayments = async () => {
    setLoading(true);
    const data = await base44.entities.Payment.filter({ linked_job_id: projectId }, "-payment_date", 500);
    setPayments(data);
    setLoading(false);
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
      amount_received: parseFloat(form.amount_received) || 0,
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      reference_number: form.reference_number,
      notes: form.notes,
    };

    try {
      if (editingPayment) {
        await base44.entities.Payment.update(editingPayment.id, payload);
      } else {
        await base44.entities.Payment.create(payload);
      }
      const refreshed = await base44.entities.Payment.filter({ linked_job_id: projectId }, "-payment_date", 500);
      setPayments(refreshed);
      await syncProjectTotals(refreshed);
      setDialogOpen(false);
    } catch (err) {
      setSaveError(err?.message || "Failed to save payment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (paymentId) => {
    if (!confirm("Delete this payment?")) return;
    await base44.entities.Payment.delete(paymentId);
    const refreshed = await base44.entities.Payment.filter({ linked_job_id: projectId }, "-payment_date", 500);
    setPayments(refreshed);
    await syncProjectTotals(refreshed);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900">Payments Received</h3>
          <p className="text-xs text-slate-400 mt-0.5">Track manual and synced payments for this project.</p>
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
                  <td className="px-4 py-3 text-slate-600">{payment.payment_method || "Other"}</td>
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
        payments={payments}
        project={project}
        client={resolvedClient}
        company={resolvedCompany}
        contractValue={contractValue}
      />

      {receiptPayment && (
        <PaymentReceiptModal
          open={Boolean(receiptPayment)}
          onClose={() => setReceiptPayment(null)}
          payment={receiptPayment}
          project={project}
          client={resolvedClient}
          company={resolvedCompany}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? "Edit Payment" : "Add Payment"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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