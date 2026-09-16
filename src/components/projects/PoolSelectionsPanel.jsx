import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Save, TrendingUp, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Stock rows — the contract's own line items, pre-labeled so the form
// starts matching the document instead of blank. Manufacturer/model/color/$
// stay editable per project.
const DEFAULT_EQUIPMENT_LABELS = [
  "Pump", "Filter", "Heater", "Automation", "Chlorination/Salt System", "Pool Cleaner", "Lights", "Other",
];
const DEFAULT_FINISH_LABELS = [
  "Interior Finish", "Waterline Tile", "Decorative Tile", "Coping", "Decking", "Other",
];
const DEFAULT_ALLOWANCE_LABELS = [
  "Tile", "Coping", "Interior Finish", "Decking", "Landscaping", "Other",
];
const DEFAULT_PAYMENT_MILESTONES = [
  "Contract execution", "Excavation completed", "Steel completed and inspected",
  "Plumbing completed and pressure tested", "Gunite/shotcrete completed",
  "Tile/coping completed", "Decking completed", "Equipment installed and operational",
  "Interior finish completed", "Final completion/punch list",
];

const rid = () => Math.random().toString(36).slice(2, 10);

const defaultEquipmentRows = () => DEFAULT_EQUIPMENT_LABELS.map((equipment) => ({ id: rid(), equipment, manufacturer: "", model: "", warranty: "" }));
const defaultFinishRows = () => DEFAULT_FINISH_LABELS.map((item) => ({ id: rid(), item, manufacturer_product: "", color_finish: "" }));
const defaultAllowanceRows = () => DEFAULT_ALLOWANCE_LABELS.map((item) => ({ id: rid(), item, amount: "" }));
const defaultPaymentRows = () => DEFAULT_PAYMENT_MILESTONES.map((milestone) => ({ id: rid(), milestone, amount: "" }));

const emptyForm = (projectId) => ({
  id: null,
  project_id: projectId,
  equipment: defaultEquipmentRows(),
  finishes: defaultFinishRows(),
  allowances: defaultAllowanceRows(),
  payment_schedule: defaultPaymentRows(),
  water_features: "",
  other_improvements: "",
  notes: "",
});

function formatMoney(n) {
  return `$${(Number(n) || 0).toLocaleString()}`;
}

// ─── Shared row shell — label column stays plain text (matches the fixed
// item name on the contract), the rest are editable inputs.
function Row({ children }) {
  return <div className="grid grid-cols-12 items-center gap-2 py-1.5">{children}</div>;
}

