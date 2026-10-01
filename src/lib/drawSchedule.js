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

// Fee share recorded on a draw: the builder_fee_amount column (052), or the
// note buildDraws() writes ("Includes $27,000.00 builder fee (90% of ...").
export function drawFeeAmount(draw) {
  if (Number(draw?.builder_fee_amount)) return Number(draw.builder_fee_amount);
  const m = /Includes \$([\d,]+(?:\.\d+)?) builder fee/i.exec(draw?.notes || "");
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

const feeNote = (feeAmt, fee) => `Includes ${money(feeAmt)} builder fee (${Math.round((feeAmt / fee) * 10000) / 100}% of ${money(fee)}).`;

// After a project's contract value (and/or builder fee) changes: new amounts
// for its draws. Each draw's builder fee share stays fixed (or keeps its share
// of a changed fee); only the cost share scales with contract minus fee.
// Draws without a builder fee scale with the contract by their percentage, as
// before. Only draws that are a percentage of the contract, or carry a fee
// share, change; fixed-amount draws are left alone.
// Returns [{ id, amount, percent_of_contract, builder_fee_amount, notes }].
export function rescaleDraws(draws, { oldContract, newContract, oldFee, newFee }) {
  const oc = Number(oldContract) || 0;
  const nc = Number(newContract) || 0;
  const feeShares = (draws || []).map(drawFeeAmount);
  const feeOnDraws = feeShares.reduce((s, v) => s + v, 0);
  const hasFee = feeOnDraws > 0;
  const of = hasFee ? Number(oldFee) || feeOnDraws : 0;
  const nf = hasFee ? (newFee === null || newFee === undefined || newFee === "" ? of : Number(newFee) || 0) : 0;
  const oldSplit = oc - of;
  const newSplit = nc - nf;
  if (!nc || (hasFee ? oldSplit <= 0 : !oc)) return [];

  const out = (draws || []).map((d, i) => {
    const pct = Number(d.percent_of_contract) || 0;
    const fee = feeShares[i];
    if (!hasFee) {
      if (!pct) return null;
      const amount = cents((pct / 100) * nc);
      return { id: d.id, amount, percent_of_contract: pct, builder_fee_amount: 0, notes: d.notes ?? null };
    }
    if (!pct && !fee) return null;
    const costShare = Math.max(0, (Number(d.amount) || 0) - fee);
    const newFeeShare = of > 0 ? cents((fee / of) * nf) : fee;
    const newCost = cents(costShare * (newSplit / oldSplit));
    const amount = cents(newCost + newFeeShare);
    return {
      id: d.id,
      amount,
      percent_of_contract: cents((amount / nc) * 100),
      builder_fee_amount: newFeeShare,
      notes: newFeeShare ? feeNote(newFeeShare, nf) : (fee ? null : d.notes ?? null),
    };
  });

  // Keep the schedule totalling the contract when it did before.
  const changed = out.filter(Boolean);
  const oldTotal = (draws || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const allScaled = changed.length === (draws || []).length;
  if (allScaled && changed.length && Math.abs(oldTotal - oc) < 1) {
    const total = changed.reduce((s, d) => s + d.amount, 0);
    const last = changed[changed.length - 1];
    last.amount = cents(last.amount + (nc - total));
    last.percent_of_contract = cents((last.amount / nc) * 100);
  }
  return changed;
}
