import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, FileText, AlertTriangle, CheckCircle2,
  Clock, DollarSign, TrendingDown, TrendingUp, ShieldCheck,
  ShieldAlert, Shield, ArrowDownRight, ArrowUpRight,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const COST_CODES = [
  "Site Work", "Concrete", "Masonry", "Steel / Structural",
  "Carpentry / Framing", "Roofing", "Waterproofing",
  "Doors & Windows", "Finishes / Drywall", "Flooring",
  "Painting", "Plumbing", "HVAC", "Electrical",
  "Insulation", "Landscaping", "Equipment Rental",
  "General Conditions", "Materials / Supply", "Other",
];

const AP_STATUS = {
  received:  { label: "Received",  class: "bg-slate-100 text-slate-600",   icon: Clock },
  approved:  { label: "Approved",  class: "bg-amber-100 text-amber-700",   icon: CheckCircle2 },
  paid:      { label: "Paid",      class: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  disputed:  { label: "Disputed",  class: "bg-rose-100 text-rose-700",     icon: AlertTriangle },
};

const LIEN_STATUS = {
  none:    { label: "No Waiver",      icon: ShieldAlert, class: "text-rose-500" },
  partial: { label: "Partial Waiver", icon: Shield,      class: "text-amber-500" },
  final:   { label: "Final Waiver",   icon: ShieldCheck, class: "text-emerald-600" },
};

const EMPTY_FORM = {
  vendor_name: "",
  invoice_number: "",
  cost_code: "",
  amount: "",
  due_date: "",
  paid_date: "",
  status: "received",
  lien_waiver_status: "none",
  lien_waiver_date: "",
  notes: "",
};

function fmt(n) {
  const num = Number(n) || 0;
  return num < 0
    ? `-$${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function today() {
  return new Date().toISOString().split("T")[0];
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProjectAccounting({ project }) {
  const [invoices, setInvoices] = useState([]);
  const [draws, setDraws] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [activeSection, setActiveSection] = useState("ap");

  useEffect(() => { load(); }, [project.id]);

  const load = async () => {
    setLoading(true);
    try {
      const [invData, drawData] = await Promise.all([
        base44.entities.SubInvoice.filter({ project_id: project.id }, "-created_at"),
        base44.entities.Draw.filter({ project_id: project.id }, "draw_number"),
      ]);
      setInvoices(invData);
      setDraws(drawData);
    } catch (e) {
      console.error("Accounting load failed", e);
    }
    setLoading(false);
  };

  const openDialog = (inv = null) => {
    if (inv) {
      setEditing(inv);
      setForm({
        vendor_name: inv.vendor_name || "",
        invoice_number: inv.invoice_number || "",
        cost_code: inv.cost_code || "",
        amount: inv.amount ?? "",
        due_date: inv.due_date || "",
        paid_date: inv.paid_date || "",
        status: inv.status || "received",
        lien_waiver_status: inv.lien_waiver_status || "none",
        lien_waiver_date: inv.lien_waiver_date || "",
        notes: inv.notes || "",
      });
    } else {
      setEditing(null);
      setForm(EMPTY_FORM);
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      project_id: project.id,
      vendor_name: form.vendor_name,
      invoice_number: form.invoice_number,
      cost_code: form.cost_code,
      amount: parseFloat(form.amount) || 0,
      due_date: form.due_date || null,
      paid_date: form.paid_date || null,
      status: form.status,
      lien_waiver_status: form.lien_waiver_status,
      lien_waiver_date: form.lien_waiver_date || null,
      notes: form.notes,
    };
    if (editing) {
      await base44.entities.SubInvoice.update(editing.id, payload);
    } else {
      await base44.entities.SubInvoice.create(payload);
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this invoice?")) {
      await base44.entities.SubInvoice.delete(id);
      load();
    }
  };

  // ── AP summary metrics ─────────────────────────────────────────────────────
  const totalAP = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const paidAP = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount || 0), 0);
  const outstandingAP = totalAP - paidAP;
  const disputedAP = invoices.filter(i => i.status === "disputed").reduce((s, i) => s + (i.amount || 0), 0);
  const noWaiverUnpaid = invoices.filter(i => i.status !== "paid" && i.lien_waiver_status === "none");
  const retainageHeld = draws.reduce((s, d) => s + (d.retainage_released ? 0 : (d.retainage_held || 0)), 0);

  // ── AP by trade ────────────────────────────────────────────────────────────
  const byTrade = useMemo(() => {
    const map = {};
    for (const inv of invoices) {
      const key = inv.cost_code || "Unassigned";
      if (!map[key]) map[key] = { budgeted: 0, actual: 0 };
      map[key].actual += inv.amount || 0;
    }
    return Object.entries(map).sort((a, b) => b[1].actual - a[1].actual);
  }, [invoices]);

  // ── Cash flow projection (60-day window) ──────────────────────────────────
  const cashProjection = useMemo(() => {
    const t = today();
    const horizon = addDays(t, 90);
    const events = [];

    // Inflows: draws that are approved/submitted and not yet paid
    for (const d of draws) {
      if (d.status === "paid") continue;
      const date = d.due_date;
      if (!date || date < t || date > horizon) continue;
      const net = (d.amount || 0) - (d.retainage_released ? 0 : (d.retainage_held || 0));
      events.push({ date, label: d.title || `Draw #${d.draw_number}`, amount: net, type: "inflow" });
    }

    // Outflows: sub invoices not yet paid with a due date
    for (const inv of invoices) {
      if (inv.status === "paid") continue;
      const date = inv.due_date;
      if (!date || date < t || date > horizon) continue;
      events.push({ date, label: `${inv.vendor_name || "Vendor"} – ${inv.cost_code || "AP"}`, amount: inv.amount || 0, type: "outflow" });
    }

    events.sort((a, b) => a.date.localeCompare(b.date));

    // Running net
    let running = 0;
    return events.map(ev => {
      running += ev.type === "inflow" ? ev.amount : -ev.amount;
      return { ...ev, running };
    });
  }, [draws, invoices]);

  const projectedInflows = cashProjection.filter(e => e.type === "inflow").reduce((s, e) => s + e.amount, 0);
  const projectedOutflows = cashProjection.filter(e => e.type === "outflow").reduce((s, e) => s + e.amount, 0);
  const netCashPosition = projectedInflows - projectedOutflows;

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: "ap", label: "Accounts Payable" },
          { key: "lien", label: "Lien Waivers" },
          { key: "cashflow", label: "Cash Flow Projection" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeSection === tab.key
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── AP Summary always visible ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total AP",         value: totalAP,        color: "text-slate-800" },
          { label: "Paid",             value: paidAP,         color: "text-emerald-600" },
          { label: "Outstanding",      value: outstandingAP,  color: "text-amber-600" },
          { label: "Disputed",         value: disputedAP,     color: disputedAP > 0 ? "text-rose-600" : "text-slate-400" },
          { label: "Retainage Held",   value: retainageHeld,  color: "text-orange-600" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">{kpi.label}</p>
            <p className={cn("text-xl font-bold", kpi.color)}>{fmt(kpi.value)}</p>
          </div>
        ))}
      </div>

      {/* ── Accounts Payable ──────────────────────────────────────────────── */}
      {activeSection === "ap" && (
        <div className="space-y-4">

          {/* Lien risk banner */}
          {noWaiverUnpaid.length > 0 && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <ShieldAlert className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <p className="text-sm text-rose-700 font-medium">
                {noWaiverUnpaid.length} unpaid invoice{noWaiverUnpaid.length > 1 ? "s" : ""} with no lien waiver — lien exposure risk.
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-800">Subcontractor & Supplier Invoices</h3>
                <p className="text-xs text-slate-400 mt-0.5">Tag every bill to a job + trade. Track lien waiver status before releasing payment.</p>
              </div>
              <Button size="sm" onClick={() => openDialog()} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                <Plus className="w-4 h-4 mr-1" /> Add Invoice
              </Button>
            </div>

            {invoices.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium text-slate-500">No AP invoices yet</p>
                <p className="text-sm mt-1">Add sub invoices and material bills to track job costs and lien exposure.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="text-left px-4 py-3">Vendor</th>
                      <th className="text-left px-4 py-3">Invoice #</th>
                      <th className="text-left px-4 py-3">Trade / Cost Code</th>
                      <th className="text-right px-4 py-3">Amount</th>
                      <th className="text-left px-4 py-3">Due</th>
                      <th className="text-center px-4 py-3">Status</th>
                      <th className="text-center px-4 py-3">Lien Waiver</th>
                      <th className="w-10 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => {
                      const apSt = AP_STATUS[inv.status] || AP_STATUS.received;
                      const ApIcon = apSt.icon;
                      const lienSt = LIEN_STATUS[inv.lien_waiver_status || "none"];
                      const LienIcon = lienSt.icon;
                      const isPaid = inv.status === "paid";
                      return (
                        <tr
                          key={inv.id}
                          className={cn("border-b border-slate-50 hover:bg-amber-50 cursor-pointer transition-colors", isPaid && "opacity-60")}
                          onClick={() => openDialog(inv)}
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">{inv.vendor_name || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{inv.invoice_number || "—"}</td>
                          <td className="px-4 py-3">
                            {inv.cost_code
                              ? <span className="inline-block bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{inv.cost_code}</span>
                              : <span className="text-slate-300 italic text-xs">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmt(inv.amount)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {inv.due_date
                              ? <span className={cn(inv.due_date < today() && !isPaid ? "text-rose-600 font-semibold" : "")}>{inv.due_date}</span>
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={cn("text-xs gap-1", apSt.class)}>
                              <ApIcon className="w-3 h-3" />
                              {apSt.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn("flex items-center justify-center gap-1 text-xs font-medium", lienSt.class)}>
                              <LienIcon className="w-3.5 h-3.5" />
                              {lienSt.label}
                            </span>
                          </td>
                          <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleDelete(inv.id)} className="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-sm">
                      <td colSpan={3} className="px-4 py-3 text-slate-700">Total</td>
                      <td className="px-4 py-3 text-right text-slate-900">{fmt(totalAP)}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* AP by trade */}
          {byTrade.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-4">AP by Trade</h3>
              <div className="space-y-2">
                {byTrade.map(([trade, { actual }]) => (
                  <div key={trade} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-40 truncate flex-shrink-0">{trade}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full"
                        style={{ width: `${totalAP > 0 ? Math.min(100, (actual / totalAP) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 w-24 text-right">{fmt(actual)}</span>
                    <span className="text-xs text-slate-400 w-10 text-right">
                      {totalAP > 0 ? `${((actual / totalAP) * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Lien Waivers ──────────────────────────────────────────────────── */}
      {activeSection === "lien" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Lien Waiver Tracker</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              In Texas, verify partial or final lien waivers before releasing payment to subs and suppliers.
            </p>
          </div>
          {invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Shield className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p>No invoices to track yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="text-left px-4 py-3">Vendor</th>
                    <th className="text-left px-4 py-3">Trade</th>
                    <th className="text-right px-4 py-3">Amount</th>
                    <th className="text-center px-4 py-3">Invoice Status</th>
                    <th className="text-center px-4 py-3">Lien Waiver</th>
                    <th className="text-left px-4 py-3">Waiver Date</th>
                    <th className="text-center px-4 py-3">Safe to Pay?</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const lienSt = LIEN_STATUS[inv.lien_waiver_status || "none"];
                    const LienIcon = lienSt.icon;
                    const isPaid = inv.status === "paid";
                    const safeToPay = isPaid || inv.lien_waiver_status === "final" || inv.lien_waiver_status === "partial";
                    return (
                      <tr
                        key={inv.id}
                        className={cn("border-b border-slate-50 hover:bg-amber-50 cursor-pointer", isPaid && "opacity-60")}
                        onClick={() => openDialog(inv)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-800">{inv.vendor_name || "—"}</td>
                        <td className="px-4 py-3">
                          {inv.cost_code
                            ? <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{inv.cost_code}</span>
                            : <span className="text-slate-300 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmt(inv.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={cn("text-xs", AP_STATUS[inv.status]?.class)}>
                            {AP_STATUS[inv.status]?.label || inv.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("flex items-center justify-center gap-1 text-xs font-medium", lienSt.class)}>
                            <LienIcon className="w-3.5 h-3.5" />
                            {lienSt.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{inv.lien_waiver_date || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {isPaid ? (
                            <span className="text-emerald-600 text-xs font-medium flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                            </span>
                          ) : safeToPay ? (
                            <span className="text-emerald-600 text-xs font-medium flex items-center justify-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> Yes
                            </span>
                          ) : (
                            <span className="text-rose-600 text-xs font-medium flex items-center justify-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" /> Waiver needed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Cash Flow Projection ──────────────────────────────────────────── */}
      {activeSection === "cashflow" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs text-emerald-600 mb-1">Expected Inflows (90 days)</p>
              <p className="text-xl font-bold text-emerald-700">{fmt(projectedInflows)}</p>
              <p className="text-xs text-slate-400 mt-1">Scheduled draws (net of retainage)</p>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
              <p className="text-xs text-rose-600 mb-1">Expected Outflows (90 days)</p>
              <p className="text-xl font-bold text-rose-700">{fmt(projectedOutflows)}</p>
              <p className="text-xs text-slate-400 mt-1">Sub invoices & bills due</p>
            </div>
            <div className={cn("border rounded-xl p-4", netCashPosition >= 0 ? "bg-slate-50 border-slate-200" : "bg-rose-50 border-rose-200")}>
              <p className="text-xs text-slate-500 mb-1">Net Cash Position</p>
              <p className={cn("text-xl font-bold", netCashPosition >= 0 ? "text-slate-800" : "text-rose-700")}>{fmt(netCashPosition)}</p>
              <p className="text-xs text-slate-400 mt-1">Inflows minus outflows</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">90-Day Cash Flow Timeline</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Expected inflows from approved draws · outflows from AP invoices due. Running balance shown per event.
              </p>
            </div>

            {cashProjection.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <DollarSign className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium text-slate-500">No upcoming cash events in 90 days</p>
                <p className="text-sm mt-1">Add draws with due dates and sub invoices to see projections.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Description</th>
                      <th className="text-center px-4 py-3">Type</th>
                      <th className="text-right px-4 py-3">Amount</th>
                      <th className="text-right px-4 py-3">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashProjection.map((ev, idx) => (
                      <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500 text-xs font-mono">{ev.date}</td>
                        <td className="px-4 py-3 text-slate-700">{ev.label}</td>
                        <td className="px-4 py-3 text-center">
                          {ev.type === "inflow" ? (
                            <span className="flex items-center justify-center gap-1 text-emerald-600 text-xs font-medium">
                              <ArrowDownRight className="w-3.5 h-3.5" /> Inflow
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-rose-600 text-xs font-medium">
                              <ArrowUpRight className="w-3.5 h-3.5" /> Outflow
                            </span>
                          )}
                        </td>
                        <td className={cn("px-4 py-3 text-right font-semibold", ev.type === "inflow" ? "text-emerald-700" : "text-rose-700")}>
                          {ev.type === "inflow" ? "+" : "−"}{fmt(ev.amount)}
                        </td>
                        <td className={cn("px-4 py-3 text-right font-bold", ev.running >= 0 ? "text-slate-800" : "text-rose-600")}>
                          {fmt(ev.running)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Invoice" : "Add Subcontractor / Supplier Invoice"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vendor Name *</Label>
                <Input
                  value={form.vendor_name}
                  onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                  placeholder="e.g. ABC Framing Co."
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Invoice #</Label>
                <Input
                  value={form.invoice_number}
                  onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                  placeholder="e.g. INV-2024-101"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label>Trade / Cost Code</Label>
              <Select value={form.cost_code || "__none__"} onValueChange={v => setForm(f => ({ ...f, cost_code: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select trade…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {COST_CODES.map(cc => <SelectItem key={cc} value={cc}>{cc}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount ($) *</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Paid Date</Label>
                <Input type="date" value={form.paid_date} onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))} className="mt-1.5" />
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
              <Label className="text-amber-800 font-semibold flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> Lien Waiver
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">Waiver Status</Label>
                  <Select value={form.lien_waiver_status} onValueChange={v => setForm(f => ({ ...f, lien_waiver_status: v }))}>
                    <SelectTrigger className="mt-1 bg-white border-amber-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Waiver</SelectItem>
                      <SelectItem value="partial">Partial Waiver Received</SelectItem>
                      <SelectItem value="final">Final Waiver Received</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Waiver Date</Label>
                  <Input
                    type="date"
                    value={form.lien_waiver_date}
                    onChange={e => setForm(f => ({ ...f, lien_waiver_date: e.target.value }))}
                    className="mt-1 bg-white border-amber-200"
                    disabled={form.lien_waiver_status === "none"}
                  />
                </div>
              </div>
              {form.lien_waiver_status === "none" && form.status !== "paid" && (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Lien exposure until waiver is received.
                </p>
              )}
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="mt-1.5" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                {editing ? "Save Changes" : "Add Invoice"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
