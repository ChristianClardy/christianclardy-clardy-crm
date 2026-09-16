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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, GripVertical, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

const rid = () => Math.random().toString(36).slice(2, 10);

function fmtItem(item) {
  if (item.invoice_amount_type === "percent_of_contract")
    return `${item.invoice_amount_value}% of contract`;
  if (item.invoice_amount_type === "fixed")
    return `$${Number(item.invoice_amount_value).toLocaleString()} fixed`;
  return "Remaining balance";
}

const EMPTY_ITEM = () => ({
  id: rid(),
  title: "",
  invoice_amount_type: "percent_of_contract",
  invoice_amount_value: "",
});

const EMPTY_TEMPLATE = { name: "", description: "", items: [EMPTY_ITEM()] };

// ─── item row inside the dialog ──────────────────────────────────────────────

function ItemRow({ item, onChange, onRemove, canRemove }) {
  const isPercent = item.invoice_amount_type === "percent_of_contract";
  const isFixed   = item.invoice_amount_type === "fixed";

  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
      <GripVertical className="mt-2 h-4 w-4 text-slate-300 shrink-0" />
      <div className="flex-1 grid grid-cols-12 gap-2 items-start">
        {/* Title */}
        <Input
          className="col-span-5 h-8 text-sm"
          placeholder="e.g. 30% Deposit"
          value={item.title}
          onChange={(e) => onChange({ ...item, title: e.target.value })}
        />
        {/* Amount type */}
        <Select
          value={item.invoice_amount_type}
          onValueChange={(v) => onChange({ ...item, invoice_amount_type: v, invoice_amount_value: "" })}
        >
          <SelectTrigger className="col-span-4 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent_of_contract">% of contract</SelectItem>
            <SelectItem value="fixed">Fixed $</SelectItem>
            <SelectItem value="remaining_balance">Remaining balance</SelectItem>
          </SelectContent>
        </Select>
        {/* Value */}
        {item.invoice_amount_type !== "remaining_balance" ? (
          <div className="col-span-2 flex items-center gap-1">
            {isFixed && <span className="text-xs text-slate-400">$</span>}
            <Input
              type="number"
              min="0"
              className="h-8 text-sm"
              placeholder={isPercent ? "30" : "0"}
              value={item.invoice_amount_value}
              onChange={(e) => onChange({ ...item, invoice_amount_value: e.target.value })}
            />
            {isPercent && <span className="text-xs text-slate-400">%</span>}
          </div>
        ) : (
          <div className="col-span-2" />
        )}
      </div>
      <button
        type="button"
        disabled={!canRemove}
        onClick={onRemove}
        className="mt-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-30"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── add / edit dialog ────────────────────────────────────────────────────────

function TemplateDialog({ open, initial, companyId, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? { name: initial.name, description: initial.description || "", items: initial.items?.length ? initial.items : [EMPTY_ITEM()] }
          : { ...EMPTY_TEMPLATE, items: [EMPTY_ITEM()] }
      );
    }
  }, [open, initial]);

  const setItems = (items) => setForm((f) => ({ ...f, items }));

  const updateItem = (id, patch) =>
    setItems(form.items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const addItem = () => setItems([...form.items, EMPTY_ITEM()]);

  const removeItem = (id) => setItems(form.items.filter((it) => it.id !== id));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      items: form.items
        .filter((it) => it.title.trim())
        .map((it, i) => ({
          id: it.id,
          title: it.title.trim(),
          invoice_amount_type: it.invoice_amount_type,
          invoice_amount_value: it.invoice_amount_type !== "remaining_balance"
            ? (Number(it.invoice_amount_value) || 0)
            : null,
          sort_order: i,
        })),
      company_id: companyId || null,
    };
    if (initial) {
      await supabase.from("payment_schedule_templates").update(payload).eq("id", initial.id);
    } else {
      await supabase.from("payment_schedule_templates").insert(payload);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Template" : "New Payment Schedule Template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Template Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Pool Build, Patio Cover, Full Reno"
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
              <Label>Payment Milestones</Label>
              <p className="text-xs text-slate-400">Amounts recalculate automatically from the project's contract value</p>
            </div>

            {/* column headers */}
            <div className="grid grid-cols-12 gap-2 px-6 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="col-span-5">Milestone</span>
              <span className="col-span-4">Amount Type</span>
              <span className="col-span-2">Value</span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
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
              <Plus className="h-3.5 w-3.5" /> Add milestone
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

export default function PaymentScheduleTemplatesTab() {
  const scope = useCompanyScope();
  const companyId = scope !== "all" ? scope : null;

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]     = useState(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("payment_schedule_templates").select("*").order("name");
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this template?")) return;
    await supabase.from("payment_schedule_templates").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Payment Schedule Templates</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Define reusable templates (e.g. one for pools, one for patios). Apply any template to a project's draw schedule from the <strong>Billing</strong> tab — every milestone stays fully editable per project after applying.
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
          <DollarSign className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-500">No templates yet</p>
          <p className="text-xs text-slate-400">Create a template to quickly apply a payment schedule to any project.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tmpl) => (
            <div key={tmpl.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{tmpl.name}</p>
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
                          {item.title}{item.invoice_amount_type !== "remaining_balance" ? ` — ${fmtItem(item)}` : " — remaining balance"}
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
          ))}
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
