import test from "node:test";
import assert from "node:assert/strict";
import { previewModel } from "./fixtures.js";
import { applySchedulePatch, groupUndated, scheduleCensus, splitSchedule } from "./schedule.js";

test("existing Turf projects and sold leads are listed once, unsold leads are not", () => {
  const install = splitSchedule(previewModel(), { track: "install" });
  const titles = [...install.dated, ...install.undated].map((item) => item.title);
  assert.deepEqual(titles.sort(), ["AAI baseball fields", "Brian Gilley", "Burleson"]);
  assert.equal(install.dated.length, 0);
  assert.equal(install.undated.length, 3);
  assert.equal(titles.filter((title) => title === "Brian Gilley").length, 1);
  assert.equal(titles.includes("Alyssa / Extreme Exteriors"), false);
  const census = scheduleCensus(previewModel());
  assert.equal(census.shown, 3);
  assert.equal(census.projects, 1);
  assert.equal(census.soldLeads, 3);
  assert.equal(census.soldEstimates, 0);
  assert.equal(census.dated, 0);
  assert.equal(census.undated, 3);
});

test("a project start date or calendar event is the schedule date", () => {
  const model = previewModel();
  model.projects[0].start_date = "2026-11-19";
  const dated = splitSchedule(model, { track: "install" }).dated;
  assert.equal(dated.find((item) => item.title === "Brian Gilley").date, "2026-11-19");
  model.projects[0].start_date = null;
  model.events = [{ id: "ev-1", project_id: model.projects[0].id, start_datetime: "2026-11-21T08:00:00" }];
  assert.equal(splitSchedule(model, { track: "install" }).dated.find((item) => item.title === "Brian Gilley").date, "2026-11-21");
});

test("dated turf work is on the schedule and undated work is in the report", () => {
  const { dated, undated } = splitSchedule(previewModel(), {});
  const datedTitles = dated.map((item) => item.title);
  assert.ok(datedTitles.includes("SPO-PICKUP-1120"));
  assert.ok(datedTitles.includes("KD-DEL-1116"));
  assert.equal(dated.some((item) => item.title === "EE-MID-2026-11"), false);
  const undatedTitles = undated.map((item) => item.title);
  assert.ok(undatedTitles.includes("EE-MID-2026-11"));
  assert.ok(undatedTitles.includes("Brian Gilley"));
  assert.ok(undatedTitles.includes("NPT-QUOTE"));
});

test("filters keep install and distribution apart", () => {
  const install = splitSchedule(previewModel(), { track: "install" });
  assert.ok(install.dated.every((item) => item.track === "install"));
  assert.ok(install.undated.every((item) => item.track === "install"));
  const quotes = splitSchedule(previewModel(), { track: "distribution", stage: "quote" });
  assert.ok(quotes.dated.every((item) => item.status === "quote"));
  assert.ok(quotes.undated.every((item) => item.status === "quote"));
  const spo = splitSchedule(previewModel(), { customer: "Spanish Oaks Landscapes" });
  assert.equal(spo.dated.length, 1);
  assert.equal(spo.undated.length, 0);
});

test("setting a date moves an unscheduled row onto the schedule", () => {
  const model = previewModel();
  const before = splitSchedule(model, {});
  const row = before.undated.find((item) => item.title === "Burleson");
  const next = applySchedulePatch(model, row, { date: "2026-11-21", crew: "Install crew", newId: "job-dated" });
  const after = splitSchedule(next, {});
  assert.equal(after.undated.some((item) => item.title === "Burleson"), false);
  const moved = after.dated.find((item) => item.title === "Burleson");
  assert.equal(moved.date, "2026-11-21");
  assert.equal(moved.crew, "Install crew");
  assert.equal(moved.kind, "job");
});

test("clearing a date puts the row back under the schedule", () => {
  const model = previewModel();
  const row = splitSchedule(model, {}).dated.find((item) => item.title === "SPO-PICKUP-1120");
  const next = applySchedulePatch(model, row, { date: null });
  const after = splitSchedule(next, {});
  assert.equal(after.dated.some((item) => item.title === "SPO-PICKUP-1120"), false);
  assert.ok(after.undated.some((item) => item.title === "SPO-PICKUP-1120"));
});

test("a sold lead is unscheduled until a date is filed, and the lead row is not edited", () => {
  const model = previewModel();
  model.leads = [{ id: "lead-1", full_name: "Pat Example", status: "Contract Signed/Deposit Collected (Won)", company_id: model.settings.company_id, next_action: "Call", estimated_budget: 1000 }];
  const before = splitSchedule(model, { track: "install" });
  const lead = before.undated.find((item) => item.kind === "lead" && item.title === "Pat Example");
  assert.equal(lead.status, "approved");
  const next = applySchedulePatch(model, lead, { date: "2026-11-18", newId: "from-lead" });
  assert.equal(next.leads[0].status, "Contract Signed/Deposit Collected (Won)");
  assert.equal(next.jobs.find((job) => job.id === "from-lead").lead_id, "lead-1");
  const after = splitSchedule(next, {});
  assert.equal(after.undated.some((item) => item.kind === "lead"), false);
  assert.equal(after.dated.find((item) => item.title === "Pat Example").date, "2026-11-18");
});

test("the unscheduled report can group by track", () => {
  const { undated } = splitSchedule(previewModel(), {});
  const groups = groupUndated(undated, "track");
  assert.deepEqual(groups.map((group) => group.key), ["install", "distribution"]);
});
