export function applyMaterialPricing(material, fallbackMarkupPercent = 0) {
  const materialCost = Number(material?.material_cost || 0);
  const laborCost = Number(material?.labor_cost || 0);
  const subcontractCost = Number(material?.sub_cost || 0);
  const baseCost = materialCost + laborCost + subcontractCost;

  let markupPercent = Number(fallbackMarkupPercent || 0);

  if (material?.markup_type === "markup_percent") {
    markupPercent = Number(material?.markup_value || 0);
  } else if (material?.markup_type === "margin_percent") {
    const margin = Number(material?.markup_value || 0);
    markupPercent = margin >= 100 ? 0 : (margin / Math.max(1, 100 - margin)) * 100;
  } else if (material?.markup_type === "overhead_profit") {
    markupPercent = Number(material?.overhead_percent || 0) + Number(material?.profit_percent || 0);
  }

  const sellUnitCost = baseCost * (1 + (markupPercent / 100));

  return {
    material_unit_cost: materialCost,
    labor_unit_cost: laborCost,
    subcontract_unit_cost: subcontractCost,
    unit_cost: sellUnitCost,
    markup_percent: markupPercent,
  };
}

export function materialToEstimateLineItem(material, fallbackMarkupPercent = 0) {
  const pricing = applyMaterialPricing(material, fallbackMarkupPercent);

  return {
    id: Math.random().toString(36).slice(2, 10),
    description: material?.name || "Material",
    unit: (material?.unit || "EA").toUpperCase(),
    qty: 1,
    item_code: material?.sku || "",
    notes: material?.description || material?.notes || "",
    cost_type: "Material",
    ...pricing,
  };
}

export function getMaterialsForProjectType(materials = [], projectType = "") {
  const type = String(projectType || "").toLowerCase();

  return materials.filter((material) => {
    const text = `${material?.name || ""} ${material?.description || ""} ${material?.category || ""}`.toLowerCase();

    if (type.includes("pergola")) return text.includes("lumber") || text.includes("framing") || text.includes("wood");
    if (type.includes("covered patio")) return text.includes("roof") || text.includes("framing") || text.includes("lumber");
    if (type.includes("outdoor kitchen")) return text.includes("masonry") || text.includes("finish") || text.includes("plumbing");
    if (type.includes("concrete") || type.includes("decking") || type.includes("hardscape")) return text.includes("concrete") || text.includes("masonry");
    if (type.includes("pool") || type.includes("spa")) return text.includes("pool") || text.includes("plumbing") || text.includes("electrical") || text.includes("equipment");

    return true;
  });
}