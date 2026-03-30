import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, ChevronDown, ChevronRight, Edit2, Check, X, Pencil } from "lucide-react";
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

function EditableCell({ value, onChange, type = "text", className }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");

  const commit = () => {
    setEditing(false);
    if (local !== value) onChange(type === "number" ? parseFloat(local) || 0 : local);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setLocal(value ?? ""); setEditing(false); } }}
        className={cn("w-full border border-amber-400 rounded px-2 py-1 text-sm outline-none bg-amber-50", className)}
      />
    );
  }

  return (
    <div
      className={cn("px-2 py-1 rounded cursor-text hover:bg-amber-50 text-sm min-h-[28px] flex items-center", className)}
      onClick={() => { setLocal(value ?? ""); setEditing(true); }}
    >
      {value !== "" && value !== null && value !== undefined ? (type === "number" ? fmt(value) : value) : <span className="text-slate-300 italic">—</span>}
    </div>
  );
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ProjectFinancials({ project, onUpdateProject }) {
  const [estimateImported, setEstimateImported] = useState(false);
  const [syncedBreakdownId, setSyncedBreakdownId] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // Load from AccuLynx-synced JobCostBreakdown entity if available
  useEffect(() => {
    const loadSyncedBreakdown = async () => {
      try {
        const results = await base44.entities.JobCostBreakdown.filter({ project_id: project.id });
        if (!results.length) return;
        const breakdown = results[0];
        if (breakdown.sections && breakdown.sections.length > 0) {
          setSections(breakdown.sections);
          setSyncedBreakdownId(breakdown.id);
          setLastSyncedAt(breakdown.last_synced_at);
          setEstimateImported(true);
        }
      } catch (e) {
        console.error("Failed to load synced breakdown", e);
      }
    };

    loadSyncedBreakdown();
  }, [project.id]);

  const contractTotal = project.contract_value || 0;
  const collected = project.billed_to_date || 0;
  const remainingToCollect = contractTotal - collected;
  const costsToDate = project.costs_to_date || 0;
  const originalCosts = project.original_costs || 0;
  const amendmentCosts = project.amendment_costs || 0;
  const totalBudgetedCost = originalCosts + amendmentCosts;
  const pctComplete = (project.percent_complete || 0) / 100;
  const costToComplete = pctComplete > 0 ? Math.max(0, totalBudgetedCost - costsToDate) : totalBudgetedCost;
  const projectedProfit = contractTotal - (costsToDate + costToComplete);

  const [kpiEditOpen, setKpiEditOpen] = useState(false);
  const [kpiForm, setKpiForm] = useState({});

  const openKpiEdit = () => {
    setKpiForm({
      contract_value: project.contract_value || 0,
      billed_to_date: project.billed_to_date || 0,
      costs_to_date: project.costs_to_date || 0,
      original_costs: project.original_costs || 0,
      amendment_costs: project.amendment_costs || 0,
      percent_complete: project.percent_complete || 0,
    });
    setKpiEditOpen(true);
  };

  const saveKpiEdit = async () => {
    await base44.entities.Project.update(project.id, {
      contract_value: parseFloat(kpiForm.contract_value) || 0,
      billed_to_date: parseFloat(kpiForm.billed_to_date) || 0,
      costs_to_date: parseFloat(kpiForm.costs_to_date) || 0,
      original_costs: parseFloat(kpiForm.original_costs) || 0,
      amendment_costs: parseFloat(kpiForm.amendment_costs) || 0,
      percent_complete: parseFloat(kpiForm.percent_complete) || 0,
      sync_locked: true,
    });
    setKpiEditOpen(false);
    if (onUpdateProject) onUpdateProject();
  };

  // Job breakdown state (populated from synced entity or defaults)
  const [sections, setSections] = useState([
    { id: newId(), name: "Labor", collapsed: false, items: [{ id: newId(), description: "General Labor", budgeted: 0, actual: 0, notes: "" }] },
    { id: newId(), name: "Materials", collapsed: false, items: [{ id: newId(), description: "Materials", budgeted: 0, actual: 0, notes: "" }] },
    { id: newId(), name: "Subcontractors", collapsed: false, items: [{ id: newId(), description: "Sub Work", budgeted: 0, actual: 0, notes: "" }] },
  ]);

  const persist = async (next) => {
    setSections(next);
    const nextBudgeted = next.reduce((sum, section) => sum + section.items.reduce((inner, item) => inner + (Number(item.budgeted) || 0), 0), 0);
    const nextActual = next.reduce((sum, section) => sum + section.items.reduce((inner, item) => inner + (Number(item.actual) || 0), 0), 0);
    await base44.entities.Project.update(project.id, {
      original_costs: nextBudgeted,
      costs_to_date: nextActual,
      sync_locked: true,
    });
    if (syncedBreakdownId) {
      try {
        await base44.entities.JobCostBreakdown.update(syncedBreakdownId, { sections: next });
      } catch (e) {
        console.error("Failed to save breakdown", e);
      }
    }
    if (onUpdateProject) onUpdateProject();
  };

  const updateSection = (sId, field, val) => {
    persist(sections.map(s => s.id === sId ? { ...s, [field]: val } : s));
  };

  const toggleSection = (sId) => {
    persist(sections.map(s => s.id === sId ? { ...s, collapsed: !s.collapsed } : s));
  };

  const addSection = () => {
    persist([...sections, { id: newId(), name: "New Section", collapsed: false, items: [{ id: newId(), description: "", budgeted: 0, actual: 0, notes: "" }] }]);
  };

  const deleteSection = (sId) => {
    persist(sections.filter(s => s.id !== sId));
  };

  const addItem = (sId) => {
    persist(sections.map(s => s.id === sId ? { ...s, items: [...s.items, { id: newId(), description: "", budgeted: 0, actual: 0, notes: "" }] } : s));
  };

  const updateItem = (sId, iId, field, val) => {
    persist(sections.map(s => s.id === sId ? { ...s, items: s.items.map(i => i.id === iId ? { ...i, [field]: val } : i) } : s));
  };

  const deleteItem = (sId, iId) => {
    persist(sections.map(s => s.id === sId ? { ...s, items: s.items.filter(i => i.id !== iId) } : s));
  };

  const totalBudgeted = sections.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (Number(i.budgeted) || 0), 0), 0);
  const totalActual = sections.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (Number(i.actual) || 0), 0), 0);
  const totalVariance = totalBudgeted - totalActual;

  const handleKpiInlineUpdate = async (field, value) => {
    await base44.entities.Project.update(project.id, {
      [field]: parseFloat(value) || 0,
      sync_locked: true,
    });
    if (onUpdateProject) onUpdateProject();
  };

  const kpis = [
    { label: "Contract Total", value: contractTotal, field: "contract_value", color: "text-slate-800", editable: true },
    { label: "Collected", value: collected, field: "billed_to_date", color: "text-emerald-600", editable: true },
    { label: "Costs to Date", value: costsToDate, field: "costs_to_date", color: "text-blue-600", editable: true },
    { label: "Remaining to Collect", value: remainingToCollect, color: remainingToCollect > 0 ? "text-amber-600" : "text-slate-500", editable: false },
    { label: "Projected Profit / Loss", value: projectedProfit, color: projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600", editable: false },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Summary Row */}
      <div className="relative">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm group/kpi">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">{kpi.label}</p>
              {kpi.editable ? (
                <div className="relative">
                  <EditableCell
                    value={kpi.value}
                    onChange={(v) => handleKpiInlineUpdate(kpi.field, v)}
                    type="number"
                    className={cn("text-xl font-bold w-full", kpi.color)}
                  />
                  <span className="absolute top-0 right-0 text-[9px] text-slate-300 group-hover/kpi:text-amber-400 transition-colors">✎</span>
                </div>
              ) : (
                <p className={cn("text-xl font-bold", kpi.color)}>{fmt(kpi.value)}</p>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={openKpiEdit}
          className="absolute top-2 right-2 flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm transition-colors"
        >
          <Pencil className="w-3 h-3" /> Edit Financials
        </button>
      </div>

      {/* KPI Edit Dialog */}
      <Dialog open={kpiEditOpen} onOpenChange={setKpiEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Financial Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Contract Value ($)</Label>
              <Input type="number" value={kpiForm.contract_value} onChange={e => setKpiForm(f => ({ ...f, contract_value: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>Collected / Billed to Date ($)</Label>
              <Input type="number" value={kpiForm.billed_to_date} onChange={e => setKpiForm(f => ({ ...f, billed_to_date: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>Costs to Date ($)</Label>
              <Input type="number" value={kpiForm.costs_to_date} onChange={e => setKpiForm(f => ({ ...f, costs_to_date: e.target.value }))} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Original Budget ($)</Label>
                <Input type="number" value={kpiForm.original_costs} onChange={e => setKpiForm(f => ({ ...f, original_costs: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Amendment Costs ($)</Label>
                <Input type="number" value={kpiForm.amendment_costs} onChange={e => setKpiForm(f => ({ ...f, amendment_costs: e.target.value }))} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>% Complete</Label>
              <Input type="number" min="0" max="100" value={kpiForm.percent_complete} onChange={e => setKpiForm(f => ({ ...f, percent_complete: e.target.value }))} className="mt-1.5" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setKpiEditOpen(false)}>Cancel</Button>
              <Button onClick={saveKpiEdit} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Job Breakdown */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Job Cost Breakdown</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any cell to edit. Budgeted values sync from AccuLynx.
              {lastSyncedAt && (
                <span className="ml-2 text-emerald-600 font-medium">
                  ✓ Synced from AccuLynx {new Date(lastSyncedAt).toLocaleDateString()}
                </span>
              )}
            </p>
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
                const secActual = section.items.reduce((a, i) => a + (Number(i.actual) || 0), 0);
                const secVariance = secBudgeted - secActual;
                return (
                  <>
                    {/* Section Header */}
                    <tr key={section.id} className="bg-slate-700 text-white group/sh">
                      <td className="px-4 py-2" colSpan={1}>
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleSection(section.id)} className="text-slate-300 hover:text-white">
                            {section.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <EditableCell
                            value={section.name}
                            onChange={v => updateSection(section.id, "name", v)}
                            className="text-white font-bold text-xs uppercase tracking-widest bg-transparent hover:bg-slate-600 w-full"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300 text-xs font-medium">{fmt(secBudgeted)}</td>
                      <td className="px-4 py-2 text-right text-slate-300 text-xs font-medium">{fmt(secActual)}</td>
                      <td className={cn("px-4 py-2 text-right text-xs font-medium", secVariance >= 0 ? "text-emerald-300" : "text-rose-300")}>{fmt(secVariance)}</td>
                      <td className="px-2 py-2">
                        <button
                          className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-rose-300 opacity-0 group-hover/sh:opacity-100 transition-opacity"
                          onClick={() => deleteSection(section.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>

                    {/* Items */}
                    {!section.collapsed && section.items.map(item => {
                      const variance = (Number(item.budgeted) || 0) - (Number(item.actual) || 0);
                      return (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 group/row">
                          <td className="px-4 py-1 pl-10">
                            <EditableCell value={item.description} onChange={v => updateItem(section.id, item.id, "description", v)} className="text-slate-700" />
                          </td>
                          <td className="px-4 py-1 text-right">
                            <EditableCell value={item.budgeted} onChange={v => updateItem(section.id, item.id, "budgeted", v)} type="number" className="text-slate-700 text-right justify-end" />
                          </td>
                          <td className="px-4 py-1 text-right">
                            <EditableCell value={item.actual} onChange={v => updateItem(section.id, item.id, "actual", v)} type="number" className="text-slate-700 text-right justify-end" />
                          </td>
                          <td className={cn("px-4 py-1 text-right text-sm font-medium", variance >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {fmt(variance)}
                          </td>
                          <td className="px-2 py-1">
                            <button
                              className="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500 opacity-0 group-hover/row:opacity-100 transition-opacity"
                              onClick={() => deleteItem(section.id, item.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Add row button */}
                    {!section.collapsed && (
                      <tr key={`add-${section.id}`}>
                        <td colSpan={5} className="px-4 py-1 pl-10">
                          <button
                            className="text-xs text-slate-400 hover:text-amber-600 flex items-center gap-1 py-1 hover:bg-amber-50 px-2 rounded transition-colors"
                            onClick={() => addItem(section.id)}
                          >
                            <Plus className="w-3 h-3" /> Add line item
                          </button>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}

              {/* Totals Row */}
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
    </div>
  );
}