export function buildMaterialFromEstimateItem(item) {
  return {
    name: item?.description || "",
    description: item?.notes || "",
    category: "Other",
    unit: (item?.unit || "EA").toUpperCase(),
    material_cost: String(item?.material_unit_cost ?? 0),
    labor_cost: String(item?.labor_unit_cost ?? 0),
    sub_cost: String(item?.subcontract_unit_cost ?? 0),
    supplier: "",
    sku: item?.item_code || "",
  };
}