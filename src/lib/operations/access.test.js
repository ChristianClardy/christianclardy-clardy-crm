import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { distributionSection, operationsVariant, showOperationsNav } from "./access.js";

const TURF = "053ff852-852b-4709-8b3b-3fb27c43c0ab";
const POOLS = "687dd747-560c-4ce4-8d84-b181db5edbc4";

test("Operations is hidden on All companies and on a company that has it off", () => {
  assert.equal(showOperationsNav({ companyId: "all", enabled: true, columnsReady: true, turfModulesOn: true }), false);
  assert.equal(showOperationsNav({ companyId: "none", enabled: false, columnsReady: true, turfModulesOn: true }), false);
  assert.equal(showOperationsNav({ companyId: POOLS, enabled: false, columnsReady: true, turfModulesOn: true }), false);
  assert.equal(showOperationsNav({ companyId: POOLS, enabled: true, columnsReady: true, turfModulesOn: false }), true);
});

test("Turf'n Texas shows Operations only for that company, before the column exists", () => {
  assert.equal(showOperationsNav({ companyId: TURF, enabled: false, columnsReady: false, turfModulesOn: true }), true);
  assert.equal(showOperationsNav({ companyId: POOLS, enabled: false, columnsReady: false, turfModulesOn: true }), false);
  assert.equal(showOperationsNav({ companyId: TURF, enabled: false, columnsReady: true, turfModulesOn: true }), false);
  assert.equal(showOperationsNav({ companyId: TURF, enabled: true, columnsReady: true, turfModulesOn: true }), true);
});

test("distribution data stays on turf tables for Turf'n Texas", () => {
  assert.equal(operationsVariant(TURF), "turf");
  assert.equal(operationsVariant(POOLS), "generic");
  assert.equal(distributionSection({ companyId: TURF, operationsDistribution: false, distributionModule: true }), true);
  assert.equal(distributionSection({ companyId: POOLS, operationsDistribution: false, distributionModule: true }), false);
  assert.equal(distributionSection({ companyId: POOLS, operationsDistribution: true, distributionModule: false }), true);
});

test("operations migration does not move turf rows or send messages", () => {
  const sql = readFileSync("supabase/migrations/067_company_operations.sql", "utf8");
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /operations_enabled/);
  assert.match(sql, /distribution_orders/);
  assert.match(sql, /053ff852-852b-4709-8b3b-3fb27c43c0ab/);
  assert.doesNotMatch(sql, /INSERT INTO turf_/i);
  assert.doesNotMatch(sql, /UPDATE turf_/i);
  assert.doesNotMatch(sql, /DELETE FROM turf_/i);
  assert.doesNotMatch(sql, /resend|twilio|enroll_in_sequence/i);
  assert.doesNotMatch(sql, /INSERT INTO leads|INSERT INTO projects/i);
});
