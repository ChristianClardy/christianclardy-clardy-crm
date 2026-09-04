import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save } from "lucide-react";

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
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await base44.entities.PoolSelection.filter({ project_id: project.id });
        const existing = rows?.[0] || null;
        if (cancelled) return;
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Allowances</h3>
            <span className="text-xs font-semibold text-slate-500">Total: {formatMoney(allowancesTotal)}</span>
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

        {/* Payment schedule */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment Schedule</h3>
            <span className={`text-xs font-semibold ${contractValue && paymentTotal !== contractValue ? "text-amber-600" : "text-slate-500"}`}>
              Total: {formatMoney(paymentTotal)}{contractValue ? ` / ${formatMoney(contractValue)} contract` : ""}
            </span>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {form.payment_schedule.map((row) => (
              <Row key={row.id}>
                <span className="col-span-6 text-sm font-medium text-slate-700">{row.milestone}</span>
                <div className="col-span-5 flex items-center gap-1">
                  <span className="text-sm text-slate-400">$</span>
                  <Input type="number" className="h-8 text-sm" value={row.amount} onChange={(e) => updateRow("payment_schedule", row.id, { amount: e.target.value })} placeholder="0" />
                </div>
                <button type="button" onClick={() => removeRow("payment_schedule", row.id)} className="col-span-1 flex justify-end text-slate-300 hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Row>
            ))}
          </div>
          <button type="button" onClick={() => addRow("payment_schedule", () => ({ id: rid(), milestone: "", amount: "" }))} className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
            <Plus className="h-3.5 w-3.5" /> Add milestone
          </button>
        </div>
      </div>

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
