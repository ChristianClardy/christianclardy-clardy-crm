import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, Search, Package, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import MaterialImportDialog from "./MaterialImportDialog";

const CATEGORIES = [
  "Concrete & Masonry", "Framing & Lumber", "Roofing", "Insulation",
  "Drywall", "Flooring", "Plumbing", "Electrical", "HVAC",
  "Windows & Doors", "Finish & Trim", "Landscaping", "Equipment", "Other"
];

const UNITS = ["EA", "LF", "SF", "CY", "CF", "LB", "TON", "HR", "DAY", "GAL", "BAG", "ROLL", "SHEET"];

const MARKUP_TYPES = [
  { value: "markup_percent", label: "Markup %" },
  { value: "margin_percent", label: "Margin %" },
  { value: "overhead_profit", label: "Overhead / Profit Split" },
];

// Merge multiple material records: keep first non-empty / non-zero value per field
function mergeMaterial(...mats) {
  const pick = (key, numeric = false) => {
    for (const m of mats) {
      const v = m[key];
      if (numeric ? (v && Number(v) > 0) : (v !== "" && v !== null && v !== undefined))
        return v;
    }
    return numeric ? 0 : "";
  };
  const matCost = pick("material_cost", true);
  const labCost = pick("labor_cost", true);
  const subCost = pick("sub_cost", true);
  return {
    name:             pick("name"),
    description:      pick("description"),
    category:         pick("category"),
    unit:             pick("unit"),
    material_cost:    matCost,
    labor_cost:       labCost,
    sub_cost:         subCost,
    unit_cost:        matCost + labCost + subCost || pick("unit_cost", true),
    markup_type:      pick("markup_type"),
    markup_value:     pick("markup_value", true),
    overhead_percent: pick("overhead_percent", true),
    profit_percent:   pick("profit_percent", true),
    supplier:         pick("supplier"),
    sku:              pick("sku"),
    notes:            pick("notes"),
  };
}

const emptyForm = {
  name: "", description: "", category: "Other", unit: "EA",
  material_cost: "", labor_cost: "", sub_cost: "",
  markup_type: "markup_percent", markup_value: "", overhead_percent: "", profit_percent: "",
  supplier: "", sku: "", notes: ""
};

