// Projected profit for a project, used everywhere it's shown (Finance
// dashboard, WIP report, the project's Job Cost tab):
//   1. projected_profit_override, when set by hand (concessions, a
//      negotiated-down price)
//   2. the builder fee, on a flat builder fee job (projects.builder_fee)
//   3. otherwise DEFAULT_MARGIN of the contract value
export const DEFAULT_MARGIN = 0.30;

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

export function projectedProfit(project) {
  const contract = Number(project?.contract_value) || 0;
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
  default_margin: `${Math.round(DEFAULT_MARGIN * 100)}% of contract`,
};
