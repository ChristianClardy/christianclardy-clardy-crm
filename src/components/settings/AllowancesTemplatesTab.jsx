import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompanyScope } from "@/lib/companyScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, GripVertical, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";

const rid = () => Math.random().toString(36).slice(2, 10);

const EMPTY_ITEM = () => ({ id: rid(), item: "", amount: "" });
const EMPTY_FORM = { name: "", description: "", items: [EMPTY_ITEM()] };

function formatMoney(n) {
  const v = Number(n) || 0;
  const hasC = v % 1 !== 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: hasC ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// ─── item row inside dialog ───────────────────────────────────────────────────

function ItemRow({ item, onChange, onRemove, canRemove }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
      <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
      <Input
        className="flex-1 h-8 text-sm"
        placeholder="e.g. Tile, Coping, Interior Finish"
        value={item.item}
        onChange={(e) => onChange({ ...item, item: e.target.value })}
      />
      <div className="flex items-center gap-1 w-32">
        <span className="text-sm text-slate-400">$</span>
        <Input
          type="number"
          min="0"
          step="0.01"
          className="h-8 text-sm"
          placeholder="0.00"
          value={item.amount}
          onChange={(e) => onChange({ ...item, amount: e.target.value })}
        />
      </div>
      <button
        type="button"
        disabled={!canRemove}
        onClick={onRemove}
        className="text-slate-300 hover:text-rose-500 disabled:opacity-30"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── add / edit dialog ────────────────────────────────────────────────────────

function TemplateDialog({ open, initial, companyId, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? { name: initial.name, description: initial.description || "", items: initial.items?.length ? initial.items : [EMPTY_ITEM()] }
          : { ...EMPTY_FORM, items: [EMPTY_ITEM()] }
      );
    }
  }, [open, initial]);

  const updateItem = (id, patch) =>
    setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  const addItem = () =>
    setForm((f) => ({ ...f, items: [...f.items, EMPTY_ITEM()] }));
  const removeItem = (id) =>
    setForm((f) => ({ ...f, items: f.items.filter((it) => it.id !== id) }));

  const total = form.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      items: form.items
        .filter((it) => it.item.trim())
        .map((it, i) => ({
          id: it.id,
          item: it.item.trim(),
          amount: Number(it.amount) || 0,
          sort_order: i,
        })),
      company_id: companyId || null,
    };
    if (initial) {
      await supabase.from("allowances_templates").update(payload).eq("id", initial.id);
    } else {
      await supabase.from("allowances_templates").insert(payload);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Template" : "New Allowances Template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Template Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Standard Pool Allowances, Premium Reno"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short note about when to use this template"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Allowance Items</Label>
              {total > 0 && (
                <span className="text-xs font-semibold text-slate-500">Total: {formatMoney(total)}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 px-6 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Item</span>
              <span>Amount</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white">
              {form.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onChange={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                  canRemove={form.items.length > 1}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add item
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AllowancesTemplatesTab() {
  const scope = useCompanyScope();
  const companyId = scope !== "all" ? scope : null;

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]     = useState(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("allowances_templates").select("*").order("name");
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this template?")) return;
    await supabase.from("allowances_templates").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Allowances Templates</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Define reusable allowance sets (e.g. tile, coping, interior finish amounts). Apply any template to a project's Pool Selections from the <strong>Allowances</strong> section — items stay fully editable per project after applying.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center space-y-1">
          <ReceiptText className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-500">No templates yet</p>
          <p className="text-xs text-slate-400">Create a template to quickly apply allowances to any project.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tmpl) => {
            const total = (tmpl.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
            return (
              <div key={tmpl.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{tmpl.name}</p>
                      {total > 0 && (
                        <span className="text-xs font-medium text-slate-500">Total: {formatMoney(total)}</span>
                      )}
                    </div>
                    {tmpl.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{tmpl.description}</p>
                    )}
                    {tmpl.items?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tmpl.items.map((item) => (
                          <span
                            key={item.id}
                            className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                          >
                            {item.item}{item.amount > 0 ? ` — ${formatMoney(item.amount)}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-slate-700"
                      onClick={() => { setEditing(tmpl); setDialogOpen(true); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-rose-600"
                      onClick={() => handleDelete(tmpl.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TemplateDialog
        open={dialogOpen}
        initial={editing}
        companyId={companyId}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); load(); }}
      />
    </div>
  );
}