export default function PoolSelectionsPanel({ project }) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(() => emptyForm(project.id));
  const [draws, setDraws] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [allowanceTemplateDialogOpen, setAllowanceTemplateDialogOpen] = useState(false);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [selectedAllowanceTemplateId, setSelectedAllowanceTemplateId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rows, drawData] = await Promise.all([
          base44.entities.PoolSelection.filter({ project_id: project.id }),
          base44.entities.Draw.filter({ project_id: project.id }, "draw_number"),
        ]);
        const existing = rows?.[0] || null;
        if (cancelled) return;
        setDraws(drawData || []);
        setForm(existing ? {
          id: existing.id,
          project_id: project.id,
          equipment: existing.equipment?.length ? existing.equipment : defaultEquipmentRows(),
          finishes: existing.finishes?.length ? existing.finishes : defaultFinishRows(),
          allowances: existing.allowances?.length ? existing.allowances : defaultAllowanceRows(),
          payment_schedule: existing.payment_schedule?.length ? existing.payment_schedule : defaultPaymentRows(),
          water_features: existing.water_features || "",
          other_improvements: existing.other_improvements || "",
          notes: existing.notes || "",
        } : emptyForm(project.id));
      } catch (err) {
        console.error("Failed to load pool selections:", err?.message);
        if (!cancelled) setForm(emptyForm(project.id));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  const updateRow = (field, id, patch) =>
    setForm((f) => ({ ...f, [field]: f[field].map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addRow = (field, factory) =>
    setForm((f) => ({ ...f, [field]: [...f[field], factory()] }));
  const removeRow = (field, id) =>
    setForm((f) => ({ ...f, [field]: f[field].filter((r) => r.id !== id) }));

  const allowancesTotal = form.allowances.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const paymentTotal = form.payment_schedule.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const contractValue = Number(project?.contract_value) || 0;

  const openAllowanceTemplateDialog = async () => {
    let q = supabase.from("allowances_templates").select("*").order("name");
    if (project?.company_id) q = q.eq("company_id", project.company_id);
    const { data } = await q;
    setAllowanceTemplates(data || []);
    setSelectedAllowanceTemplateId(null);
    setAllowanceTemplateDialogOpen(true);
  };

  const applyAllowanceTemplate = () => {
    const tmpl = allowanceTemplates.find((t) => t.id === selectedAllowanceTemplateId);
    if (!tmpl?.items?.length) return;
    const newRows = tmpl.items.map((it) => ({ id: rid(), item: it.item, amount: String(it.amount ?? "") }));
    setForm((f) => ({ ...f, allowances: newRows }));
    setAllowanceTemplateDialogOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        project_id: project.id,
        equipment: form.equipment,
        finishes: form.finishes,
        allowances: form.allowances,
        payment_schedule: form.payment_schedule,
        water_features: form.water_features || null,
        other_improvements: form.other_improvements || null,
        notes: form.notes || null,
      };
      const saved = form.id
        ? await base44.entities.PoolSelection.update(form.id, payload)
        : await base44.entities.PoolSelection.create(payload);
      setForm((f) => ({ ...f, id: saved.id }));
      setSavedAt(Date.now());
    } catch (err) {
      console.error("Failed to save pool selections:", err?.message);
      alert("Could not save selections. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Pool Selections</h2>
          <p className="mt-1 text-sm text-slate-500">
            Equipment, finishes, allowances, and payment schedule for this project — pulled automatically into contracts sent from the deal's Contracts tab.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-emerald-600">Saved</span>}
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving..." : "Save Selections"}
          </Button>
        </div>
      </div>

      {/* Equipment schedule */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Equipment Schedule</h3>
        <div className="mt-3 grid grid-cols-12 gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span className="col-span-3">Equipment</span>
          <span className="col-span-3">Manufacturer</span>
          <span className="col-span-3">Model</span>
          <span className="col-span-2">Warranty</span>
        </div>
        <div className="divide-y divide-slate-100">
          {form.equipment.map((row) => (
            <Row key={row.id}>
              <span className="col-span-3 text-sm font-medium text-slate-700">{row.equipment}</span>
              <Input className="col-span-3 h-8 text-sm" value={row.manufacturer} onChange={(e) => updateRow("equipment", row.id, { manufacturer: e.target.value })} placeholder="Manufacturer" />
              <Input className="col-span-3 h-8 text-sm" value={row.model} onChange={(e) => updateRow("equipment", row.id, { model: e.target.value })} placeholder="Model" />
              <Input className="col-span-2 h-8 text-sm" value={row.warranty} onChange={(e) => updateRow("equipment", row.id, { warranty: e.target.value })} placeholder="e.g. 2 yr" />
              <button type="button" onClick={() => removeRow("equipment", row.id)} className="col-span-1 flex justify-end text-slate-300 hover:text-rose-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Row>
          ))}
        </div>
        <button type="button" onClick={() => addRow("equipment", () => ({ id: rid(), equipment: "", manufacturer: "", model: "", warranty: "" }))} className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
          <Plus className="h-3.5 w-3.5" /> Add equipment
        </button>
      </div>

      {/* Finish & material selections */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Finish &amp; Material Selections</h3>
        <div className="mt-3 grid grid-cols-12 gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span className="col-span-3">Item</span>
          <span className="col-span-4">Manufacturer / Product</span>
          <span className="col-span-4">Color / Finish</span>
        </div>
        <div className="divide-y divide-slate-100">
          {form.finishes.map((row) => (
            <Row key={row.id}>
              <span className="col-span-3 text-sm font-medium text-slate-700">{row.item}</span>
              <Input className="col-span-4 h-8 text-sm" value={row.manufacturer_product} onChange={(e) => updateRow("finishes", row.id, { manufacturer_product: e.target.value })} placeholder="Manufacturer / product" />
              <Input className="col-span-4 h-8 text-sm" value={row.color_finish} onChange={(e) => updateRow("finishes", row.id, { color_finish: e.target.value })} placeholder="Color / finish" />
              <button type="button" onClick={() => removeRow("finishes", row.id)} className="col-span-1 flex justify-end text-slate-300 hover:text-rose-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Row>
          ))}
        </div>
        <button type="button" onClick={() => addRow("finishes", () => ({ id: rid(), item: "", manufacturer_product: "", color_finish: "" }))} className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
          <Plus className="h-3.5 w-3.5" /> Add item
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Allowances */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Allowances</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Total: {formatMoney(allowancesTotal)}</span>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={openAllowanceTemplateDialog}>
                <LayoutList className="h-3 w-3 mr-1" /> Template
              </Button>
            </div>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {form.allowances.map((row) => (
              <Row key={row.id}>
                <span className="col-span-6 text-sm font-medium text-slate-700">{row.item}</span>
                <div className="col-span-5 flex items-center gap-1">
                  <span className="text-sm text-slate-400">$</span>
                  <Input type="number" className="h-8 text-sm" value={row.amount} onChange={(e) => updateRow("allowances", row.id, { amount: e.target.value })} placeholder="0" />
                </div>
                <button type="button" onClick={() => removeRow("allowances", row.id)} className="col-span-1 flex justify-end text-slate-300 hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Row>
            ))}
          </div>
          <button type="button" onClick={() => addRow("allowances", () => ({ id: rid(), item: "", amount: "" }))} className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
            <Plus className="h-3.5 w-3.5" /> Add allowance
          </button>
        </div>

        {/* Payment schedule — driven by the Draw Schedule on the Billing tab */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment Schedule</h3>
            {draws.length > 0 && (
              <span className="text-xs font-semibold text-slate-500">
                Total: {formatMoney(draws.reduce((s, d) => s + (d.amount || 0), 0))}
                {contractValue ? ` / ${formatMoney(contractValue)} contract` : ""}
              </span>
            )}
          </div>
          {draws.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center">
              <TrendingUp className="mx-auto h-6 w-6 text-slate-300 mb-1.5" />
              <p className="text-sm text-slate-500 font-medium">No draws scheduled yet</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Add draws on the <span className="font-semibold">Billing</span> tab — they'll appear here automatically and flow into contracts as merge fields.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-12 gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span className="col-span-5">Milestone</span>
                <span className="col-span-3 text-right">% of Contract</span>
                <span className="col-span-4 text-right">Amount</span>
              </div>
              {draws.map((draw) => (
                <div key={draw.id} className="grid grid-cols-12 items-center gap-2 py-2">
                  <span className="col-span-5 text-sm font-medium text-slate-700">{draw.title}</span>
                  <span className="col-span-3 text-right text-sm text-slate-500">
                    {draw.percent_of_contract > 0 ? `${Number(draw.percent_of_contract).toFixed(1)}%` : "—"}
                  </span>
                  <span className="col-span-4 text-right text-sm font-semibold text-slate-900">
                    {formatMoney(draw.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Managed on the <span className="font-medium text-amber-600">Billing</span> tab · flows into contracts via <code className="bg-slate-100 px-1 rounded">{"{{draws.payment_schedule}}"}</code>
          </p>
        </div>
      </div>

      {/* Allowances template dialog */}
      <Dialog open={allowanceTemplateDialogOpen} onOpenChange={setAllowanceTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Allowances Template</DialogTitle>
          </DialogHeader>
          {allowanceTemplates.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <LayoutList className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-medium">No templates found</p>
              <p className="text-sm mt-1 text-slate-400">
                Go to <strong>Settings → Templates → Allowances</strong> to create one.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                Choose a template. It will replace the current allowances — you can edit them after applying.
              </p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {allowanceTemplates.map((tmpl) => {
                  const total = (tmpl.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
                  const selected = selectedAllowanceTemplateId === tmpl.id;
                  return (
                    <label
                      key={tmpl.id}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        selected ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      )}
                    >
                      <input
                        type="radio"
                        name="allowance-template"
                        checked={selected}
                        onChange={() => setSelectedAllowanceTemplateId(tmpl.id)}
                        className="mt-0.5 text-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{tmpl.name}</p>
                          {total > 0 && <span className="text-xs text-slate-500">{formatMoney(total)}</span>}
                        </div>
                        {tmpl.description && <p className="text-xs text-slate-500 mt-0.5">{tmpl.description}</p>}
                        {tmpl.items?.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {tmpl.items.map((item) => (
                              <div key={item.id} className="flex justify-between text-xs text-slate-600">
                                <span>{item.item}</span>
                                <span className="font-medium">{item.amount > 0 ? formatMoney(item.amount) : "—"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setAllowanceTemplateDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={applyAllowanceTemplate}
                  disabled={!selectedAllowanceTemplateId}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                >
                  Apply Template
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Water features / other improvements / notes */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Water Features</Label>
          <Textarea className="mt-2 min-h-[100px] text-sm" value={form.water_features} onChange={(e) => setForm((f) => ({ ...f, water_features: e.target.value }))} placeholder="e.g. raised spa with spillover, sheer descent water feature" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other Improvements</Label>
          <Textarea className="mt-2 min-h-[100px] text-sm" value={form.other_improvements} onChange={(e) => setForm((f) => ({ ...f, other_improvements: e.target.value }))} placeholder="e.g. outdoor kitchen, fire pit, pergola" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</Label>
          <Textarea className="mt-2 min-h-[100px] text-sm" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Internal notes about selections" />
        </div>
      </div>
    </div>
  );
}
