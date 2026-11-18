import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { eeMidlandLines, eeMidlandOrder } from "./fixtures.js";
import { orderTotals, paymentAppliesToOrder } from "./money.js";

test("Midland draft invoice totals flag unpriced lines", () => {
  const totals = orderTotals(eeMidlandOrder(), eeMidlandLines());
  assert.equal(totals.knownSub, 6285);
  assert.equal(totals.delivery, 400);
  assert.equal(totals.taxable, 6685);
  assert.equal(totals.tax, 551.51);
  assert.equal(totals.total, 7236.51);
  assert.equal(totals.pricingIncomplete, true);
  assert.equal(totals.costIncomplete, true);
  assert.equal(totals.margin, null);
  assert.deepEqual(totals.unpriced.map((line) => line.description), ["Pad", "Adhesive 5 Gal Bucket"]);
  assert.equal(totals.knownCost, 564);
});

test("a fully priced order has a margin and Dale Garner tax", () => {
  const order = { delivery_fee: 400, tax_rate: 0.0825 };
  const lines = [
    { description: "Kentucky Pro", qty: 6375, rate: 1.86, unit_cost: 1.5, rate_unknown: false, cost_unknown: false },
    { description: "Nails", qty: 6, rate: 74, unit_cost: 55, rate_unknown: false, cost_unknown: false },
    { description: "Tape", qty: 1, rate: 134, unit_cost: 119, rate_unknown: false, cost_unknown: false },
    { description: "Turf Claw", qty: 4, rate: 89, unit_cost: 65, rate_unknown: false, cost_unknown: false },
  ];
  const totals = orderTotals(order, lines);
  assert.equal(totals.knownSub, 12791.5);
  assert.equal(totals.taxable, 13191.5);
  assert.equal(totals.tax, 1088.3);
  assert.equal(totals.total, 14279.8);
  assert.equal(totals.pricingIncomplete, false);
  assert.equal(totals.knownCost, 10271.5);
  assert.equal(totals.margin, 2920);
});

test("a blank rate is not treated as zero", () => {
  const totals = orderTotals({ delivery_fee: 400, tax_rate: 0.0825 }, [
    { description: "Pad", qty: 100, rate: null, rate_unknown: true, unit_cost: null, cost_unknown: true },
  ]);
  assert.equal(totals.knownSub, 0);
  assert.equal(totals.pricingIncomplete, true);
  assert.equal(totals.unpriced.length, 1);
});

function functionFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "_lib" || name.startsWith("_")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) functionFiles(path, acc);
    else if (/\.(js|ts|mjs)$/.test(name)) acc.push(path.replaceAll("\\", "/"));
  }
  return acc;
}

test("serverless function files stay at the existing twelve", () => {
  const files = functionFiles("api").sort();
  assert.deepEqual(files, [
    "api/cron.js",
    "api/docusign-callback.js",
    "api/docusign-config.js",
    "api/docusign-send.js",
    "api/docusign-status.js",
    "api/docusign-webhook.js",
    "api/invite.js",
    "api/mcp/[token].js",
    "api/public-lead.js",
    "api/quickbooks.js",
    "api/upload-record.js",
    "api/upload.js",
  ]);
});

test("migration seeds the catalog and Midland order, not sample schedule rows", () => {
  const sql = readFileSync("supabase/migrations/066_turf_texas.sql", "utf8");
  assert.match(sql, /EE-MID-2026-11/);
  assert.match(sql, /2306/);
  assert.match(sql, /Kentucky Pro/);
  assert.match(sql, /NOT applied to production/i);
  assert.doesNotMatch(sql, /INSERT INTO turf_install_jobs/i);
  assert.doesNotMatch(sql, /preview-job/i);
  assert.match(sql, /schedule_date/);
  assert.match(sql, /turf_order_id/);
  assert.match(sql, /2c9485d2-9b17-48d4-bea7-72770c1e9eb9/);
  for (const table of ["turf_settings", "turf_customers", "turf_products", "turf_orders", "turf_order_lines", "turf_supplier_purchases", "turf_install_jobs"]) {
    assert.match(sql, new RegExp(`attach_tenant_isolation\\('public\\.${table}'\\)`));
  }
  const orderInsert = sql.slice(sql.indexOf("EE-MID-2026-11") - 400, sql.indexOf("EE-MID-2026-11") + 200);
  assert.match(orderInsert, /NULL/);
});

test("a distribution payment applies to that order and not to a turf order", () => {
  assert.equal(paymentAppliesToOrder({ turf_order_id: "turf-1" }, "turf-1"), true);
  assert.equal(paymentAppliesToOrder({ distribution_order_id: "order-1" }, "order-1"), true);
  assert.equal(paymentAppliesToOrder({ distribution_order_id: "order-2" }, "order-1"), false);
  assert.equal(paymentAppliesToOrder({ turf_order_id: "turf-1" }, "order-1"), false);
});
