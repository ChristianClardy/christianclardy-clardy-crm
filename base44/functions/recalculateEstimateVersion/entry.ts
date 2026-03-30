import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function computeTotals(lineItems, allowances) {
  const totals = {
    subtotal_material: 0,
    subtotal_labor: 0,
    subtotal_equipment: 0,
    subtotal_subcontract: 0,
    subtotal_other: 0,
    subtotal_allowances: 0,
    subtotal_contingency: 0,
    total_cost: 0,
    total_price: 0,
    gross_profit: 0,
    gross_margin_percent: 0,
  };

  for (const item of lineItems) {
    const quantity = Number(item.quantity || 0);
    const material = quantity * Number(item.material_unit_cost || 0);
    const labor = quantity * Number(item.labor_unit_cost || 0);
    const equipment = quantity * Number(item.equipment_unit_cost || 0);
    const subcontract = quantity * Number(item.subcontract_unit_cost || 0);
    const rawCost = material + labor + equipment + subcontract;
    const baseCost = Number(item.base_cost || rawCost * (1 + ((Number(item.waste_percent || 0)) / 100)));
    const sellPrice = Number(item.sell_price || (baseCost * (1 + ((Number(item.markup_percent || 0)) / 100))));

    totals.subtotal_material += material;
    totals.subtotal_labor += labor;
    totals.subtotal_equipment += equipment;
    totals.subtotal_subcontract += subcontract;

    if (["Fee", "Permit", "Delivery", "Disposal"].includes(item.cost_type)) totals.subtotal_other += sellPrice;
    if (item.allowance_flag || item.cost_type === "Allowance") totals.subtotal_allowances += sellPrice;
    if (item.cost_type === "Contingency") totals.subtotal_contingency += sellPrice;

    totals.total_cost += baseCost;
    totals.total_price += sellPrice;
  }

  for (const allowance of allowances) {
    totals.subtotal_allowances += Number(allowance.budget_amount || 0);
    totals.total_cost += Number(allowance.actual_amount || allowance.budget_amount || 0);
    totals.total_price += Number(allowance.budget_amount || 0);
  }

  totals.gross_profit = totals.total_price - totals.total_cost;
  totals.gross_margin_percent = totals.total_price > 0 ? totals.gross_profit / totals.total_price : 0;
  return totals;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const data = payload.data || {};
    const estimateVersionId = data.estimate_version_id;
    if (!estimateVersionId) return Response.json({ ok: true });

    const versions = await base44.asServiceRole.entities.EstimateVersion.filter({ estimate_version_id: estimateVersionId }, '-created_date', 1);
    const version = versions[0];
    if (!version) return Response.json({ ok: true });

    const [lineItems, allowances] = await Promise.all([
      base44.asServiceRole.entities.LineItem.filter({ estimate_version_id: estimateVersionId }, 'sort_order', 5000),
      base44.asServiceRole.entities.Allowance.filter({ estimate_version_id: estimateVersionId }, '-created_date', 5000),
    ]);

    const totals = computeTotals(lineItems, allowances);
    await base44.asServiceRole.entities.EstimateVersion.update(version.id, totals);

    return Response.json({ ok: true, totals });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});