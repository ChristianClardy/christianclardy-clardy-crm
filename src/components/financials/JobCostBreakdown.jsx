import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { sectionTotals, costEntries, sumCosts, isExtra, newId } from "@/lib/jobCostFromEstimate";

// Job Cost breakdown laid out like the estimate (EstimateDetail.jsx
// TradeSection): one card per section, material sections tinted sky, the same
// line items in the same order. The estimate's price columns are swapped for
// Est. Cost/Unit, Est. Total Cost, Actual Cost (editable) and Variance.
// Estimate lines are read-only except Actual; lines added here are editable.
// On a project with an estimate, anything added here is an Extra cost (not in
// the estimate). Actual Cost holds any number of cost entries (several
// invoices against one lump-sum line); the cell shows their total.

const fmt = (n) => {
  const v = Number(n) || 0;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const qtyFmt = (n) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function MoneyInput({ value, onCommit, className, placeholder = "0.00" }) {
  const [local, setLocal] = useState(null);
  const shown = local ?? (Number(value) ? String(value) : "");
  const commit = () => {
    if (local === null) return;
    const next = local.trim() === "" ? 0 : Number(local) || 0;
    setLocal(null);
    if (next !== (Number(value) || 0)) onCommit(next);
  };
  return (
    <input
      type="number"
      step="0.01"
      value={shown}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setLocal(null); e.currentTarget.blur(); } }}
      className={cn("w-full text-right text-sm bg-transparent border border-transparent rounded px-2 py-1 outline-none hover:border-slate-200 focus:border-amber-400 focus:bg-white placeholder:text-slate-300", className)}
    />
  );
}

function TextInput({ value, onCommit, className, placeholder }) {
  const [local, setLocal] = useState(null);
  const commit = () => { if (local !== null && local !== (value || "")) onCommit(local); setLocal(null); };
  return (
    <input
      value={local ?? (value || "")}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={cn("w-full text-sm bg-transparent border border-transparent rounded px-2 py-1 outline-none hover:border-slate-200 focus:border-amber-400 focus:bg-white placeholder:text-slate-300", className)}
    />
  );
}

function VarianceCell({ budgeted, actual, strong }) {
  const v = (Number(budgeted) || 0) - (Number(actual) || 0);
  if (!Number(actual) && !Number(budgeted)) return <span className="text-slate-300">—</span>;
  return <span className={cn(strong && "font-semibold", v < 0 ? "text-rose-600" : v > 0 ? "text-emerald-600" : "text-slate-500")}>{v < 0 ? `${fmt(-v)} over` : fmt(v)}</span>;
}

