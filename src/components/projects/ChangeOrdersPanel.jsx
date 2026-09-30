import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Send, Loader2, Eye, Pencil, CheckCircle2, FileText, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import DocuSignEnvelopes from "@/components/docusign/DocuSignEnvelopes";

// A project's Change Orders tab. Each change order has a title, the
// description of the change, optional line items, and its schedule impact.
// "Send for signature" opens the project's Contracts tab (ContractsPanel, the
// same sender as the CRM) with this change order and the first change order
// template picked, so {{change_order.*}} merge fields fill in from what's
// typed here. Once signed, api/_lib/docusign.js marks the change order
// approved and files the signed PDF in the project's Files → Contracts.
//
// Status: draft → sent → approved (or declined). Voiding the envelope in
// DocuSign puts it back to draft so it can be edited and re-sent.

const STATUS = {
  draft:    { label: "Draft",     className: "bg-slate-100 text-slate-600" },
  sent:     { label: "Out for signature", className: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved",  className: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Declined",  className: "bg-rose-100 text-rose-700" },
  void:     { label: "Void",      className: "bg-slate-100 text-slate-400 line-through" },
};

const money = (n) => {
  const v = Number(n || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const today = () => new Date().toLocaleDateString("en-CA");
const itemsTotal = (items) => (items || []).reduce((s, li) => s + (Number(li.amount) || 0), 0);
const hasItems = (items) => (items || []).some((li) => (li.description || "").trim() || Number(li.amount));

export default function ChangeOrdersPanel({ project, onSend }) {
  const [orders, setOrders] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | change order

  const load = async () => {
    const rows = await base44.entities.ChangeOrder.filter({ project_id: project.id }).catch(() => []);
    rows.sort((a, b) => (a.number || 0) - (b.number || 0) || String(a.created_date).localeCompare(String(b.created_date)));
    setOrders(rows);
  };
  useEffect(() => { load(); }, [project.id]);


  const approvedTotal = (orders || []).filter((o) => o.status === "approved").reduce((s, o) => s + Number(o.amount || 0), 0);
  const pendingTotal = (orders || []).filter((o) => o.status === "draft" || o.status === "sent").reduce((s, o) => s + Number(o.amount || 0), 0);
  const original = Number(project.contract_value || 0);

  const setStatus = async (co, status) => {
    const patch = { status };
    if (status === "approved") patch.approved_date = today();
    await base44.entities.ChangeOrder.update(co.id, patch);
    load();
  };

  const remove = async (co) => {
    if (!confirm(`Delete ${co.number ? `CO-${co.number}` : "this change order"}? This can't be undone.`)) return;
    await base44.entities.ChangeOrder.delete(co.id);
    load();
  };

  if (!orders) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Original contract" value={money(original)} />
        <Stat label="Approved change orders" value={money(approvedTotal)} />
        <Stat label="Revised contract" value={money(original + approvedTotal)} strong />
        <Stat label="Pending (draft or out for signature)" value={money(pendingTotal)} muted />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Change Orders</h2>
        <Button onClick={() => setEditing("new")} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <Plus className="w-4 h-4 mr-1.5" /> New change order
        </Button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No change orders yet. Create one, then send it to the customer to sign in DocuSign.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {orders.map((co) => {
            const st = STATUS[co.status] || STATUS.draft;
            const locked = co.status === "approved" || co.status === "sent";
            return (
              <div key={co.id} className="px-4 py-3 space-y-2">
                <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">
                      <span className="text-slate-400 font-mono text-sm mr-2">{co.number ? `CO-${co.number}` : "CO"}</span>
                      {co.title || "Untitled change order"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmtDate(co.requested_date)}
                      {Number(co.schedule_days) ? ` · +${co.schedule_days} workday${Number(co.schedule_days) === 1 ? "" : "s"}` : ""}
                      {co.approved_date && co.status === "approved" ? ` · Approved ${fmtDate(co.approved_date)}` : ""}
                    </p>
                    {co.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2 whitespace-pre-line">{co.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className={cn("text-sm font-semibold", Number(co.amount) < 0 ? "text-rose-600" : "text-slate-900")}>{money(co.amount)}</span>
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", st.className)}>{st.label}</span>
                    {co.signed_document_url && (
                      <a href={co.signed_document_url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-700 hover:underline">Signed PDF</a>
                    )}
                    {!locked && co.status !== "void" && (
                      <Button size="sm" onClick={() => onSend(co)} className="bg-slate-900 text-white h-8">
                        <Send className="w-4 h-4 mr-1" /> Send for signature
                      </Button>
                    )}
                    {co.status === "sent" && (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => onSend(co)}>
                        <Send className="w-4 h-4 mr-1" /> Resend
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(co)} title={locked ? "View" : "Edit"}>
                      {locked ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </Button>
                    {(co.status === "draft" || co.status === "sent" || co.status === "declined") && (
                      <Button size="sm" variant="outline" className="h-8" title="Mark approved (signed on paper)"
                        onClick={() => { if (confirm("Mark this change order approved without DocuSign (e.g. signed on paper)?")) setStatus(co, "approved"); }}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}
                    {co.status === "draft" ? (
                      <Button size="sm" variant="outline" className="h-8 text-rose-600" title="Delete" onClick={() => remove(co)}><Trash2 className="w-4 h-4" /></Button>
                    ) : co.status !== "void" && co.status !== "approved" && (
                      <Button size="sm" variant="outline" className="h-8" title="Void" onClick={() => { if (confirm("Void this change order?")) setStatus(co, "void"); }}><Ban className="w-4 h-4" /></Button>
                    )}
                  </div>
                </div>
                {co.status !== "draft" && co.status !== "void" && (
                  <DocuSignEnvelopes entityType="change_order" entityId={co.id} className="!mt-1" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ChangeOrderEditor
          project={project}
          changeOrder={editing === "new" ? null : editing}
          nextNumber={Math.max(0, ...orders.map((o) => Number(o.number) || 0)) + 1}
          onClose={() => setEditing(null)}
          onSaved={(saved, andSend) => { setEditing(null); load(); if (andSend && saved) onSend(saved); }}
        />
      )}

    </div>
  );
}

function Stat({ label, value, strong, muted }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("text-xl font-bold mt-0.5", strong ? "text-emerald-700" : muted ? "text-slate-500" : "text-slate-900")}>{value}</p>
    </div>
  );
}

function ChangeOrderEditor({ project, changeOrder, nextNumber, onClose, onSaved }) {
  const readOnly = changeOrder && (changeOrder.status === "approved" || changeOrder.status === "sent");
  const [form, setForm] = useState(() => ({
    title: changeOrder?.title || "",
    requested_date: changeOrder?.requested_date || today(),
    description: changeOrder?.description || "",
    line_items: changeOrder?.line_items?.length ? changeOrder.line_items : [],
    amount: changeOrder?.amount ?? "",
    schedule_days: changeOrder?.schedule_days ?? 0,
    notes: changeOrder?.notes || "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const itemized = hasItems(form.line_items);
  const total = itemized ? itemsTotal(form.line_items) : Number(form.amount || 0);

  const setItem = (i, patch) => set({ line_items: form.line_items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)) });

  const save = async (andSend) => {
    if (!form.title.trim()) { alert("Give the change order a title."); return; }
    if (!form.description.trim()) { alert("Describe the change. This is what the customer signs."); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        requested_date: form.requested_date || today(),
        description: form.description.trim(),
        line_items: form.line_items
          .filter((li) => (li.description || "").trim() || Number(li.amount))
          .map((li) => ({ description: (li.description || "").trim(), amount: Number(li.amount) || 0 })),
        amount: total,
        schedule_days: parseInt(form.schedule_days, 10) || 0,
        notes: form.notes,
      };
      const saved = changeOrder?.id
        ? await base44.entities.ChangeOrder.update(changeOrder.id, payload)
        : await base44.entities.ChangeOrder.create({ ...payload, project_id: project.id, number: nextNumber, status: "draft" });
      onSaved(saved, andSend);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{changeOrder ? `CO-${changeOrder.number || ""} ${readOnly ? "" : "· Edit"}` : `New change order · CO-${nextNumber}`}</DialogTitle>
        </DialogHeader>
        {readOnly && (
          <p className="text-xs rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-600">
            {changeOrder.status === "approved" ? "Approved change orders can't be edited." : "This change order is out for signature. Void the envelope in DocuSign to edit it; it goes back to draft."}
          </p>
        )}
        <fieldset disabled={readOnly} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Add spa spillway lighting" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.requested_date} onChange={(e) => set({ requested_date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Description of change</Label>
            <Textarea rows={5} value={form.description} onChange={(e) => set({ description: e.target.value })}
              placeholder="What's being added, removed or changed. This fills {{change_order.description}} in the DocuSign document." />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items <span className="font-normal text-slate-400">(optional)</span></Label>
              <button type="button" onClick={() => set({ line_items: [...form.line_items, { description: "", amount: "" }] })} className="text-xs font-medium text-amber-700 hover:underline">+ Add line</button>
            </div>
            {form.line_items.map((li, i) => (
              <div key={i} className="flex gap-2">
                <Input className="flex-1" value={li.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Item" />
                <Input className="w-32" type="number" step="0.01" value={li.amount} onChange={(e) => setItem(i, { amount: e.target.value })} placeholder="Amount" />
                <button type="button" onClick={() => set({ line_items: form.line_items.filter((_, idx) => idx !== i) })} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Amount ($)</Label>
              {itemized ? (
                <p className="h-9 flex items-center text-sm font-semibold text-slate-900">{money(total)} <span className="ml-2 font-normal text-xs text-slate-400">total of line items</span></p>
              ) : (
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="Use a negative amount for a credit" />
              )}
            </div>
            <div>
              <Label>Schedule impact (workdays added)</Label>
              <Input type="number" value={form.schedule_days} onChange={(e) => set({ schedule_days: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Internal notes <span className="font-normal text-slate-400">(not on the document)</span></Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Button>
          {!readOnly && (
            <>
              <Button variant="outline" onClick={() => save(false)} disabled={saving}>Save draft</Button>
              <Button onClick={() => save(true)} disabled={saving} className="bg-slate-900 text-white">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Save & send for signature
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
