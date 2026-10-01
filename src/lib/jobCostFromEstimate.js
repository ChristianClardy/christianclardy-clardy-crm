// Builds a project's Job Cost breakdown (job_cost_breakdowns.sections) so it
// mirrors the linked estimate: the same sections, in the same order, with the
// same line items. Each line carries the estimate's COST (quantity × cost per
// unit, never the marked-up price) as the budget, and an actual cost entered
// on the project.
//
// Section order matches EstimateDetail.jsx: material sections first, then
// trade sections, then labor sections. Items are grouped by their `trade`,
// exactly as the estimate's sections are.
//
// Section: { id, name, sectionType: "trade"|"material", estimate_id,
//            estimate_sourced, collapsed, items }
// Item:    { id, source_item_id, sectionType, description, unit, quantity,
//            est_cost_per_unit, budgeted (est. total cost), actual, costs,
//            notes, removed_from_estimate? }
//   costs:  [{ id, amount, date, note }], every cost entered against the
//           line (several invoices against one lump-sum estimate line);
//           actual is always their sum.
// Lines and sections added by hand have no source_item_id / estimate_id; on a
// project with an estimate they're extra costs (not in the estimate).

// Must match TRADE_GROUPS["Labor"] in src/pages/EstimateDetail.jsx.
const LABOR_TRADES = new Set([
  "Framing", "Electrician", "Plumber", "Masonry", "Concrete/Foundation",
  "Roofing", "Flooring", "Wall Tile", "Sheetrock", "Cleanup",
  "Finish Carpentry",
]);

export const newId = () => Math.random().toString(36).slice(2, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function sectionOrder(lineItems) {
  const trades = [...new Set(lineItems.filter((i) => i.sectionType !== "material").map((i) => i.trade))];
  // A name with labor items too is a trade section (its material rows are tinted).
  const materials = [...new Set(lineItems.filter((i) => i.sectionType === "material").map((i) => i.trade))].filter((t) => !trades.includes(t));
  return [
    ...materials.map((name) => ({ name, sectionType: "material" })),
    ...trades.filter((t) => !LABOR_TRADES.has(t)).map((name) => ({ name, sectionType: "trade" })),
    ...trades.filter((t) => LABOR_TRADES.has(t)).map((name) => ({ name, sectionType: "trade" })),
  ];
}

// `previous` is the current breakdown: actual costs and notes carry over by
// estimate line id, and hand-added lines in a section stay in it.
export function sectionsFromEstimate(estimate, previous = []) {
  const lineItems = Array.isArray(estimate?.line_items) ? estimate.line_items.filter((i) => i && i.trade) : [];
  const prevSections = previous.filter((s) => s.estimate_id === estimate.id);
  const prevBySource = new Map();
  for (const s of prevSections) for (const it of s.items || []) if (it.source_item_id) prevBySource.set(it.source_item_id, it);
  const used = new Set();

  const built = sectionOrder(lineItems).map(({ name, sectionType }) => {
    const prevSection = prevSections.find((s) => s.name === name);
    const items = lineItems.filter((li) => li.trade === name).map((li) => {
      const prev = prevBySource.get(li.id);
      if (prev) used.add(li.id);
      const qty = Number(li.quantity) || 0;
      const cpu = Number(li.cost_per_unit) || 0;
      return {
        id: prev?.id || newId(),
        source_item_id: li.id,
        sectionType: li.sectionType || "trade",
        description: li.description || "",
        unit: li.unit || "",
        quantity: qty,
        est_cost_per_unit: cpu,
        budgeted: round2(qty * cpu),
        actual: Number(prev?.actual) || 0,
        costs: costEntries(prev),
        notes: prev?.notes || "",
      };
    });
    // Hand-added lines, and estimate lines that were removed but already have costs.
    const extras = (prevSection?.items || []).filter((it) => !it.source_item_id || (!lineItems.some((li) => li.id === it.source_item_id) && Number(it.actual)));
    return {
      id: prevSection?.id || newId(),
      name,
      sectionType,
      estimate_id: estimate.id,
      estimate_sourced: true,
      collapsed: prevSection?.collapsed || false,
      items: [...items, ...extras.map((it) => (it.source_item_id ? { ...it, removed_from_estimate: true } : it))],
    };
  });

  // A whole section dropped from the estimate keeps any lines with costs.
  for (const s of prevSections) {
    if (built.some((b) => b.name === s.name)) continue;
    const keep = (s.items || []).filter((it) => Number(it.actual) || !it.source_item_id);
    if (keep.length) built.push({ ...s, items: keep.map((it) => (it.source_item_id ? { ...it, removed_from_estimate: true } : it)) });
  }
  return built;
}

// The breakdown from before line items were tracked: one "<Trade> (from
// estimate)" line per section, budgeted at the marked-up price, with no
// estimate_id. Safe to rebuild; any actual cost on it is kept as its own line.
export function isLegacyBreakdown(sections) {
  return (sections || []).some((s) => s.estimate_sourced && !s.estimate_id);
}

export function rebuildFromEstimates(estimates, sections) {
  const legacy = (sections || []).filter((s) => s.estimate_sourced && !s.estimate_id);
  const manual = (sections || []).filter((s) => !s.estimate_sourced);
  const current = (sections || []).filter((s) => s.estimate_id);
  let built = estimates.flatMap((est) => sectionsFromEstimate(est, current));
  // Carry over actual costs entered on the old one-line-per-trade breakdown.
  for (const old of legacy) {
    const actual = (old.items || []).reduce((sum, it) => sum + (Number(it.actual) || 0), 0);
    if (!actual) continue;
    const line = { id: newId(), description: "Actual costs entered before line-item tracking", unit: "", quantity: 0, est_cost_per_unit: 0, budgeted: 0, actual: round2(actual), costs: [{ id: newId(), amount: round2(actual), date: "", note: "Entered on the old breakdown" }], notes: "" };
    const target = built.find((s) => s.name === old.name);
    if (target) target.items.push(line);
    else built.push({ id: newId(), name: old.name, sectionType: "trade", estimate_sourced: false, collapsed: false, items: [line] });
  }
  return [...built, ...manual];
}

// A line's cost entries. Lines saved before entries existed have only
// `actual`, which becomes a single entry.
export function costEntries(item) {
  if (Array.isArray(item?.costs)) return item.costs;
  const a = Number(item?.actual) || 0;
  return a ? [{ id: newId(), amount: a, date: "", note: "" }] : [];
}
export const sumCosts = (costs) => round2((costs || []).reduce((s, c) => s + (Number(c.amount) || 0), 0));

// Not in the estimate: lines/sections added by hand on a project that has one.
// (AP invoices not yet assigned to a line aren't extra, just unassigned.)
export const isExtra = (item, hasEstimate) => hasEstimate && !item?.source_item_id && !item?.ap_invoice_id;

// actual includes extra costs; extra is the part that wasn't in the estimate.
export const sectionTotals = (section, hasEstimate = false) => {
  const items = section.items || [];
  const budgeted = items.reduce((s, i) => s + (Number(i.budgeted) || 0), 0);
  const actual = items.reduce((s, i) => s + (Number(i.actual) || 0), 0);
  const extra = items.filter((i) => isExtra(i, hasEstimate)).reduce((s, i) => s + (Number(i.actual) || 0), 0);
  return { budgeted: round2(budgeted), actual: round2(actual), extra: round2(extra), variance: round2(budgeted - actual) };
};