// Every cost entered against one line; the line's actual is their total.
function CostEntriesDialog({ item, onClose, onSave }) {
  const [rows, setRows] = useState(() => {
    const existing = costEntries(item).map((c) => ({ ...c, amount: String(c.amount ?? "") }));
    return [...existing, { id: newId(), amount: "", date: new Date().toLocaleDateString("en-CA"), note: "" }];
  });
  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => Number(r.amount));
  const total = sumCosts(filled);
  const budget = Number(item.budgeted) || 0;

  const save = () => {
    const costs = filled.map((r) => ({ id: r.id, amount: Math.round(Number(r.amount) * 100) / 100, date: r.date || "", note: (r.note || "").trim() }));
    onSave({ costs, actual: sumCosts(costs) });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Costs: {item.description || "Line item"}</DialogTitle></DialogHeader>
        {budget > 0 && <p className="text-sm text-slate-500 -mt-1">Estimated cost {fmt(budget)}</p>}
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
            <span className="col-span-3">Amount</span><span className="col-span-4">Date</span><span className="col-span-4">Vendor / invoice # / note</span>
          </div>
          {rows.map((r, idx) => (
            <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
              <input type="number" step="0.01" value={r.amount} autoFocus={idx === rows.length - 1} onChange={(e) => setRow(r.id, { amount: e.target.value })} placeholder="0.00"
                className="col-span-3 h-9 rounded-md border border-slate-200 px-2 text-sm text-right outline-none focus:ring-1 focus:ring-amber-400" />
              <input type="date" value={r.date || ""} onChange={(e) => setRow(r.id, { date: e.target.value })}
                className="col-span-4 h-9 rounded-md border border-slate-200 px-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
              <input value={r.note || ""} onChange={(e) => setRow(r.id, { note: e.target.value })} placeholder="e.g. Blue Paradise #1042"
                className="col-span-4 h-9 rounded-md border border-slate-200 px-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
              <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="col-span-1 p-1 text-slate-300 hover:text-rose-500" title="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((rs) => [...rs, { id: newId(), amount: "", date: new Date().toLocaleDateString("en-CA"), note: "" }])}
            className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
            <Plus className="w-3.5 h-3.5" /> Add another cost
          </button>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm flex justify-between">
          <span className="text-slate-600">{filled.length} cost{filled.length === 1 ? "" : "s"} · total</span>
          <span className={cn("font-semibold", budget > 0 && total > budget ? "text-rose-600" : "text-slate-900")}>
            {fmt(total)}{budget > 0 && <span className="ml-1 font-normal text-slate-500">({total > budget ? `${fmt(total - budget)} over` : `${fmt(budget - total)} left`})</span>}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="bg-slate-900 text-white">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CostCell({ item, over, tone, onEdit }) {
  const n = costEntries(item).length;
  return (
    <button type="button" onClick={onEdit} title="Add or edit costs"
      className="w-full flex items-center justify-end gap-1.5 rounded px-2 py-1 text-sm border border-transparent hover:border-slate-200 hover:bg-white">
      {n > 1 && <span className="text-[10px] font-semibold text-slate-400 rounded bg-slate-100 px-1">{n} costs</span>}
      {Number(item.actual)
        ? <span className={cn("font-semibold", over ? "text-rose-600" : tone)}>{fmt(item.actual)}</span>
        : <span className="text-slate-300 flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> Add cost</span>}
    </button>
  );
}

function SectionCard({ section, hasEstimate, estimateLabel, onToggle, onUpdateItem, onAddItem, onDeleteItem, onDeleteSection, onRename }) {
  const isMaterial = section.sectionType === "material";
  const t = sectionTotals(section, hasEstimate);
  const used = t.budgeted > 0 ? Math.min(100, (t.actual / t.budgeted) * 100) : 0;
  const custom = !section.estimate_sourced;
  const [costsFor, setCostsFor] = useState(null);

  return (
    <div className={cn("bg-white rounded-xl border overflow-hidden mb-3", isMaterial ? "border-sky-200" : "border-slate-200")}>
      <div className={cn("flex flex-wrap items-center justify-between gap-2 px-4 py-3 select-none border-b", isMaterial ? "bg-sky-50 border-sky-200" : "bg-slate-50 border-slate-200")}>
        <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          {section.collapsed
            ? <ChevronRight className={cn("w-4 h-4 shrink-0", isMaterial ? "text-sky-400" : "text-slate-400")} />
            : <ChevronDown className={cn("w-4 h-4 shrink-0", isMaterial ? "text-sky-400" : "text-slate-400")} />}
          {custom ? (
            <div onClick={(e) => e.stopPropagation()} className="min-w-0 flex-1 max-w-xs">
              <TextInput value={section.name} onCommit={onRename} className="font-semibold text-slate-800 px-1" />
            </div>
          ) : (
            <span className={cn("text-sm font-semibold truncate", isMaterial ? "text-sky-800" : "text-slate-800")}>{section.name}</span>
          )}
          {isMaterial && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-200 text-sky-700">Material</span>}
          {custom && (hasEstimate
            ? <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Extra costs</span>
            : <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Added</span>)}
          {estimateLabel && <span className="text-[10px] font-mono text-slate-400">{estimateLabel}</span>}
          <span className="text-xs text-slate-400 shrink-0">({section.items.length} item{section.items.length !== 1 ? "s" : ""})</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>Est. cost: <strong className="text-slate-700">{fmt(t.budgeted)}</strong></span>
          <span>Actual: <strong className={isMaterial ? "text-sky-700" : "text-amber-700"}>{fmt(t.actual)}</strong></span>
          {t.extra > 0 && !custom && <span className="text-rose-600">incl. {fmt(t.extra)} extra</span>}
          <span className="hidden sm:inline"><VarianceCell budgeted={t.budgeted} actual={t.actual} strong /></span>
          {custom && (
            <button onClick={onDeleteSection} title="Delete section" className="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {t.budgeted > 0 && (
        <div className="h-1 bg-slate-100">
          <div className={cn("h-full", t.actual > t.budgeted ? "bg-rose-400" : isMaterial ? "bg-sky-400" : "bg-amber-400")} style={{ width: `${t.actual > t.budgeted ? 100 : used}%` }} />
        </div>
      )}

      {!section.collapsed && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-left w-20">Unit</th>
                  <th className="px-2 py-2 text-right w-20">Qty</th>
                  <th className="px-2 py-2 text-right w-28">Est. Cost/Unit</th>
                  <th className="px-2 py-2 text-right w-32">Est. Total Cost</th>
                  <th className="px-2 py-2 text-right w-32">Actual Cost ✎</th>
                  <th className="px-2 py-2 text-right w-32">Variance</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {section.items.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-300">No items</td></tr>
                ) : section.items.map((item) => {
                  const fromEstimate = !!item.source_item_id;
                  const extra = isExtra(item, hasEstimate);
                  const isMatRow = item.sectionType === "material";
                  const over = extra ? Number(item.actual) > 0 : Number(item.actual) > Number(item.budgeted) && Number(item.budgeted) > 0;
                  return (
                    <tr key={item.id} className={cn("border-b border-slate-100 group", extra ? "bg-rose-50/40 hover:bg-rose-50" : isMatRow ? "bg-sky-50/40 hover:bg-sky-50" : "hover:bg-amber-50/20")}>
                      <td className="px-3 py-1.5 min-w-[200px]">
                        {fromEstimate ? (
                          <span className="text-sm text-slate-800 px-2">
                            {item.description || <span className="italic text-slate-300">No description</span>}
                            {item.removed_from_estimate && <span className="ml-1.5 text-[10px] font-semibold text-rose-500">removed from estimate</span>}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {extra && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Extra</span>}
                            <TextInput value={item.description} onCommit={(v) => onUpdateItem(item.id, { description: v })} placeholder={extra ? "What was the extra cost?" : "Describe the cost"} className="text-slate-800" />
                          </div>
                        )}
                      </td>
                      {extra ? (
                        <td colSpan={4} className="px-2 py-1.5 text-xs text-rose-500 text-right"><span className="px-2">Not in the estimate</span></td>
                      ) : (
                        <>
                          <td className="px-2 py-1.5 text-sm text-slate-500">
                            {fromEstimate ? <span className="px-2">{item.unit || "—"}</span> : <TextInput value={item.unit} onCommit={(v) => onUpdateItem(item.id, { unit: v })} placeholder="—" />}
                          </td>
                          <td className="px-2 py-1.5 text-right text-sm text-slate-600">
                            {fromEstimate ? <span className="px-2">{qtyFmt(item.quantity)}</span> : <MoneyInput value={item.quantity} placeholder="0" onCommit={(v) => onUpdateItem(item.id, { quantity: v, budgeted: Math.round(v * (Number(item.est_cost_per_unit) || 0) * 100) / 100 })} />}
                          </td>
                          <td className="px-2 py-1.5 text-right text-sm text-slate-600">
                            {fromEstimate ? <span className="px-2">{fmt(item.est_cost_per_unit)}</span> : <MoneyInput value={item.est_cost_per_unit} onCommit={(v) => onUpdateItem(item.id, { est_cost_per_unit: v, budgeted: Math.round(v * (Number(item.quantity) || 1) * 100) / 100, ...(Number(item.quantity) ? {} : { quantity: 1 }) })} />}
                          </td>
                          <td className="px-2 py-1.5 text-right text-sm font-medium text-slate-700"><span className="px-2">{fmt(item.budgeted)}</span></td>
                        </>
                      )}
                      <td className="px-2 py-1.5">
                        <CostCell item={item} over={over} tone={isMatRow ? "text-sky-700" : "text-amber-700"} onEdit={() => setCostsFor(item)} />
                      </td>
                      <td className="px-2 py-1.5 text-right text-sm"><span className="px-2">{extra ? (Number(item.actual) ? <span className="text-rose-600">{fmt(item.actual)} extra</span> : <span className="text-slate-300">—</span>) : <VarianceCell budgeted={item.budgeted} actual={item.actual} />}</span></td>
                      <td className="px-1 py-1.5">
                        {(!fromEstimate || item.removed_from_estimate) && (
                          <button onClick={() => onDeleteItem(item.id)} className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100" title="Remove line">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-100">
            <button onClick={onAddItem} className={cn("flex items-center gap-1.5 text-xs font-medium", hasEstimate ? "text-rose-600 hover:text-rose-700" : isMaterial ? "text-sky-600 hover:text-sky-700" : "text-amber-600 hover:text-amber-700")}>
              <Plus className="w-3.5 h-3.5" /> {hasEstimate ? "Add extra cost (not in the estimate)" : "Add cost line"}
            </button>
          </div>
        </>
      )}
      {costsFor && (
        <CostEntriesDialog
          item={section.items.find((i) => i.id === costsFor.id) || costsFor}
          onClose={() => setCostsFor(null)}
          onSave={(patch) => onUpdateItem(costsFor.id, patch)}
        />
      )}
    </div>
  );
}

export default function JobCostBreakdown({ sections, estimates = [], onChange }) {
  const hasEstimate = estimates.length > 0;
  const estLabel = (s) => (estimates.length > 1 && s.estimate_id ? estimates.find((e) => e.id === s.estimate_id)?.estimate_number || "" : "");
  const update = (sectionId, fn) => onChange(sections.map((s) => (s.id === sectionId ? fn(s) : s)));
  const totals = sections.reduce((acc, s) => {
    const t = sectionTotals(s, hasEstimate);
    return { budgeted: acc.budgeted + t.budgeted, actual: acc.actual + t.actual, extra: acc.extra + t.extra };
  }, { budgeted: 0, actual: 0, extra: 0 });
  const used = totals.budgeted > 0 ? (totals.actual / totals.budgeted) * 100 : 0;

  return (
    <div className="space-y-1">
      {sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          hasEstimate={hasEstimate}
          estimateLabel={estLabel(section)}
          onToggle={() => update(section.id, (s) => ({ ...s, collapsed: !s.collapsed }))}
          onRename={(name) => update(section.id, (s) => ({ ...s, name }))}
          onUpdateItem={(itemId, patch) => update(section.id, (s) => ({ ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }))}
          onAddItem={() => update(section.id, (s) => ({ ...s, collapsed: false, items: [...s.items, { id: newId(), description: "", unit: "", quantity: 0, est_cost_per_unit: 0, budgeted: 0, actual: 0, costs: [], notes: "" }] }))}
          onDeleteItem={(itemId) => update(section.id, (s) => ({ ...s, items: s.items.filter((i) => i.id !== itemId) }))}
          onDeleteSection={() => { if (confirm(`Delete the "${section.name}" section and its lines?`)) onChange(sections.filter((s) => s.id !== section.id)); }}
        />
      ))}

      <button
        onClick={() => onChange([...sections, { id: Math.random().toString(36).slice(2, 10), name: "New section", sectionType: "trade", estimate_sourced: false, collapsed: false, items: [{ id: Math.random().toString(36).slice(2, 10), description: "", unit: "", quantity: 0, est_cost_per_unit: 0, budgeted: 0, actual: 0, notes: "" }] }])}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
      >
        <Plus className="w-4 h-4" /> {hasEstimate ? "Add extra cost section (not in the estimate)" : "Add section"}
      </button>

      <div className="mt-3 rounded-xl border-2 border-slate-300 bg-slate-50 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        <div><p className="text-xs text-slate-500">Estimated cost</p><p className="font-bold text-slate-900">{fmt(totals.budgeted)}</p></div>
        <div><p className="text-xs text-slate-500">Actual on estimate items</p><p className="font-bold text-amber-700">{fmt(totals.actual - totals.extra)}</p></div>
        <div><p className="text-xs text-slate-500">Extra costs (not in estimate)</p><p className={cn("font-bold", totals.extra > 0 ? "text-rose-600" : "text-slate-400")}>{fmt(totals.extra)}</p></div>
        <div><p className="text-xs text-slate-500">Total actual cost</p><p className="font-bold text-slate-900">{fmt(totals.actual)}</p></div>
        <div><p className="text-xs text-slate-500">Variance</p><p className="font-bold"><VarianceCell budgeted={totals.budgeted} actual={totals.actual} strong /></p></div>
        <div><p className="text-xs text-slate-500">Budget used</p><p className={cn("font-bold", used > 100 ? "text-rose-600" : "text-slate-900")}>{used.toFixed(1)}%</p></div>
      </div>
    </div>
  );
}
