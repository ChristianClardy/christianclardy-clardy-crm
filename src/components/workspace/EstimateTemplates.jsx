import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, Copy, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function newId() { return Math.random().toString(36).slice(2, 10); }

const UNITS = ["ea", "sf", "lf", "cy", "hr", "day", "ls", "allow"];

export default function EstimateTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", line_items: [] });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const data = await base44.entities.EstimateTemplate.list("-updated_date");
    setTemplates(data);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", line_items: [] });
    setDialogOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({ name: t.name, description: t.description || "", line_items: t.line_items || [] });
    setDialogOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (editing) await base44.entities.EstimateTemplate.update(editing.id, form);
    else await base44.entities.EstimateTemplate.create(form);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this estimate template?")) {
      await base44.entities.EstimateTemplate.delete(id);
      load();
    }
  };

  const handleDuplicate = async (t) => {
    await base44.entities.EstimateTemplate.create({ name: `${t.name} (Copy)`, description: t.description, line_items: t.line_items });
    load();
  };

  const addItem = (isHeader = false) => {
    const item = { id: newId(), is_section_header: isHeader, section: isHeader ? "New Section" : "", description: isHeader ? "" : "New Item", unit: "ea", qty: isHeader ? null : 1, unit_cost: isHeader ? null : 0 };
    setForm(f => ({ ...f, line_items: [...f.line_items, item] }));
  };

  const updateItem = (id, field, value) => {
    setForm(f => ({ ...f, line_items: f.line_items.map(item => item.id === id ? { ...item, [field]: value } : item) }));
  };

  const deleteItem = (id) => {
    setForm(f => ({ ...f, line_items: f.line_items.filter(item => item.id !== id) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Estimate Templates</h2>
        <Button onClick={openNew} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500">
          <Plus className="w-4 h-4 mr-1" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 text-sm">No estimate templates yet. Create one to speed up your quoting process.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="flex-1 flex items-center gap-2 text-left hover:opacity-70 transition-opacity">
                  {expanded === t.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{t.name}</p>
                    {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                    <p className="text-xs text-slate-400 mt-0.5">{t.line_items?.filter(i => !i.is_section_header).length || 0} line items</p>
                  </div>
                </button>
                <div className="flex gap-1">
                  <button onClick={() => handleDuplicate(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Copy className="w-3.5 h-3.5" /></button>
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {expanded === t.id && t.line_items?.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-1 bg-slate-50">
                  {t.line_items.map((item, i) => (
                    <div key={i} className={cn("text-xs px-2 py-1.5 rounded", item.is_section_header ? "bg-slate-700 text-white font-semibold uppercase tracking-wide" : "text-slate-700")}>
                      {item.is_section_header ? (item.section || "—") : (
                        <div className="flex items-center gap-2">
                          <span className="flex-1">{item.description}</span>
                          <span className="text-slate-400">{item.qty} {item.unit}</span>
                          <span className="text-slate-500">${Number(item.unit_cost || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Estimate Template" : "New Estimate Template"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="mt-1.5" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1.5" rows={2} /></div>

            <div className="border-t border-slate-200 pt-4">
              <p className="text-sm font-semibold text-slate-900 mb-3">Line Items</p>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-2 py-2 text-center w-16">Qty</th>
                      <th className="px-2 py-2 text-center w-16">Unit</th>
                      <th className="px-2 py-2 text-right w-24">Unit Cost</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.line_items.map(item => {
                      if (item.is_section_header) return (
                        <tr key={item.id} className="bg-slate-700">
                          <td colSpan={4} className="px-3 py-2">
                            <input value={item.section || ""} onChange={e => updateItem(item.id, "section", e.target.value)}
                              className="bg-transparent text-white font-bold text-xs uppercase tracking-widest w-full outline-none placeholder:text-slate-400" placeholder="Section name…" />
                          </td>
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => deleteItem(item.id)} className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-rose-400"><Trash2 className="w-3 h-3" /></button>
                          </td>
                        </tr>
                      );
                      return (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-1.5">
                            <input value={item.description || ""} onChange={e => updateItem(item.id, "description", e.target.value)}
                              className="w-full bg-transparent text-slate-800 text-xs outline-none hover:bg-amber-50 rounded px-1 py-0.5 focus:ring-1 focus:ring-amber-300" placeholder="Item description…" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={item.qty ?? ""} onChange={e => updateItem(item.id, "qty", e.target.value)}
                              className="w-full text-center bg-transparent text-slate-600 text-xs outline-none hover:bg-amber-50 rounded px-1 py-0.5 focus:ring-1 focus:ring-amber-300" />
                          </td>
                          <td className="px-2 py-1.5">
                            <select value={item.unit || "ea"} onChange={e => updateItem(item.id, "unit", e.target.value)}
                              className="w-full text-center bg-transparent text-slate-500 text-xs outline-none rounded focus:ring-1 focus:ring-amber-300">
                              {UNITS.map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={item.unit_cost ?? ""} onChange={e => updateItem(item.id, "unit_cost", e.target.value)}
                              className="w-full text-right bg-transparent text-slate-600 text-xs outline-none hover:bg-amber-50 rounded px-1 py-0.5 focus:ring-1 focus:ring-amber-300" placeholder="0.00" />
                          </td>
                          <td className="px-2 py-1.5">
                            <button type="button" onClick={() => deleteItem(item.id)} className="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t border-slate-100 flex gap-2">
                  <button type="button" onClick={() => addItem(false)} className="text-xs text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-2 py-1 rounded transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> Add Item</button>
                  <button type="button" onClick={() => addItem(true)} className="text-xs text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-2 py-1 rounded transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> Add Section</button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-to-r from-amber-500 to-orange-500">{editing ? "Update" : "Create"} Template</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}