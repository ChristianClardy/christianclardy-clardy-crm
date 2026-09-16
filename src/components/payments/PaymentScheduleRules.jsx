import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Zap, Clock, CheckCircle2, Settings2 } from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const RULE_TYPES = [
  { value: "deposit",   label: "Deposit" },
  { value: "milestone", label: "Milestone" },
  { value: "final",     label: "Final Payment" },
  { value: "custom",    label: "Custom" },
];

const TRIGGER_EVENTS = [
  { value: "project_created",   label: "When project is created" },
  { value: "percent_complete",  label: "When project reaches X% complete" },
  { value: "project_completed", label: "When project is completed" },
  { value: "manual",            label: "Manual only" },
];

const AMOUNT_TYPES = [
  { value: "percent_of_contract", label: "Percentage of contract value" },
  { value: "fixed",               label: "Fixed amount" },
  { value: "remaining_balance",   label: "Remaining balance" },
];

const TYPE_BADGE_COLORS = {
  deposit:   "bg-blue-100 text-blue-700 border-blue-200",
  milestone: "bg-amber-100 text-amber-700 border-amber-200",
  final:     "bg-green-100 text-green-700 border-green-200",
  custom:    "bg-slate-100 text-slate-700 border-slate-200",
};

const TRIGGER_ICONS = {
  project_created:   Zap,
  percent_complete:  Clock,
  project_completed: CheckCircle2,
  manual:            Settings2,
};

const EMPTY_FORM = {
  rule_name:             "",
  rule_type:             "deposit",
  trigger_event:         "project_created",
  trigger_value:         null,
  invoice_amount_type:   "percent_of_contract",
  invoice_amount_value:  "",
  payment_terms_days:    14,
  send_via_qb:           true,
  description_template:  "",
  sort_order:            "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function describeTrigger(rule) {
  switch (rule.trigger_event) {
    case "project_created":
      return "When project is created";
    case "percent_complete":
      return `When project reaches ${rule.trigger_value?.percent ?? "?"}% complete`;
    case "project_completed":
      return "When project is completed";
    case "manual":
      return "Manual only";
    default:
      return rule.trigger_event;
  }
}

function describeAmount(rule) {
  switch (rule.invoice_amount_type) {
    case "percent_of_contract":
      return `${rule.invoice_amount_value}% of contract value`;
    case "fixed":
      return `$${Number(rule.invoice_amount_value).toLocaleString()} fixed`;
    case "remaining_balance":
      return "Remaining balance";
    default:
      return String(rule.invoice_amount_value);
  }
}

// ─── Add / Edit Dialog ───────────────────────────────────────────────────────

