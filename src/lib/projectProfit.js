// Projected profit for a project, used everywhere it's shown (Finance
// dashboard, WIP report, the project's Job Cost tab):
//   1. projected_profit_override, when set by hand (concessions, a
//      negotiated-down price)
//   2. the builder fee, on a flat builder fee job (projects.builder_fee)
//   3. otherwise DEFAULT_MARGIN of the contract value plus approved change
//      orders (callers attach project.approved_change_orders_total, see
//      withApprovedChangeOrders below)
// Margin % is against that revised contract (contract + approved change orders).
export const DEFAULT_MARGIN = 0.30;

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

export function projectedProfit(project) {
  const contract = (Number(project?.contract_value) || 0) + (Number(project?.approved_change_orders_total) || 0);
  const override = num(project?.projected_profit_override);
  const fee = num(project?.builder_fee);
  let amount;
  let basis;
  if (override !== null && !Number.isNaN(override)) {
    amount = override;
    basis = "override";
  } else if (fee && fee > 0) {
    amount = fee;
    basis = "builder_fee";
  } else {
    amount = contract * DEFAULT_MARGIN;
    basis = "default_margin";
  }
  return { amount, basis, margin: contract > 0 ? (amount / contract) * 100 : 0 };
}

export const PROFIT_BASIS_LABEL = {
  override: "Set manually",
  builder_fee: "Builder fee",
  default_margin: `${Math.round(DEFAULT_MARGIN * 100)}% of contract + COs`,
};

// Sum of approved change orders per project.
export function approvedChangeOrderTotals(changeOrders) {
  const totals = {};
  for (const co of changeOrders || []) {
    if ((co.status || "").toLowerCase() !== "approved" || !co.project_id) continue;
    totals[co.project_id] = (totals[co.project_id] || 0) + (Number(co.amount) || 0);
  }
  return totals;
}

// Projects with approved_change_orders_total attached, ready for projectedProfit().
export function withApprovedChangeOrders(projects, changeOrders) {
  const totals = approvedChangeOrderTotals(changeOrders);
  return (projects || []).map((p) => ({ ...p, approved_change_orders_total: totals[p.id] || 0 }));
}
