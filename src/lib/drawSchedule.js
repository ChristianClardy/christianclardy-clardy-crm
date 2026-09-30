// Turns a payment schedule template (payment_schedule_templates.items) into a
// project's draws, used by the Billing tab's Apply Template.
//
// Flat builder fee: a template "includes a builder fee" when any milestone
// has a fee_percent. The fee amount is entered per project when applying.
// The contract includes the fee, so:
//   cost to split = contract value − builder fee
//   draw amount   = its % of the cost to split (or its fixed $)
//                 + its fee_percent of the builder fee
// e.g. $100,000 contract, $15,000 fee, 30/30/30/5/5 with the fee 90% first /
// 10% last → $25,500 + $13,500, $25,500, $25,500, $4,250, $4,250 + $1,500.
// Without a fee, % milestones are simply % of the contract value.

const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const hasBuilderFee = (template) =>
  (template?.items || []).some((it) => Number(it.fee_percent) > 0);

export const feePercentTotal = (items) =>
  (items || []).reduce((s, it) => s + (Number(it.fee_percent) || 0), 0);

export const costPercentTotal = (items) =>
  (items || []).filter((it) => it.invoice_amount_type === "percent_of_contract")
    .reduce((s, it) => s + (Number(it.invoice_amount_value) || 0), 0);

const money = (n) => `$${cents(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// → [{ title, amount, percent_of_contract, cost_amount, fee_amount, fee_percent, notes }]
export function buildDraws(template, contractValue, builderFee = 0) {
  const items = [...(template?.items || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const contract = Number(contractValue) || 0;
  const withFee = hasBuilderFee(template);
  const fee = withFee ? Math.max(0, Number(builderFee) || 0) : 0;
  const cost = contract - fee;

  const base = items.map((it) => {
    if (it.invoice_amount_type === "percent_of_contract") return cents((Number(it.invoice_amount_value) || 0) / 100 * cost);
    if (it.invoice_amount_type === "fixed") return cents(it.invoice_amount_value);
    return null; // remaining balance, filled in below
  });
  const known = base.reduce((s, b) => s + (b ?? 0), 0);
  const remainingIdx = base.findIndex((b) => b === null);
  base.forEach((b, i) => { if (b === null) base[i] = i === remainingIdx ? cents(Math.max(0, cost - known)) : 0; });

  const draws = items.map((it, i) => {
    const feePct = withFee ? Number(it.fee_percent) || 0 : 0;
    const feeAmt = cents(fee * feePct / 100);
    const amount = cents(base[i] + feeAmt);
    return {
      title: it.title,
      cost_amount: base[i],
      fee_amount: feeAmt,
      fee_percent: feePct,
      amount,
      notes: feeAmt ? `Includes ${money(feeAmt)} builder fee (${feePct}% of ${money(fee)}).` : "",
    };
  });

  // Rounding: when the schedule is meant to cover the whole contract, put any
  // leftover cents on the last draw so the draws add up exactly.
  const complete = remainingIdx !== -1 || Math.abs(costPercentTotal(items) - 100) < 0.001;
  const feeComplete = !withFee || Math.abs(feePercentTotal(items) - 100) < 0.001;
  const total = draws.reduce((s, d) => s + d.amount, 0);
  if (draws.length && complete && feeComplete && Math.abs(contract - total) < 1) {
    draws[draws.length - 1].amount = cents(draws[draws.length - 1].amount + (contract - total));
  }

  return draws.map((d) => ({ ...d, percent_of_contract: contract > 0 ? cents(d.amount / contract * 100) : 0 }));
}