export default function MaterialLibrary() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const data = await base44.entities.Material.list("-created_date");
    setMaterials(data);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name || "", description: m.description || "",
      category: m.category || "Other", unit: (m.unit || "EA").toUpperCase(),
      material_cost: m.material_cost ?? "", labor_cost: m.labor_cost ?? "", sub_cost: m.sub_cost ?? "",
      markup_type: m.markup_type || "markup_percent",
      markup_value: m.markup_value ?? "", overhead_percent: m.overhead_percent ?? "", profit_percent: m.profit_percent ?? "",
      supplier: m.supplier || "", sku: m.sku || "", notes: m.notes || ""
    });
    setDialogOpen(true);
  };

  const n = (v) => v !== "" ? Number(v) : 0;

  const handleSave = async (e) => {
    e.preventDefault();
    const matCost = n(form.material_cost);
    const labCost = n(form.labor_cost);
    const subCost = n(form.sub_cost);
    const data = {
      ...form,
      material_cost: matCost,
      labor_cost: labCost,
      sub_cost: subCost,
      unit_cost: matCost + labCost + subCost,
      markup_value: n(form.markup_value),
      overhead_percent: n(form.overhead_percent),
      profit_percent: n(form.profit_percent),
    };
    if (editing) {
      await base44.entities.Material.update(editing.id, data);
    } else {
      // Check for duplicate name — update existing instead of creating
      const existing = materials.find(m => m.name?.toLowerCase() === form.name?.trim().toLowerCase());
      if (existing) {
        await base44.entities.Material.update(existing.id, mergeMaterial(existing, data));
      } else {
        await base44.entities.Material.create(data);
      }
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this material?")) { await base44.entities.Material.delete(id); load(); }
  };

  const handleDedup = async () => {
    if (!confirm("This will merge all duplicate materials (same name), keeping the most complete record. Continue?")) return;
    // Group by normalised name
    const groups = {};
    for (const m of materials) {
      const key = (m.name || "").trim().toLowerCase();
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    for (const group of Object.values(groups)) {
      if (group.length < 2) continue;
      // Score: count non-zero / non-empty fields
      const score = (m) => [m.description, m.unit, m.unit_cost, m.material_cost, m.category, m.supplier]
        .filter(v => v !== "" && v !== null && v !== undefined && v !== 0).length;
      group.sort((a, b) => score(b) - score(a));
      const [keep, ...dupes] = group;
      // Merge best values into keeper
      const merged = mergeMaterial(keep, ...dupes);
      await base44.entities.Material.update(keep.id, merged);
      for (const d of dupes) await base44.entities.Material.delete(d.id);
    }
    load();
  };

  const categories = ["All", ...CATEGORIES];
  const filtered = materials.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) || (m.supplier || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "All" || m.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const totalCost = (m) => (m.material_cost || 0) + (m.labor_cost || 0) + (m.sub_cost || 0) || m.unit_cost || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Material Library</h2>
        <div className="flex flex-wrap gap-2 items-start">
          <Button variant="outline" size="sm" onClick={handleDedup} className="gap-1.5 text-slate-600 border-slate-200 hover:bg-slate-50">
            Clean Duplicates
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50">
            <Upload className="w-4 h-4" /> Import
          </Button>
          <Button onClick={openNew} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500">
            <Plus className="w-4 h-4 mr-1" /> Add Material
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search materials…" className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex flex-wrap gap-1">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={cn("text-xs px-2.5 py-1 rounded-full border transition-all", categoryFilter === cat ? "bg-amber-500 text-white border-amber-500" : "bg-white border-slate-200 text-slate-600 hover:border-amber-300")}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No materials yet. Add your first material or import from a spreadsheet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Supplier / SKU</th>
                <th className="px-4 py-3 text-center">Unit</th>
                <th className="px-4 py-3 text-right">Mat</th>
                <th className="px-4 py-3 text-right">Labor</th>
                <th className="px-4 py-3 text-right">Sub</th>
                <th className="px-4 py-3 text-right">Base Cost</th>
                <th className="px-4 py-3 text-left">Markup</th>
                <th className="px-4 py-3 text-center w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} className="border-b border-slate-100 hover:bg-amber-50/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{m.name}</p>
                    {m.description && <p className="text-xs text-slate-400">{m.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{m.category}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {m.supplier && <p>{m.supplier}</p>}
                    {m.sku && <p className="text-slate-400">SKU: {m.sku}</p>}
                    {!m.supplier && !m.sku && "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-medium text-slate-500">{(m.unit || "").toUpperCase()}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">${(m.material_cost || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">${(m.labor_cost || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">${(m.sub_cost || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">${totalCost(m).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {m.markup_type === "overhead_profit"
                      ? `O ${m.overhead_percent || 0}% / P ${m.profit_percent || 0}%`
                      : m.markup_type === "margin_percent"
                      ? `Margin ${m.markup_value || 0}%`
                      : `Markup ${m.markup_value || 0}%`}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Material" : "Add Material"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="mt-1 h-9 text-sm" /></div>
            <div><Label className="text-xs">Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1 h-9 text-sm" /></div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400">
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Base Costs */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Base Costs</p>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Material ($)</Label><Input type="number" step="0.01" value={form.material_cost} onChange={e => setForm(f => ({ ...f, material_cost: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
                <div><Label className="text-xs">Labor ($)</Label><Input type="number" step="0.01" value={form.labor_cost} onChange={e => setForm(f => ({ ...f, labor_cost: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
                <div><Label className="text-xs">Sub ($)</Label><Input type="number" step="0.01" value={form.sub_cost} onChange={e => setForm(f => ({ ...f, sub_cost: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="0.00" /></div>
              </div>
              <p className="text-xs text-slate-500 text-right">
                Total base: <strong>${((n(form.material_cost)) + (n(form.labor_cost)) + (n(form.sub_cost))).toFixed(2)}</strong>
              </p>
            </div>

            {/* Markup */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Markup Rules</p>
              <div>
                <Label className="text-xs">Markup Type</Label>
                <select value={form.markup_type} onChange={e => setForm(f => ({ ...f, markup_type: e.target.value }))}
                  className="mt-1 w-full h-9 text-sm border border-slate-200 rounded-md px-2 outline-none focus:ring-1 focus:ring-amber-400">
                  {MARKUP_TYPES.map(mt => <option key={mt.value} value={mt.value}>{mt.label}</option>)}
                </select>
              </div>
              {form.markup_type !== "overhead_profit" ? (
                <div>
                  <Label className="text-xs">{form.markup_type === "margin_percent" ? "Margin %" : "Markup %"}</Label>
                  <Input type="number" step="0.1" value={form.markup_value} onChange={e => setForm(f => ({ ...f, markup_value: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="0" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Overhead %</Label><Input type="number" step="0.1" value={form.overhead_percent} onChange={e => setForm(f => ({ ...f, overhead_percent: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="0" /></div>
                  <div><Label className="text-xs">Profit %</Label><Input type="number" step="0.1" value={form.profit_percent} onChange={e => setForm(f => ({ ...f, profit_percent: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="0" /></div>
                </div>
              )}
            </div>

            {/* Vendor */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Supplier / Vendor</Label><Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="mt-1 h-9 text-sm" /></div>
              <div><Label className="text-xs">SKU</Label><Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} className="mt-1 h-9 text-sm" /></div>
            </div>

            <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 text-sm" rows={2} /></div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500">{editing ? "Update" : "Add"} Material</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <MaterialImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { setImportOpen(false); load(); }} />
    </div>
  );
}