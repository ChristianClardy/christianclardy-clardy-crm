// Project schedule logic for the Builder Portal.
//
// The schedule lives in project_sheets.rows (one sheet per project), the same
// rows Calendar, Dashboard, deadline alerts, draws and Reports already read:
//   { id, is_section_header, section, task, start_date, end_date, duration,
//     status, percent_complete, depends_on, assigned_to, notes,
//     subcontractor_id, sub_notes, is_milestone, needs_inspection }
// Dates are "YYYY-MM-DD". Durations are workdays (Mon–Fri). A row with
// depends_on starts the workday after its predecessor ends (finish-to-start).
// sub_notes is the only note a subcontractor sees (sub_portal_schedule()).

export const STATUSES = ["Not Started", "In Progress", "Completed", "Blocked", "On Hold"];

export const STATUS_STYLE = {
  "Not Started": "bg-slate-100 text-slate-600",
  "In Progress": "bg-amber-100 text-amber-800",
  "Completed": "bg-emerald-100 text-emerald-700",
  "Blocked": "bg-rose-100 text-rose-700",
  "On Hold": "bg-orange-100 text-orange-700",
};

export const isDone = (row) => (row.status || "").toLowerCase() === "completed";

// Durations can be "3", 3, or "3 days" (stock templates). Always ≥ 1.
export const parseDuration = (d) => Math.max(1, parseInt(d, 10) || 1);

// Older templates store statuses as "not_started" / "in_progress".
const STATUS_FIX = { not_started: "Not Started", in_progress: "In Progress", completed: "Completed", blocked: "Blocked", on_hold: "On Hold" };
export function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    if (r.is_section_header) return r;
    const key = (r.status || "").toLowerCase().replace(/\s+/g, "_");
    return { ...r, status: STATUS_FIX[key] || r.status || "Not Started", duration: String(parseDuration(r.duration)) };
  });
}

// Give an undated schedule dates: every task follows the one before it,
// the first starting on `startIso`.
export function chainFrom(rows, startIso) {
  let prev = null;
  const next = normalizeRows(rows).map((r) => {
    if (r.is_section_header || !(r.task || "").trim()) return r;
    const row = prev
      ? { ...r, depends_on: prev.id }
      : { ...r, depends_on: null, start_date: onWorkday(startIso), end_date: endFromDuration(startIso, r.duration) };
    prev = row;
    return row;
  });
  return recalc(next);
}

// Stock / saved templates arrive undated; copy with fresh ids, then date them.
export function fromTemplateRows(templateRows, startIso) {
  const idMap = {};
  const copied = templateRows.map((r) => {
    const id = newRowId();
    idMap[r.id] = id;
    return { ...r, id };
  }).map((r) => ({ ...r, depends_on: r.depends_on ? idMap[r.depends_on] || null : null }));
  return chainFrom(copied, startIso);
}

// ── Dates ───────────────────────────────────────────────────────────────────
const toDate = (s) => (s ? new Date(`${s}T00:00:00`) : null);
const toIso = (d) => d.toLocaleDateString("en-CA");
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
export const todayIso = () => new Date().toLocaleDateString("en-CA");

export function nextWorkday(iso) {
  const d = toDate(iso);
  do d.setDate(d.getDate() + 1); while (isWeekend(d));
  return toIso(d);
}

// Same day if it's a workday, else the following Monday.
export function onWorkday(iso) {
  const d = toDate(iso);
  while (isWeekend(d)) d.setDate(d.getDate() + 1);
  return toIso(d);
}

// End date of a task starting on `startIso` lasting `days` workdays.
export function endFromDuration(startIso, days) {
  const d = toDate(onWorkday(startIso));
  let left = Math.max(1, Number(days) || 1) - 1;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) left--;
  }
  return toIso(d);
}

// Workdays from start to end, inclusive.
export function workdaysBetween(startIso, endIso) {
  const a = toDate(startIso), b = toDate(endIso);
  if (!a || !b || b < a) return 1;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (!isWeekend(d)) n++;
  return Math.max(1, n);
}

export function daysBetween(aIso, bIso) {
  return Math.round((toDate(bIso) - toDate(aIso)) / 86400000);
}

