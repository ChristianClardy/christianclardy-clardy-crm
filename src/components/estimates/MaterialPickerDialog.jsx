import { useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { materialToEstimateLineItem } from "@/components/estimates/materialEstimateUtils";

export default function MaterialPickerDialog({ open, onOpenChange, materials = [], marginPercent = 0, onAddMaterial }) {
  const [search, setSearch] = useState("");

  const filteredMaterials = useMemo(() => {
    const query = search.toLowerCase();
    return materials.filter((material) => {
      const haystack = `${material.name || ""} ${material.category || ""} ${material.supplier || ""} ${material.sku || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [materials, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Material to Estimate</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search material library..." className="pl-9" />
        </div>

        <div className="mt-4 overflow-y-auto border rounded-xl border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 text-left">Material</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-right">Base Cost</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map((material) => {
                const baseCost = Number(material.material_cost || 0) + Number(material.labor_cost || 0) + Number(material.sub_cost || 0);
                return (
                  <tr key={material.id} className="border-b border-slate-100 hover:bg-amber-50/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{material.name}</p>
                        {material.description ? <p className="text-xs text-slate-500 mt-0.5">{material.description}</p> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{material.category || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{(material.unit || "EA").toUpperCase()}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">${baseCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAddMaterial(materialToEstimateLineItem(material, marginPercent))}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}