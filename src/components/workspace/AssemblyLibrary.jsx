import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const UNITS = ["EA", "LF", "SF", "SY", "CY", "CF", "LB", "TON", "HR", "DAY", "GAL", "BAG", "ROLL", "SHEET", "LS", "BDL", "PC", "BOX", "PALLET"];

const COMPONENT_TYPES = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Labor" },
  { value: "subcontract", label: "Subcontract" },
  { value: "other", label: "Other" },
];

function blankComponent() {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type: "material",
    material_id: "",
    description: "",
    unit: "EA",
    qty_per_unit: "",
    cost_per_unit: "",
  };
}

const EMPTY_ASSEMBLY = {
  name: "",
  description: "",
  output_unit: "SF",
  cost_code_id: "",
  is_active: true,
  components: [],
};

function materialTotalCost(m) {
  return (Number(m.material_cost) || 0) + (Number(m.labor_cost) || 0) + (Number(m.sub_cost) || 0) || Number(m.unit_cost) || 0;
}

export default function AssemblyLibrary({ materials = [], costCodes = [], canManage = true }) {
  const [assemblies, setAssemblies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ASSEMBLY);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Assembly.list("sort_order");
    setAssemblies(data || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_ASSEMBLY, components: [blankComponent()] });
    setDialogOpen(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({
      ...EMPTY_ASSEMBLY,
      ...a,
      cost_code_id: a.cost_code_id || "",
      components: Array.isArray(a.components) && a.components.length ? a.components : [blankComponent()],
    });
    setDialogOpen(true);
  };

  const ff = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const updateComponent = (id, patch) => {
    setForm(f => ({ ...f, components: f.components.map(c => c.id === id ? { ...c, ...patch } : c) }));
  };

  const addComponent = () => setForm(f => ({ ...f, components: [...f.components, blankComponent()] }));
  const removeComponent = (id) => setForm(f => ({ ...f, components: f.components.filter(c => c.id !== id) }));

  const handleSelectMaterial = (componentId, materialId) => {
    const mat = materials.find(m => m.id === materialId);
    updateComponent(componentId, {
      material_id: materialId,
      description: mat?.name || "",
      unit: mat?.unit || "EA",
      cost_per_unit: mat ? String(materialTotalCost(mat)) : "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description,
      output_unit: form.output_unit || "SF",
      cost_code_id: form.cost_code_id || null,
      is_active: form.is_active !== false,
      components: form.components
        .filter(c => (c.description || "").trim())
        .map(c => ({
          id: c.id,
          type: c.type,
          material_id: c.type === "material" ? (c.material_id || null) : null,
          description: c.description,
          unit: c.unit || "EA",
          qty_per_unit: Number(c.qty_per_unit) || 0,
          cost_per_unit: Number(c.cost_per_unit) || 0,
        })),
    };
    if (editing) {
      await base44.entities.Assembly.update(editing.id, payload);
    } else {
      await base44.entities.Assembly.create(payload);
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this assembly?")) {
      await base44.entities.Assembly.delete(id);
      load();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Assemblies</h2>
          <p className="text-xs text-slate-500 mt-0.5">Reusable takeoff recipes — enter one quantity in an estimate, get every component line item.</p>
        </div>
        {canManage && (
          <Button onClick={openNew} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-1">
            <Plus className="w-4 h-4" /> Add Assembly
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : assemblies.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">
          <Layers className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          No assemblies yet. Build one to auto-generate takeoff line items from a single quantity.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {assemblies.map(a => {
            const cc = costCodes.find(c => c.id === a.cost_code_id);
            const compCount = (a.components || []).length;
            return (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 truncate">{a.name}</p>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">per {a.output_unit}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{compCount} component{compCount !== 1 ? "s" : ""}{cc ? ` · ${cc.name}` : ""}</p>
                    {a.description && <p className="mt-2 text-sm text-slate-600">{a.description}</p>}
                  </div>
                  {canManage && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => handleDelete(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Assembly" : "Add Assembly"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => ff("name", e.target.value)} required className="mt-1 h-9 text-sm" placeholder="e.g. Paver Patio — Standard" />
            </div>
            <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={e => ff("description", e.target.value)} className="mt-1 text-sm" rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Output Unit</Label>
                <select value={form.output_unit} onChange={e => ff("output_unit", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Cost Code</Label>
                <select value={form.cost_code_id || ""} onChange={e => ff("cost_code_id", e.target.value)} className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                  <option value="">— None —</option>
                  {costCodes.map(cc => <option key={cc.id} value={cc.id}>{cc.code} · {cc.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Components (per 1 {form.output_unit || "unit"})</Label>
                <button type="button" onClick={addComponent} className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
                  <Plus className="w-3.5 h-3.5" /> Add component
                </button>
              </div>
              <div className="space-y-2">
                {form.components.map(c => (
                  <div key={c.id} className="border border-slate-200 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={c.type}
                        onChange={e => updateComponent(c.id, { type: e.target.value, material_id: e.target.value === "material" ? c.material_id : "" })}
                        className="h-8 text-xs border border-slate-200 rounded-md px-1.5 outline-none focus:ring-1 focus:ring-amber-400 bg-white w-28 flex-shrink-0"
                      >
                        {COMPONENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      {c.type === "material" ? (
                        <select
                          value={c.material_id || ""}
                          onChange={e => handleSelectMaterial(c.id, e.target.value)}
                          className="h-8 text-xs border border-slate-200 rounded-md px-1.5 outline-none focus:ring-1 focus:ring-amber-400 bg-white flex-1 min-w-0"
                        >
                          <option value="">— Pick a material —</option>
                          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={c.description}
                          onChange={e => updateComponent(c.id, { description: e.target.value })}
                          placeholder="Description…"
                          className="h-8 text-xs border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400 flex-1 min-w-0"
                        />
                      )}
                      <button type="button" onClick={() => removeComponent(c.id)} className="p-1 text-slate-300 hover:text-rose-500 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {c.type === "material" && c.material_id && (
                      <Input value={c.description} onChange={e => updateComponent(c.id, { description: e.target.value })} placeholder="Description override (optional)" className="h-7 text-xs" />
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-slate-400">Unit</Label>
                        <select value={c.unit} onChange={e => updateComponent(c.id, { unit: e.target.value })} className="mt-0.5 w-full h-8 text-xs border border-slate-200 rounded-md px-1.5 outline-none focus:ring-1 focus:ring-amber-400 bg-white">
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400">Qty per {form.output_unit || "unit"}</Label>
                        <input type="number" min="0" step="0.0001" value={c.qty_per_unit} onChange={e => updateComponent(c.id, { qty_per_unit: e.target.value })} placeholder="0" className="mt-0.5 w-full h-8 text-xs text-right border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400">Cost / unit</Label>
                        <input type="number" min="0" step="0.01" value={c.cost_per_unit} onChange={e => updateComponent(c.id, { cost_per_unit: e.target.value })} placeholder="0.00" className="mt-0.5 w-full h-8 text-xs text-right border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400" />
                      </div>
                    </div>
                  </div>
                ))}
                {form.components.length === 0 && (
                  <p className="text-xs text-slate-400 italic text-center py-3">No components yet — add one above.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">{editing ? "Update" : "Add"} Assembly</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