export const fmtShort = (iso) => (iso ? toDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
export const fmtLong = (iso) => (iso ? toDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "—");

// ── Templates ───────────────────────────────────────────────────────────────
// [phase, [task, workdays, flags]] — flags: m = milestone, i = inspection.
const POOL = [
  ["PRE-CONSTRUCTION", [
    ["Design & contract sign-off", 1, "m"], ["HOA approval", 10], ["Permit submitted", 1],
    ["Permit approved", 10, "m"], ["Utility locates (811)", 3],
  ]],
  ["LAYOUT & EXCAVATION", [["Layout / stake-out", 1], ["Excavation", 2], ["Haul-off & rough grade", 1]]],
  ["STRUCTURE", [
    ["Steel / rebar", 2], ["Plumbing rough-in", 2], ["Electrical rough-in & bonding", 1],
    ["Pre-gunite inspection", 1, "i"], ["Gunite / shotcrete", 1], ["Gunite cure", 7],
  ]],
  ["TILE & COPING", [["Waterline tile", 2], ["Coping", 2]]],
  ["EQUIPMENT & UTILITIES", [["Equipment pad & set", 1], ["Gas line", 1], ["Electrical final", 1]]],
  ["DECKING & HARDSCAPE", [["Deck forms & drainage", 2], ["Deck inspection", 1, "i"], ["Deck pour / pavers", 3]]],
  ["BARRIER", [["Permanent barrier / fence", 2], ["Barrier inspection", 1, "i"]]],
  ["FINISH & STARTUP", [
    ["Clean-up & acid wash", 1], ["Plaster / pebble finish", 1], ["Fill & startup", 3],
    ["Final inspection", 1, "i"], ["Pool school & client walkthrough", 1, "m"],
  ]],
  ["CLOSE-OUT", [["Punch list", 3], ["Final sign-off", 1, "m"]]],
];

const OUTDOOR_LIVING = [
  ["PRE-CONSTRUCTION", [
    ["Design & contract sign-off", 1, "m"], ["HOA approval", 10], ["Permit submitted", 1],
    ["Permit approved", 10, "m"], ["Utility locates (811)", 3],
  ]],
  ["SITE PREP", [["Layout / stake-out", 1], ["Demo & clearing", 2], ["Excavation & grading", 2]]],
  ["STRUCTURE", [["Footings", 2], ["Footing inspection", 1, "i"], ["Framing / pergola / walls", 5], ["Framing inspection", 1, "i"]]],
  ["UTILITIES", [["Gas", 1], ["Electrical rough-in", 2], ["Plumbing rough-in", 1], ["Rough-in inspection", 1, "i"]]],
  ["FINISHES", [["Stone / veneer", 4], ["Countertops", 2], ["Appliances & fixtures", 1], ["Electrical final", 1]]],
  ["HARDSCAPE & LANDSCAPE", [["Pavers / patio", 4], ["Landscaping & irrigation", 3], ["Lighting", 1]]],
  ["CLOSE-OUT", [["Final inspection", 1, "i"], ["Client walkthrough", 1, "m"], ["Punch list", 3], ["Final sign-off", 1, "m"]]],
];

export const TEMPLATES = [
  { key: "pool", label: "Pool / spa", phases: POOL },
  { key: "outdoor", label: "Outdoor living (kitchen, pergola, patio)", phases: OUTDOOR_LIVING },
];

let seq = 0;
export const newRowId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

const blankRow = (patch = {}) => ({
  id: newRowId(), is_section_header: false, section: "", task: "", assigned_to: "",
  start_date: "", end_date: "", duration: "1", status: "Not Started", percent_complete: 0,
  notes: "", depends_on: null, subcontractor_id: null, sub_notes: "", is_milestone: false, needs_inspection: false,
  ...patch,
});

export const newPhaseRow = (name) => ({ ...blankRow({ is_section_header: true, section: name.toUpperCase(), status: "", duration: "" }) });
export const newTaskRow = (patch) => blankRow(patch);

// A full schedule chained end to end from `startIso`.
export function buildFromTemplate(templateKey, startIso) {
  const tpl = TEMPLATES.find((t) => t.key === templateKey);
  const rows = [];
  let prev = null;
  let cursor = onWorkday(startIso || todayIso());
  for (const [phase, tasks] of tpl.phases) {
    rows.push(newPhaseRow(phase));
    for (const [task, days, flags = ""] of tasks) {
      const start = prev ? nextWorkday(prev.end_date) : cursor;
      const row = blankRow({
        task, duration: String(days), start_date: start, end_date: endFromDuration(start, days),
        depends_on: prev?.id || null, is_milestone: flags.includes("m"), needs_inspection: flags.includes("i"),
      });
      rows.push(row);
      prev = row;
    }
  }
  return rows;
}

// ── Recalculation ───────────────────────────────────────────────────────────
// Re-derive dates for every row that depends on another, in dependency order.
// Started and finished rows keep their start date (it already happened);
// everything else starts the workday after its predecessor ends.
export function recalc(rows) {
  const byId = Object.fromEntries(rows.map((r) => [r.id, { ...r }]));
  const done = new Set();
  const visit = (id, stack = new Set()) => {
    if (done.has(id) || stack.has(id)) return;
    const r = byId[id];
    if (!r || r.is_section_header) { done.add(id); return; }
    stack.add(id);
    const pred = r.depends_on && byId[r.depends_on];
    if (pred) {
      visit(pred.id, stack);
      const started = isDone(r) || r.status === "In Progress";
      if ((!started || !r.start_date) && pred.end_date) r.start_date = nextWorkday(pred.end_date);
    }
    if (r.start_date && !isDone(r)) r.end_date = endFromDuration(r.start_date, parseDuration(r.duration));
    done.add(id);
  };
  rows.forEach((r) => visit(r.id));
  return rows.map((r) => byId[r.id]);
}

// Rows downstream of `id` (for "this will move N tasks" messages).
export function dependentsOf(rows, id) {
  const out = new Set();
  const walk = (pid) => rows.forEach((r) => { if (r.depends_on === pid && !out.has(r.id)) { out.add(r.id); walk(r.id); } });
  walk(id);
  return out;
}

// ── Summaries ───────────────────────────────────────────────────────────────
export const taskRows = (rows) => (rows || []).filter((r) => !r.is_section_header && (r.task || "").trim());

export function phaseOf(rows, rowId) {
  let phase = "";
  for (const r of rows) {
    if (r.is_section_header) phase = r.section;
    if (r.id === rowId) return phase;
  }
  return "";
}

// Duration-weighted percent complete.
export function percentComplete(rows) {
  const tasks = taskRows(rows);
  if (!tasks.length) return 0;
  let total = 0, earned = 0;
  for (const r of tasks) {
    const w = parseDuration(r.duration);
    total += w;
    earned += w * (isDone(r) ? 1 : Math.min(100, Number(r.percent_complete) || 0) / 100);
  }
  return Math.round((earned / total) * 100);
}

export function forecastEnd(rows) {
  return taskRows(rows).reduce((max, r) => (r.end_date && r.end_date > max ? r.end_date : max), "");
}

export function overdueRows(rows, today = todayIso()) {
  return taskRows(rows).filter((r) => !isDone(r) && r.end_date && r.end_date < today);
}

export function currentRows(rows, today = todayIso()) {
  return taskRows(rows).filter((r) => !isDone(r) && (r.status === "In Progress" || (r.start_date && r.start_date <= today && r.end_date >= today)));
}

export function nextRow(rows, today = todayIso()) {
  return taskRows(rows).filter((r) => !isDone(r) && r.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;
}

// { level: "done" | "ok" | "risk" | "behind" | "none", label, days }
export function scheduleHealth(project, rows, today = todayIso()) {
  if (project.status === "completed") return { level: "done", label: "Completed" };
  const tasks = taskRows(rows);
  if (!tasks.length) return { level: "none", label: "No schedule" };
  const forecast = forecastEnd(rows);
  const late = overdueRows(rows, today).length;
  if (project.end_date && forecast > project.end_date) {
    const days = daysBetween(project.end_date, forecast);
    return { level: "behind", label: `${days} day${days !== 1 ? "s" : ""} behind`, days };
  }
  if (late) return { level: "risk", label: `${late} task${late !== 1 ? "s" : ""} overdue` };
  return { level: "ok", label: "On track" };
}

export const HEALTH_STYLE = {
  done: "bg-emerald-100 text-emerald-700",
  ok: "bg-emerald-50 text-emerald-700",
  risk: "bg-amber-100 text-amber-800",
  behind: "bg-rose-100 text-rose-700",
  none: "bg-slate-100 text-slate-500",
};
