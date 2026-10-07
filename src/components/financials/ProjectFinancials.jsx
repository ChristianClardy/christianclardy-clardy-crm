import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus, Pencil, Check,
  Search, FileText, Link2, Link2Off, ExternalLink, RefreshCw,
  X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import QbJobActuals from "@/components/quickbooks/QbJobActuals";
import { projectedProfit as profitFor, PROFIT_BASIS_LABEL, approvedChangeOrderTotals } from "@/lib/projectProfit";
import ProjectedProfitDialog from "@/components/financials/ProjectedProfitDialog";
import JobCostBreakdown from "@/components/financials/JobCostBreakdown";
import { sectionsFromEstimate, rebuildFromEstimates, isLegacyBreakdown } from "@/lib/jobCostFromEstimate";
import { mergeApInvoices } from "@/lib/apJobCost";
import { confirmAction } from "@/components/ui/confirm-dialog";

function fmt(n) {
  const num = Number(n) || 0;
  return num < 0
    ? `-$${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function newId() { return Math.random().toString(36).slice(2, 10); }

function EditableCell({ value, onChange, type = "text", className }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");
  const commit = () => {
    setEditing(false);
    if (local !== value) onChange(type === "number" ? parseFloat(local) || 0 : local);
  };
  if (editing) {
    return (
      <input autoFocus type={type} value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setLocal(value ?? ""); setEditing(false); } }}
        className={cn("w-full border border-amber-400 rounded px-2 py-1 text-sm outline-none bg-amber-50", className)}
      />
    );
  }
  return (
    <div className={cn("px-2 py-1 rounded cursor-text hover:bg-amber-50 text-sm min-h-[28px] flex items-center", className)}
      onClick={() => { setLocal(value ?? ""); setEditing(true); }}>
      {value !== "" && value !== null && value !== undefined
        ? (type === "number" ? fmt(value) : value)
        : <span className="text-slate-300 italic">—</span>}
    </div>
  );
}

// ── Estimate picker dialog ────────────────────────────────────────────────────
function EstimatePickerDialog({ open, onClose, clientId, alreadyLinkedIds, onLink }) {
  const [estimates, setEstimates] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !clientId) return;
    setLoading(true);
    base44.entities.Estimate.list("-created_date", 500).then(all => {
      const filtered = all.filter(e =>
        e.client_id === clientId && !alreadyLinkedIds.includes(e.id)
      );
      setEstimates(filtered);
      setLoading(false);
    });
  }, [open, clientId]);

  const q = search.toLowerCase();
  const shown = estimates.filter(e =>
    !q || (e.title || "").toLowerCase().includes(q) || (e.estimate_number || "").toLowerCase().includes(q)
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-amber-600" /> Link Estimate to Project
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!clientId ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-slate-600">No client assigned to this project.</p>
              <p className="text-xs text-slate-400 mt-1">Assign a client on the Overview tab first, then link estimates here.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by title or number…"
                  className="text-sm bg-transparent outline-none w-full text-slate-700 placeholder:text-slate-400" />
              </div>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
              ) : shown.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6 italic">No unlinked estimates found for this client.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-1">
                  {shown.map(e => (
                    <button key={e.id} onClick={() => { onLink(e); onClose(); }}
                      className="w-full text-left px-3 py-3 rounded-lg hover:bg-amber-50 transition-colors group">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-400">{e.estimate_number || "—"}</span>
                            {e.is_locked && <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 rounded-full">Signed</span>}
                            {e.amendment_of && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 rounded-full">AMD</span>}
                          </div>
                          <p className="text-sm font-medium text-slate-800 mt-0.5 truncate">{e.title}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-slate-900">{fmt(e.total || 0)}</p>
                          <p className="text-xs text-slate-400 capitalize">{e.status || "draft"}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 italic">Showing estimates for this project's client only.</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectFinancials({ project, onUpdateProject }) {
  const navigate = useNavigate();
  const [syncedBreakdownId, setSyncedBreakdownId] = useState(null);
  const apInvoicesRef = useRef([]);
  const [linkedEstimates, setLinkedEstimates] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kpiEditOpen, setKpiEditOpen] = useState(false);
  const [kpiForm, setKpiForm] = useState({});

  // With no estimate linked, start from simple sections to fill in by hand.
  const [sections, setSections] = useState(() => ["Labor", "Materials", "Subcontractors"].map((name) => ({
    id: newId(), name, sectionType: "trade", estimate_sourced: false, collapsed: false,
    items: [{ id: newId(), description: "", unit: "", quantity: 0, est_cost_per_unit: 0, budgeted: 0, actual: 0, notes: "" }],
  })));

  // Safely parse linked_estimate_ids — Supabase JSONB may return string or array
  const getLinkedIds = () => {
    const raw = project.linked_estimate_ids;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  };

  // Load job cost breakdown + linked estimates
  useEffect(() => {
    (async () => {
      // Load breakdown
      const results = await base44.entities.JobCostBreakdown.filter({ project_id: project.id }).catch(() => []);
      const saved = results.length && results[0].sections?.length ? results[0] : null;
      if (saved) {
        setSections(saved.sections);
        setSyncedBreakdownId(saved.id);
      }

      // Load linked estimates
      const linkedIds = getLinkedIds();
      const ests = linkedIds.length
        ? (await Promise.all(linkedIds.map(id => base44.entities.Estimate.get(id).catch(() => null)))).filter(Boolean)
        : [];
      setLinkedEstimates(ests);

      // AP & Cash invoices feed actual costs (src/lib/apJobCost.js).
      const invoices = await base44.entities.SubInvoice.filter({ project_id: project.id }).catch(() => []);
      apInvoicesRef.current = invoices;

      // Mirror the estimate line by line: build it the first time, and convert
      // the old one-line-per-trade breakdown (actual costs are carried over).
      if (ests.length && (!saved || isLegacyBreakdown(saved.sections))) {
        await persist(rebuildFromEstimates(ests, saved?.sections || []), saved?.id || null);
      } else if (saved && JSON.stringify(mergeApInvoices(saved.sections, invoices)) !== JSON.stringify(saved.sections)) {
        await persist(saved.sections, saved.id);
      }
    })();
  }, [project.id]);

  // Every save re-applies the AP invoices, so their cost entries always match.
  const persist = useCallback(async (input, breakdownId = syncedBreakdownId) => {
    const next = mergeApInvoices(input, apInvoicesRef.current);
    setSections(next);
    const nextBudgeted = next.reduce((s, sec) => s + sec.items.reduce((a, i) => a + (Number(i.budgeted) || 0), 0), 0);
    const nextActual   = next.reduce((s, sec) => s + sec.items.reduce((a, i) => a + (Number(i.actual)   || 0), 0), 0);
    await base44.entities.Project.update(project.id, {
      original_costs: nextBudgeted,
      costs_to_date: nextActual,
      sync_locked: true,
    });
    if (breakdownId) {
      await base44.entities.JobCostBreakdown.update(breakdownId, { sections: next }).catch(console.error);
    } else {
      const created = await base44.entities.JobCostBreakdown.create({ project_id: project.id, sections: next });
      setSyncedBreakdownId(created.id);
    }
    if (onUpdateProject) onUpdateProject();
  }, [project.id, syncedBreakdownId, onUpdateProject]);

  // ── Estimate link/unlink ────────────────────────────────────────────────────
  const handleLinkEstimate = async (est) => {
    const current = getLinkedIds();
    if (current.includes(est.id)) return;
    const next = [...current, est.id];
    await base44.entities.Project.update(project.id, { linked_estimate_ids: next });
    setLinkedEstimates(prev => [...prev, est]);

    // Add the estimate's sections, line by line (replaces untouched starter sections).
    const isBlankStarter = (sec) => !sec.estimate_sourced && sec.items.every(i => !Number(i.budgeted) && !Number(i.actual) && !(i.description || "").trim());
    const kept = sections.filter(sec => sec.estimate_id !== est.id && !isBlankStarter(sec));
    await persist([...kept.filter(sec => sec.estimate_id), ...sectionsFromEstimate(est, sections), ...kept.filter(sec => !sec.estimate_id)]);

    // Set contract value from estimate total if not set
    if (!project.contract_value) {
      await base44.entities.Project.update(project.id, { contract_value: est.total || 0 });
      if (onUpdateProject) onUpdateProject();
    }
  };

  const handleUnlinkEstimate = async (estId) => {
    if (!await confirmAction("Unlink this estimate? The budget sections it created will remain but can be manually deleted.")) return;
    const next = getLinkedIds().filter(id => id !== estId);
    await base44.entities.Project.update(project.id, { linked_estimate_ids: next });
    setLinkedEstimates(prev => prev.filter(e => e.id !== estId));
    if (onUpdateProject) onUpdateProject();
  };

  // An AP invoice from the "not assigned" section, assigned to a line here.
  const assignApInvoice = async (invoiceId, itemId) => {
    await base44.entities.SubInvoice.update(invoiceId, { job_cost_item_id: itemId || null });
    apInvoicesRef.current = await base44.entities.SubInvoice.filter({ project_id: project.id }).catch(() => apInvoicesRef.current);
    await persist(sections);
  };

  // Pull the estimate's current lines in, keeping actual costs already entered.
  const handleResyncEstimate = async (est) => {
    const fresh = await base44.entities.Estimate.get(est.id).catch(() => est);
    const rebuilt = sectionsFromEstimate(fresh, sections);
    const at = sections.findIndex(sec => sec.estimate_id === est.id);
    const others = sections.filter(sec => sec.estimate_id !== est.id && !(sec.estimate_sourced && !sec.estimate_id));
    const insertAt = at === -1 ? others.filter(sec => sec.estimate_id).length : Math.min(at, others.length);
    await persist([...others.slice(0, insertAt), ...rebuilt, ...others.slice(insertAt)]);
  };

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const contractTotal = project.contract_value || 0;
  const collected     = project.billed_to_date || 0;
  const costsToDate   = project.costs_to_date  || 0;
  // Approved change orders count toward the 30% projected profit.
  const [profitOpen, setProfitOpen] = useState(false);
  const [approvedCoTotal, setApprovedCoTotal] = useState(0);
  useEffect(() => {
    base44.entities.ChangeOrder.filter({ project_id: project.id })
      .then((cos) => setApprovedCoTotal(approvedChangeOrderTotals(cos)[project.id] || 0))
      .catch(() => setApprovedCoTotal(0));
  }, [project.id, project.updated_at]);
  // Builder fee, else 30% of contract + approved change orders, unless overridden (src/lib/projectProfit.js).
  const profit = profitFor({ ...project, approved_change_orders_total: approvedCoTotal });
  const projectedProfit = profit.amount;

  const openKpiEdit = () => {
    setKpiForm({
      contract_value:  project.contract_value  || 0,
      billed_to_date:  project.billed_to_date  || 0,
      costs_to_date:   project.costs_to_date   || 0,
      original_costs:  project.original_costs  || 0,
      amendment_costs: project.amendment_costs || 0,
      percent_complete: project.percent_complete || 0,
    });
    setKpiEditOpen(true);
  };

  const saveKpiEdit = async () => {
    await base44.entities.Project.update(project.id, {
      contract_value:  parseFloat(kpiForm.contract_value)  || 0,
      billed_to_date:  parseFloat(kpiForm.billed_to_date)  || 0,
      costs_to_date:   parseFloat(kpiForm.costs_to_date)   || 0,
      original_costs:  parseFloat(kpiForm.original_costs)  || 0,
      amendment_costs: parseFloat(kpiForm.amendment_costs) || 0,
      percent_complete: parseFloat(kpiForm.percent_complete) || 0,
      sync_locked: true,
    });
    setKpiEditOpen(false);
    if (onUpdateProject) onUpdateProject();
  };

  const handleKpiInlineUpdate = async (field, value) => {
    await base44.entities.Project.update(project.id, { [field]: parseFloat(value) || 0, sync_locked: true });
    if (onUpdateProject) onUpdateProject();
  };


  const kpis = [
    { label: "Contract Total",        value: contractTotal,     field: "contract_value", color: "text-slate-800",    editable: true },
    { label: "Collected",             value: collected,         field: "billed_to_date", color: "text-emerald-600",  editable: true },
    { label: "Costs to Date",         value: costsToDate,       field: "costs_to_date",  color: "text-blue-600",     editable: true },
    { label: "Remaining to Collect",  value: contractTotal - collected, color: (contractTotal - collected) > 0 ? "text-amber-600" : "text-slate-500", editable: false },
    { label: "Projected Profit",      value: projectedProfit,   color: projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600", profit: true },
  ];

  return (
    <div className="space-y-6">
      <QbJobActuals projectId={project.id} contractValue={project.contract_value || 0} />

      {/* Linked Estimates Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Linked Estimates</h3>
            <p className="text-xs text-slate-400 mt-0.5">Estimates linked here auto-build the budget below.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Link Estimate
          </Button>
        </div>

        {linkedEstimates.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No estimates linked</p>
            <p className="text-xs text-slate-400 mt-1">Link an estimate to auto-populate the budget breakdown.</p>
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="mt-3 gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Search &amp; Link Estimate
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {linkedEstimates.map(est => (
              <div key={est.id} className="px-5 py-3 flex items-center gap-3">
                <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-400">{est.estimate_number || "—"}</span>
                    {est.is_locked && <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 rounded-full">Signed</span>}
                    {est.amendment_of && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 rounded-full">AMD</span>}
                  </div>
                  <p className="text-sm font-medium text-slate-800 truncate">{est.title}</p>
                </div>
                <p className="text-sm font-bold text-slate-700 shrink-0">{fmt(est.total || 0)}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => navigate(createPageUrl(`EstimateDetail?id=${est.id}`))}
                    title="View estimate"
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-amber-600"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleResyncEstimate(est)}
                    title="Re-sync budget from estimate"
                    className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleUnlinkEstimate(est.id)}
                    title="Unlink estimate"
                    className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-500"
                  >
                    <Link2Off className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {/* Combined total if multiple */}
            {linkedEstimates.length > 1 && (
              <div className="px-5 py-2 bg-slate-50 flex justify-between text-sm">
                <span className="font-semibold text-slate-600">Combined Estimate Total</span>
                <span className="font-bold text-slate-900">
                  {fmt(linkedEstimates.reduce((s, e) => s + (Number(e.total) || 0), 0))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI Summary */}
      <div className="relative">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm group/kpi">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">{kpi.label}</p>
              {kpi.profit ? (
                <div>
                  <p className={cn("text-xl font-bold px-2 py-1", kpi.color)}>{fmt(kpi.value)}</p>
                  <p className="text-[11px] text-slate-400 px-2">{PROFIT_BASIS_LABEL[profit.basis]} · {profit.margin.toFixed(1)}% margin</p>
                  <button type="button" onClick={() => setProfitOpen(true)} className="mt-1.5 ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:border-amber-300 hover:text-amber-700">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
              ) : kpi.editable ? (
                <div className="relative">
                  <EditableCell value={kpi.value} onChange={v => handleKpiInlineUpdate(kpi.field, v)} type="number" className={cn("text-xl font-bold w-full", kpi.color)} />
                  <span className="absolute top-0 right-0 text-[9px] text-slate-300 group-hover/kpi:text-amber-400 transition-colors">✎</span>
                </div>
              ) : (
                <p className={cn("text-xl font-bold", kpi.color)}>{fmt(kpi.value)}</p>
              )}
            </div>
          ))}
        </div>
        <button onClick={openKpiEdit} className="absolute top-2 right-2 flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm transition-colors">
          <Pencil className="w-3 h-3" /> Edit Financials
        </button>
      </div>

      <ProjectedProfitDialog project={{ ...project, approved_change_orders_total: approvedCoTotal }} open={profitOpen} onClose={() => setProfitOpen(false)} onSaved={onUpdateProject} />

      {/* KPI Edit Dialog */}
      <Dialog open={kpiEditOpen} onOpenChange={setKpiEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Financial Data</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              { label: "Contract Value ($)", key: "contract_value" },
              { label: "Collected / Billed to Date ($)", key: "billed_to_date" },
              { label: "Costs to Date ($)", key: "costs_to_date" },
            ].map(({ label, key }) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input type="number" value={kpiForm[key]} onChange={e => setKpiForm(f => ({ ...f, [key]: e.target.value }))} className="mt-1.5" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Original Budget ($)</Label><Input type="number" value={kpiForm.original_costs} onChange={e => setKpiForm(f => ({ ...f, original_costs: e.target.value }))} className="mt-1.5" /></div>
              <div><Label>Amendment Costs ($)</Label><Input type="number" value={kpiForm.amendment_costs} onChange={e => setKpiForm(f => ({ ...f, amendment_costs: e.target.value }))} className="mt-1.5" /></div>
            </div>
            <div><Label>% Complete</Label><Input type="number" min="0" max="100" value={kpiForm.percent_complete} onChange={e => setKpiForm(f => ({ ...f, percent_complete: e.target.value }))} className="mt-1.5" /></div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setKpiEditOpen(false)}>Cancel</Button>
              <Button onClick={saveKpiEdit} className="bg-gradient-to-r from-amber-500 to-orange-500">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Job Cost Breakdown: laid out like the estimate */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">Job Cost Breakdown</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {linkedEstimates.length
              ? "Same sections and line items as the linked estimate. Estimated cost is the estimate's cost (not the price); enter actual costs as they come in. Use the ↻ on an estimate above to pull in changes."
              : "Link an estimate above to lay this out like the estimate, or enter costs by hand."}
          </p>
        </div>
        <div className="p-4">
          <JobCostBreakdown sections={sections} estimates={linkedEstimates} onChange={persist} onAssignApInvoice={assignApInvoice} />
        </div>
      </div>

      {/* Estimate Picker */}
      <EstimatePickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        clientId={project.client_id || null}
        alreadyLinkedIds={linkedEstimates.map(e => e.id)}
        onLink={handleLinkEstimate}
      />
    </div>
  );
}
