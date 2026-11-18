import { DEFAULT_TAX_RATE } from "./constants.js";

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Tax in cents, half-up, so 8.25% of $6,685.00 is $551.51.
export function taxOn(taxable, rate) {
  const cents = Math.round(Number(taxable) * 100);
  const r = Number(rate);
  if (!Number.isFinite(cents) || !Number.isFinite(r)) return 0;
  return Math.round(cents * r) / 100;
}

export function extend(qty, rate) {
  if (rate == null || rate === "" || qty == null || qty === "") return null;
  const q = Number(qty);
  const r = Number(rate);
  if (!Number.isFinite(q) || !Number.isFinite(r)) return null;
  return roundMoney(q * r);
}

export function lineSell(line) {
  if (line?.rate_unknown) return null;
  return extend(line?.qty, line?.rate);
}

export function lineCost(line) {
  if (line?.cost_unknown) return null;
  return extend(line?.qty, line?.unit_cost);
}

export function orderTotals(order, lines) {
  const list = lines || [];
  let knownSub = 0;
  let knownCost = 0;
  const unpriced = [];
  const unknownCost = [];

  for (const line of list) {
    const sell = lineSell(line);
    if (sell == null) unpriced.push(line);
    else knownSub = roundMoney(knownSub + sell);
    const cost = lineCost(line);
    if (cost == null) unknownCost.push(line);
    else knownCost = roundMoney(knownCost + cost);
  }

  const deliveryRaw = order?.delivery_fee;
  const deliveryKnown = deliveryRaw != null && deliveryRaw !== "";
  const delivery = deliveryKnown ? roundMoney(deliveryRaw) : null;
  const taxable = roundMoney(knownSub + (delivery || 0));
  const taxRate = Number(order?.tax_rate ?? DEFAULT_TAX_RATE);
  const tax = taxOn(taxable, taxRate);
  const total = roundMoney(taxable + tax);
  const pricingIncomplete = unpriced.length > 0 || !deliveryKnown;
  const costIncomplete = unknownCost.length > 0;
  const margin = !pricingIncomplete && !costIncomplete ? roundMoney(taxable - knownCost) : null;
  const marginPct = margin != null && taxable ? roundMoney((margin / taxable) * 100) : null;

  return {
    knownSub,
    delivery,
    taxable,
    tax,
    taxRate,
    total,
    pricingIncomplete,
    unpriced,
    knownCost,
    unknownCost,
    costIncomplete,
    margin,
    marginPct,
  };
}

export function sumPayments(payments, pred) {
  const seen = new Set();
  let total = 0;
  for (const payment of payments || []) {
    if (!payment || seen.has(payment.id) || !pred(payment)) continue;
    seen.add(payment.id);
    total += Number(payment.amount_received) || 0;
  }
  return roundMoney(total);
}

export function orderBalance(totals, collected) {
  const paid = roundMoney(collected || 0);
  return {
    collected: paid,
    amount: roundMoney(totals.total - paid),
    incomplete: totals.pricingIncomplete,
  };
}

export function formatMoney(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "TBD";
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatRate(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "TBD";
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatTotal(amount, incomplete) {
  const base = formatMoney(amount);
  return incomplete ? `${base} + TBD` : base;
}

export function formatLongDate(iso) {
  if (!iso) return "";
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function moneySnapshot(model) {
  let receivable = 0;
  let partialFloor = 0;
  let partialOrders = 0;
  const orders = [];

  for (const order of model.orders || []) {
    const lines = (model.lines || []).filter((line) => line.order_id === order.id);
    const totals = orderTotals(order, lines);
    const collected = sumPayments(model.payments, (payment) => payment.turf_order_id === order.id);
    const balance = orderBalance(totals, collected);
    orders.push({ order, lines, totals, balance });
    if (balance.amount > 0.004) {
      if (totals.pricingIncomplete) {
        partialOrders += 1;
        partialFloor = roundMoney(partialFloor + balance.amount);
      } else {
        receivable = roundMoney(receivable + balance.amount);
      }
    }
  }

  let payable = 0;
  let payablePartial = 0;
  for (const purchase of model.purchases || []) {
    if (purchase.status === "paid") continue;
    if (purchase.amount == null || purchase.amount === "") payablePartial += 1;
    else payable = roundMoney(payable + Number(purchase.amount));
  }

  return { orders, receivable, partialFloor, partialOrders, payable, payablePartial };
}
