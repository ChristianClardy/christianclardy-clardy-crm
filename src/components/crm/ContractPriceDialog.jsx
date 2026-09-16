import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ContractPriceDialog({ lead, saving, onConfirm, onCancel }) {
  const [price, setPrice] = useState(lead?.estimated_budget ? String(lead.estimated_budget) : "");

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(Number(price) || 0);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Contract Price</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          Enter the signed contract value for <span className="font-semibold text-slate-700">{lead?.full_name}</span>.
          This can be updated later as change orders or amendments come in.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <Label htmlFor="contract-price">Contract Price ($)</Label>
            <Input
              id="contract-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1.5"
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={saving}>
              {saving ? "Creating project…" : "Mark as Won"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
