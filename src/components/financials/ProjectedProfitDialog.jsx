import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DEFAULT_MARGIN, projectedProfit } from "@/lib/projectProfit";

// Defined outside the dialog so its inputs keep focus while typing.
function Option({ value, mode, setMode, title, children }) {
  return (
    <label className={cn("block rounded-xl border p-3 cursor-pointer", mode === value ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:bg-slate-50")}>
      <div className="flex items-center gap-2">
        <input type="radio" checked={mode === value} onChange={() => setMode(value)} />
        <span className="font-medium text-slate-900 text-sm">{title}</span>
      </div>
      {mode === value && children && <div className="mt-2 pl-6">{children}</div>}
    </label>
  );
}

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// How a project's projected profit is figured (src/lib/projectProfit.js):
//   Flat builder fee → profit is the fee (projects.builder_fee)
//   30% of contract  → the default
//   Custom amount    → projects.projected_profit_override (concessions,
//                      negotiated-down price)
// Opened from the Job Cost tab and the Finance dashboard's job table.
export default function ProjectedProfitDialog({ project, open, onClose, onSaved }) {
  const baseContract = Number(project?.contract_value) || 0;
  const changeOrders = Number(project?.approved_change_orders_total) || 0;
  // The 30% option and the margin use the contract plus approved change orders.
  const contract = baseContract + changeOrders;
  const [mode, setMode] = useState("margin");
  const [fee, setFee] = useState("");
  const [custom, setCustom] = useState("");
  const [suggestedFee, setSuggestedFee] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !project) return;
    const current = projectedProfit(project);
    setMode(current.basis === "override" ? "custom" : current.basis === "builder_fee" ? "fee" : "margin");
    setFee(project.builder_fee != null ? String(project.builder_fee) : "");
    setCustom(project.projected_profit_override != null ? String(project.projected_profit_override) : "");
    setSuggestedFee(null);
    // A builder fee schedule applied on the Billing tab leaves notes like
    // "Includes $27,000.00 builder fee (90% of $30,000.00)." on its draws.
    if (project.builder_fee == null) {
      base44.entities.Draw.filter({ project_id: project.id }).then((draws) => {
        const m = draws.map((d) => /builder fee \(\d+(?:\.\d+)?% of \$([\d,]+(?:\.\d+)?)\)/i.exec(d.notes || "")).find(Boolean);
        if (m) {
          const found = Number(m[1].replace(/,/g, ""));
          setSuggestedFee(found);
          setFee(String(found));
          if (current.basis === "default_margin") setMode("fee");
        }
      }).catch(() => {});
    }
  }, [open, project?.id]);

  const preview = mode === "fee" ? Number(fee) || 0 : mode === "custom" ? Number(custom) || 0 : contract * DEFAULT_MARGIN;
  const invalid = (mode === "fee" && !(Number(fee) > 0)) || (mode === "custom" && custom.trim() === "");

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Project.update(project.id, {
        // The builder fee also feeds {{project.builder_fee}} merge fields; a
        // custom amount keeps whatever fee is on file.
        ...(mode === "fee" ? { builder_fee: Number(fee) } : mode === "margin" ? { builder_fee: null } : {}),
        projected_profit_override: mode === "custom" ? Number(custom) || 0 : null,
      });
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Projected profit: {project?.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500 -mt-1">
          Contract value {fmt(baseContract)}
          {changeOrders !== 0 && <> + {fmt(changeOrders)} approved change orders = {fmt(contract)}</>}
        </p>
        <div className="space-y-2">
          <Option value="fee" mode={mode} setMode={setMode} title="Flat builder fee">
            <Label className="text-xs">Builder fee ($)</Label>
            <Input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-1 h-9" autoFocus />
            {suggestedFee != null && <p className="text-xs text-amber-700 mt-1">Found {fmt(suggestedFee)} in this project's builder fee draw schedule.</p>}
          </Option>
          <Option value="margin" mode={mode} setMode={setMode} title={`${Math.round(DEFAULT_MARGIN * 100)}% of contract${changeOrders ? " + change orders" : ""} (${fmt(contract * DEFAULT_MARGIN)})`} />
          <Option value="custom" mode={mode} setMode={setMode} title="Custom amount">
            <Label className="text-xs">Projected profit ($)</Label>
            <Input type="number" step="0.01" value={custom} onChange={(e) => setCustom(e.target.value)} className="mt-1 h-9" placeholder="e.g. after a concession" autoFocus />
          </Option>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm flex justify-between">
          <span className="text-slate-600">Projected profit</span>
          <span className="font-semibold text-slate-900">{fmt(preview)}{contract > 0 && <span className="ml-1 font-normal text-slate-500">({((preview / contract) * 100).toFixed(1)}%)</span>}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || invalid} className="bg-slate-900 text-white">
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
