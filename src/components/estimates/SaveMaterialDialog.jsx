import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function SaveMaterialDialog({ open, onOpenChange, form, onChange, onSubmit, isSaving }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as Material</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => onChange("name", e.target.value)} className="mt-1.5" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => onChange("description", e.target.value)} className="mt-1.5" rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => onChange("category", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit} onChange={(e) => onChange("unit", e.target.value.toUpperCase())} className="mt-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Material Cost</Label>
              <Input type="number" step="0.01" value={form.material_cost} onChange={(e) => onChange("material_cost", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Labor Cost</Label>
              <Input type="number" step="0.01" value={form.labor_cost} onChange={(e) => onChange("labor_cost", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Sub Cost</Label>
              <Input type="number" step="0.01" value={form.sub_cost} onChange={(e) => onChange("sub_cost", e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={(e) => onChange("supplier", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => onChange("sku", e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={onSubmit} disabled={isSaving || !form.name} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              {isSaving ? "Saving..." : "Save Material"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}