function RuleDialog({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              rule_name:            initial.rule_name            ?? "",
              rule_type:            initial.rule_type            ?? "deposit",
              trigger_event:        initial.trigger_event        ?? "project_created",
              trigger_value:        initial.trigger_value        ?? null,
              invoice_amount_type:  initial.invoice_amount_type  ?? "percent_of_contract",
              invoice_amount_value: initial.invoice_amount_value ?? "",
              payment_terms_days:   initial.payment_terms_days   ?? 14,
              send_via_qb:          initial.send_via_qb          ?? true,
              description_template: initial.description_template ?? "",
              sort_order:           initial.sort_order           ?? "",
            }
          : EMPTY_FORM
      );
    }
  }, [open, initial]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.rule_name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  const isPercentComplete = form.trigger_event === "percent_complete";
  const isFixed           = form.invoice_amount_type === "fixed";
  const isPercent         = form.invoice_amount_type === "percent_of_contract";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Rule" : "Add Payment Rule"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Rule Name */}
          <div className="space-y-1.5">
            <Label htmlFor="rule_name">Rule Name</Label>
            <Input
              id="rule_name"
              value={form.rule_name}
              onChange={(e) => set("rule_name", e.target.value)}
              placeholder="e.g., 30% Deposit"
            />
          </div>

          {/* Rule Type */}
          <div className="space-y-1.5">
            <Label>Rule Type</Label>
            <Select value={form.rule_type} onValueChange={(v) => set("rule_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Trigger */}
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Select
              value={form.trigger_event}
              onValueChange={(v) => {
                set("trigger_event", v);
                if (v !== "percent_complete") set("trigger_value", null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_EVENTS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Percent complete value */}
          {isPercentComplete && (
            <div className="space-y-1.5">
              <Label htmlFor="trigger_percent">Completion Percentage</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="trigger_percent"
                  type="number"
                  min={1}
                  max={99}
                  value={form.trigger_value?.percent ?? ""}
                  onChange={(e) =>
                    set("trigger_value", { percent: Number(e.target.value) })
                  }
                  className="w-28"
                  placeholder="50"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </div>
          )}

          {/* Amount Type */}
          <div className="space-y-1.5">
            <Label>Amount Type</Label>
            <Select
              value={form.invoice_amount_type}
              onValueChange={(v) => set("invoice_amount_type", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AMOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount Value (hidden for remaining_balance) */}
          {form.invoice_amount_type !== "remaining_balance" && (
            <div className="space-y-1.5">
              <Label htmlFor="amount_value">
                {isPercent ? "Percentage" : "Amount"}
              </Label>
              <div className="flex items-center gap-2">
                {isFixed && <span className="text-sm text-slate-500">$</span>}
                <Input
                  id="amount_value"
                  type="number"
                  min={0}
                  value={form.invoice_amount_value}
                  onChange={(e) => set("invoice_amount_value", e.target.value)}
                  className="w-32"
                  placeholder={isPercent ? "30" : "0.00"}
                />
                {isPercent && <span className="text-sm text-slate-500">%</span>}
              </div>
            </div>
          )}

          {/* Payment Terms */}
          <div className="space-y-1.5">
            <Label htmlFor="payment_terms">Days due after invoice creation</Label>
            <Input
              id="payment_terms"
              type="number"
              min={0}
              value={form.payment_terms_days}
              onChange={(e) => set("payment_terms_days", Number(e.target.value))}
              className="w-28"
            />
          </div>

          {/* Send via QB */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="send_via_qb"
              checked={form.send_via_qb}
              onCheckedChange={(v) => set("send_via_qb", !!v)}
            />
            <Label htmlFor="send_via_qb" className="cursor-pointer">
              Send via QuickBooks
            </Label>
          </div>

          {/* Description Template */}
          <div className="space-y-1.5">
            <Label htmlFor="desc_template">Description Template</Label>
            <Textarea
              id="desc_template"
              rows={2}
              value={form.description_template}
              onChange={(e) => set("description_template", e.target.value)}
              placeholder="e.g., 30% deposit for {{project_name}}"
            />
          </div>

          {/* Sort Order */}
          <div className="space-y-1.5">
            <Label htmlFor="sort_order">Sort Order (optional)</Label>
            <Input
              id="sort_order"
              type="number"
              min={0}
              value={form.sort_order}
              onChange={(e) => set("sort_order", e.target.value)}
              className="w-28"
              placeholder="0"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.rule_name.trim()}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaymentScheduleRules({ companyId }) {
  const [rules, setRules]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]     = useState(null); // null = add, object = edit

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchRules = async () => {
    setLoading(true);
    let query = supabase
      .from("payment_schedule_rules")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query;
    if (!error && data) setRules(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRules();
  }, [companyId]);

  // ── Save (add or update) ───────────────────────────────────────────────────

  const handleSave = async (form) => {
    const payload = {
      rule_name:            form.rule_name.trim(),
      rule_type:            form.rule_type,
      trigger_event:        form.trigger_event,
      trigger_value:        form.trigger_value ?? null,
      invoice_amount_type:  form.invoice_amount_type,
      invoice_amount_value: form.invoice_amount_value !== "" ? Number(form.invoice_amount_value) : null,
      payment_terms_days:   Number(form.payment_terms_days),
      send_via_qb:          form.send_via_qb,
      description_template: form.description_template.trim() || null,
      sort_order:           form.sort_order !== "" ? Number(form.sort_order) : null,
      company_id:           companyId ?? null,
    };

    if (editing) {
      await supabase
        .from("payment_schedule_rules")
        .update(payload)
        .eq("id", editing.id);
    } else {
      await supabase.from("payment_schedule_rules").insert(payload);
    }

    setDialogOpen(false);
    setEditing(null);
    await fetchRules();
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this payment rule?")) return;
    await supabase.from("payment_schedule_rules").delete().eq("id", id);
    await fetchRules();
  };

  // ── Open dialog helpers ────────────────────────────────────────────────────

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (rule) => {
    setEditing(rule);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Payment Schedule Rules</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Define when invoices should be suggested based on project events. Rules are suggestions only — invoices are never sent automatically.
          </p>
        </div>
        <Button size="sm" onClick={openAdd} className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Rule
        </Button>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="text-sm text-slate-400 py-6 text-center">Loading rules…</div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center space-y-1">
          <Settings2 className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-500">No payment rules yet</p>
          <p className="text-xs text-slate-400">Add a rule to start automating invoice suggestions.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const TriggerIcon = TRIGGER_ICONS[rule.trigger_event] ?? Settings2;
            return (
              <div
                key={rule.id}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                {/* Icon */}
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 border border-slate-100">
                  <TriggerIcon className="w-4 h-4 text-slate-500" />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-900">{rule.rule_name}</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_COLORS[rule.rule_type] ?? TYPE_BADGE_COLORS.custom}`}
                    >
                      {RULE_TYPES.find((t) => t.value === rule.rule_type)?.label ?? rule.rule_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{describeTrigger(rule)}</p>
                  <p className="text-xs text-slate-500">{describeAmount(rule)}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-slate-700"
                    onClick={() => openEdit(rule)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-rose-600"
                    onClick={() => handleDelete(rule.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <RuleDialog
        open={dialogOpen}
        onClose={closeDialog}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  );
}
