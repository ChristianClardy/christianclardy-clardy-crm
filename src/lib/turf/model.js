import { TURF_COMPANY_ID } from "./constants.js";
import { blankLine } from "./fixtures.js";
import { newId } from "./schedule.js";

function upsert(list, row) {
  const rows = list || [];
  return rows.some((item) => item.id === row.id)
    ? rows.map((item) => (item.id === row.id ? { ...item, ...row } : item))
    : [...rows, row];
}

export function applyJob(model, job) {
  return { ...model, jobs: upsert(model.jobs, { ...job, company_id: TURF_COMPANY_ID }) };
}

export function applyOrder(model, order, lines) {
  const saved = { ...order, company_id: TURF_COMPANY_ID };
  const nextLines = (lines || []).map((line, index) => ({
    ...line,
    id: line.id || newId(),
    order_id: saved.id,
    sort_order: index + 1,
  }));
  return {
    ...model,
    orders: upsert(model.orders, saved),
    lines: [...(model.lines || []).filter((line) => line.order_id !== saved.id), ...nextLines],
  };
}

export function applyCustomer(model, customer) {
  return { ...model, customers: upsert(model.customers, { ...customer, company_id: TURF_COMPANY_ID }) };
}

export function applyProduct(model, product) {
  return { ...model, products: upsert(model.products, { ...product, company_id: TURF_COMPANY_ID }) };
}

export function applyPurchase(model, purchase) {
  return { ...model, purchases: upsert(model.purchases, { ...purchase, company_id: TURF_COMPANY_ID }) };
}

export function applySettings(model, settings) {
  return { ...model, settings: { ...model.settings, ...settings, company_id: TURF_COMPANY_ID } };
}

export function applyPayment(model, payment) {
  return { ...model, payments: [...(model.payments || []), { ...payment, id: payment.id || newId(), company_id: TURF_COMPANY_ID }] };
}

export function removePurchase(model, id) {
  return { ...model, purchases: (model.purchases || []).filter((row) => row.id !== id) };
}

export function lineFromProduct(orderId, product, sort) {
  const rateUnknown = product.sell_unknown || product.sell_price == null;
  const costUnknown = product.cost_unknown || product.cost == null;
  return blankLine(orderId, {
    product_id: product.id,
    description: product.name,
    detail: product.pack || "",
    unit: product.unit || "",
    qty: 1,
    rate: rateUnknown ? null : product.sell_price,
    unit_cost: costUnknown ? null : product.cost,
    rate_unknown: rateUnknown,
    cost_unknown: costUnknown,
    sort_order: sort,
  });
}
