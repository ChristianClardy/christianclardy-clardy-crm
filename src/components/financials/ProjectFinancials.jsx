import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check,
  Search, FileText, Link2, Link2Off, ExternalLink, RefreshCw,
  X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
    if (!open) return;
    setLoading(true);
    base44.entities.Estimate.list("-created_date", 500).then(all => {
      // Show estimates for this client (or all if no client), excluding already linked
      const filtered = all.filter(e =>
        !alreadyLinkedIds.includes(e.id) &&
        (!clientId || e.client_id === clientId)
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
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title or number…"
              className="text-sm bg-transparent outline-none w-full text-slate-700 placeholder:text-slate-400" />
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
          ) : shown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6 italic">
              {clientId ? "No unlinked estimates found for this client." : "No estimates found."}
            </p>
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
          <p className="text-xs text-slate-400 italic">
            {clientId ? "Showing estimates for this project's client." : "Showing all estimates — assign a client to the project to filter."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Build breakdown sections from an estimate's line items ────────────────────
function buildSectionsFromEstimate(estimate) {
  const items = Array.isArray(estimate.line_items) ? estimate.line_items : [];
  const sectionMargins = estimate.section_margins || {};

  // Normalize trade groups (combine "Masonry" + "Masonry Materials")
  const normKey = t => (t || "").replace(/\s+materials?$/i, "").trim().toLowerCase();
  const groupMap = {};
  for (const item of items) {
    const key = normKey(item.trade);
    if (!groupMap[key]) groupMap[key] = { displayName: item.trade, items: [] };
    if (item.sectionType !== "material") groupMap[key].displayName = item.trade;
    groupMap[key].items.push(item);
  }

  return Object.values(groupMap).map(({ displayName, items: tradeItems }) => {
    const secMargin = sectionMargins[displayName];
    const globalMargin = estimate.margin_override != null ? Number(estimate.margin_override) : 40;

    const budgeted = tradeItems.reduce((sum, item) => {
      const cost = Number(item.cost_per_unit) || 0;
      const qty  = Number(item.quantity) || 0;
      if (!cost) return sum;
      if (item.sell_override != null) return sum + (Number(item.sell_override) * qty);
      const mPct = item.margin_override != null ? Number(item.margin_override)
        : secMargin != null ? Number(secMargin) : globalMargin;
      const margin = Math.min(Math.max(mPct, 0), 99.9) / 100;
      return sum + (cost * qty) / (1 - margin);
    }, 0);

    return {
      id: newId(),
      name: displayName,
      collapsed: false,
      estimate_sourced: true,
      items: [{ id: newId(), description: `${displayName} (from estimate)`, budgeted: Math.round(budgeted * 100) / 100, actual: 0, notes: "" }],
    };
  }).filter(s => s.items[0].budgeted > 0);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectFinancials({ project, onUpdateProject }) {
  const navigate = useNavigate();
  const [syncedBreakdownId, setSyncedBreakdownId] = useState(null);
  const [linkedEstimates, setLinkedEstimates] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kpiEditOpen, setKpiEditOpen] = useState(false);
  const [kpiForm, setKpiForm] = useState({});

  const [sections, setSections] = useState([
    { id: newId(), name: "Labor",          collapsed: false, items: [{ id: newId(), description: "General Labor", budgeted: 0, actual: 0, notes: "" }] },
    { id: newId(), name: "Materials",      collapsed: false, items: [{ id: newId(), description: "Materials",     budgeted: 0, actual: 0, notes: "" }] },
    { id: newId(), name: "Subcontractors", collapsed: false, items: [{ id: newId(), description: "Sub Work",      budgeted: 0, actual: 0, notes: "" }] },
  ]);

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
      if (results.length && results[0].sections?.length) {
        setSections(results[0].sections);
        setSyncedBreakdownId(results[0].id);
      }

      // Load linked estimates
      const linkedIds = getLinkedIds();
      if (linkedIds.length) {
        const ests = await Promise.all(
          linkedIds.map(id => base44.entities.Estimate.get(id).catch(() => null))
        );
        setLinkedEstimates(ests.filter(Boolean));
      }
    })();
  }, [project.id]);

  const persist = useCallback(async (next) => {
    setSections(next);
    const nextBudgeted = next.reduce((s, sec) => s + sec.items.reduce((a, i) => a + (Number(i.budgeted) || 0), 0), 0);
    const nextActual   = next.reduce((s, sec) => s + sec.items.reduce((a, i) => a + (Number(i.actual)   || 0), 0), 0);
    await base44.entities.Project.update(project.id, {
      original_costs: nextBudgeted,
      costs_to_date: nextActual,
      sync_locked: true,
    });
    if (syncedBreakdownId) {
      await base44.entities.JobCostBreakdown.update(syncedBreakdownId, { sections: next }).catch(console.error);
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

    // Build new sections from estimate and append to existing
    const newSections = buildSectionsFromEstimate(est);
    const merged = [...sections, ...newSections];
    await persist(merged);

    // Set contract value from estimate total if not set
    if (!project.contract_value) {
      await base44.entities.Project.update(project.id, { contract_value: est.total || 0 });
      if (onUpdateProject) onUpdateProject();
    }
  };

  const handleUnlinkEstimate = async (estId) => {
    if (!confirm("Unlink this estimate? The budget sections it created will remain but can be manually deleted.")) return;
    const next = getLinkedIds().filter(id => id !== estId);
    await base44.entities.Project.update(project.id, { linked_estimate_ids: next });
    setLinkedEstimates(prev => prev.filter(e => e.id !== estId));
    if (onUpdateProject) onUpdateProject();
  };

  const handleResyncEstimate = async (est) => {
    const newSections = buildSectionsFromEstimate(est);
    // Replace sections that came from this estimate (by name match), keep manually added ones
    const sourcedNames = new Set(newSections.map(s => s.name));
    const kept = sections.filter(s => !s.estimate_sourced || !sourcedNames.has(s.name));
    await persist([...kept, ...newSections]);
  };

  // ── Section/item CRUD ───────────────────────────────────────────────────────
  const updateSection = (sId, field, val) => persist(sections.map(s => s.id === sId ? { ...s, [field]: val } : s));
  const toggleSection = (sId) => persist(sections.map(s => s.id === sId ? { ...s, collapsed: !s.collapsed } : s));
  const addSection    = () => persist([...sections, { id: newId(), name: "New Section", collapsed: false, items: [{ id: newId(), description: "", budgeted: 0, actual: 0, notes: "" }] }]);
  const deleteSection = (sId) => persist(sections.filter(s => s.id !== sId));
  const addItem       = (sId) => persist(sections.map(s => s.id === sId ? { ...s, items: [...s.items, { id: newId(), description: "", budgeted: 0, actual: 0, notes: "" }] } : s));
  const updateItem    = (sId, iId, field, val) => persist(sections.map(s => s.id === sId ? { ...s, items: s.items.map(i => i.id === iId ? { ...i, [field]: val } : i) } : s));
  const deleteItem    = (sId, iId) => persist(sections.map(s => s.id === sId ? { ...s, items: s.items.filter(i => i.id !== iId) } : s));

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const contractTotal = project.contract_value || 0;
  const collected     = project.billed_to_date || 0;
  const costsToDate   = project.costs_to_date  || 0;
  const totalBudgeted = sections.reduce((s, sec) => s + sec.items.reduce((a, i) => a + (Number(i.budgeted) || 0), 0), 0);
  const totalActual   = sections.reduce((s, sec) => s + sec.items.reduce((a, i) => a + (Number(i.actual)   || 0), 0), 0);
  const totalVariance = totalBudgeted - totalActual;
  const projectedProfit = contractTotal - totalActual;

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
    { label: "Projected Profit",      value: projectedProfit,   color: projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600", editable: false },
  ];

  return (
    <div className="space-y-6">
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
              {kpi.editable ? (
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

      {/* Job Cost Breakdown */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Job Cost Breakdown</h3>
            <p className="text-xs text-slate-400 mt-0.5">Click any cell to edit. Each linked estimate creates its own sections.</p>
          </div>
          <Button size="sm" variant="outline" onClick={addSection}>
            <Plus className="w-4 h-4 mr-1" /> Add Section
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-3 w-[40%]">Description</th>
                <th className="text-right px-4 py-3 w-[18%]">Budgeted</th>
                <th className="text-right px-4 py-3 w-[18%]">Actual</th>
                <th className="text-right px-4 py-3 w-[18%]">Variance</th>
                <th className="w-[6%] px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {sections.map(section => {
                const secBudgeted = section.items.reduce((a, i) => a + (Number(i.budgeted) || 0), 0);
                const secActual   = section.items.reduce((a, i) => a + (Number(i.actual)   || 0), 0);
                const secVariance = secBudgeted - secActual;
                return (
                  <>
                    <tr key={section.id} className="bg-slate-700 text-white group/sh">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleSection(section.id)} className="text-slate-300 hover:text-white">
                            {section.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <EditableCell value={section.name} onChange={v => updateSection(section.id, "name", v)} className="text-white font-bold text-xs uppercase tracking-widest bg-transparent hover:bg-slate-600 w-full" />
                          {section.estimate_sourced && <span className="text-[9px] font-semibold bg-amber-500/30 text-amber-300 px-1.5 rounded">from estimate</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300 text-xs font-medium">{fmt(secBudgeted)}</td>
                      <td className="px-4 py-2 text-right text-slate-300 text-xs font-medium">{fmt(secActual)}</td>
                      <td className={cn("px-4 py-2 text-right text-xs font-medium", secVariance >= 0 ? "text-emerald-300" : "text-rose-300")}>{fmt(secVariance)}</td>
                      <td className="px-2 py-2">
                        <button className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-rose-300 opacity-0 group-hover/sh:opacity-100 transition-opacity" onClick={() => deleteSection(section.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {!section.collapsed && section.items.map(item => {
                      const variance = (Number(item.budgeted) || 0) - (Number(item.actual) || 0);
                      return (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 group/row">
                          <td className="px-4 py-1 pl-10"><EditableCell value={item.description} onChange={v => updateItem(section.id, item.id, "description", v)} className="text-slate-700" /></td>
                          <td className="px-4 py-1 text-right"><EditableCell value={item.budgeted} onChange={v => updateItem(section.id, item.id, "budgeted", v)} type="number" className="text-slate-700 text-right justify-end" /></td>
                          <td className="px-4 py-1 text-right"><EditableCell value={item.actual} onChange={v => updateItem(section.id, item.id, "actual", v)} type="number" className="text-slate-700 text-right justify-end" /></td>
                          <td className={cn("px-4 py-1 text-right text-sm font-medium", variance >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmt(variance)}</td>
                          <td className="px-2 py-1">
                            <button className="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={() => deleteItem(section.id, item.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!section.collapsed && (
                      <tr key={`add-${section.id}`}>
                        <td colSpan={5} className="px-4 py-1 pl-10">
                          <button className="text-xs text-slate-400 hover:text-amber-600 flex items-center gap-1 py-1 hover:bg-amber-50 px-2 rounded transition-colors" onClick={() => addItem(section.id)}>
                            <Plus className="w-3 h-3" /> Add line item
                          </button>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-800 text-sm">TOTAL</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">{fmt(totalBudgeted)}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">{fmt(totalActual)}</td>
                <td className={cn("px-4 py-3 text-right font-bold", totalVariance >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmt(totalVariance)}</td>
                <td />
              </tr>
            </tbody>
          </table>
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
