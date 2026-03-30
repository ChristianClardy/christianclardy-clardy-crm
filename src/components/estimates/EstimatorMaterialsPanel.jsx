import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMaterialsForProjectType, materialToEstimateLineItem } from "@/components/estimates/materialEstimateUtils";

export default function EstimatorMaterialsPanel({ projectType, materials = [], marginPercent = 0, onAddMaterial }) {
  const suggestedMaterials = useMemo(() => getMaterialsForProjectType(materials, projectType).slice(0, 6), [materials, projectType]);

  if (!suggestedMaterials.length) return null;

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Suggested library materials</p>
          <p className="text-xs text-slate-500">Pull actual material pricing into this estimate based on the selected project type.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {suggestedMaterials.map((material) => {
          const baseCost = Number(material.material_cost || 0) + Number(material.labor_cost || 0) + Number(material.sub_cost || 0);
          return (
            <div key={material.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-medium text-slate-900 text-sm">{material.name}</p>
              <p className="mt-1 text-xs text-slate-500">{material.category || "Other"} · {(material.unit || "EA").toUpperCase()}</p>
              <p className="mt-2 text-sm font-semibold text-amber-600">${baseCost.toFixed(2)} base</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => onAddMaterial(materialToEstimateLineItem(material, marginPercent))}
              >
                <Plus className="w-4 h-4 mr-1" /> Add to estimate
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}