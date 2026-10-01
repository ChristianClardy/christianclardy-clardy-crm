import { base44 } from "@/api/base44Client";
import { costEntries, sumCosts } from "@/lib/jobCostFromEstimate";

// Sub / vendor invoices from a project's AP & Cash tab feed its Job Cost
// actual costs. An invoice linked to a line (sub_invoices.job_cost_item_id)
// is a locked cost entry on that line; an unlinked one goes in the
// "AP invoices not assigned to a line" section. Disputed invoices don't count.
// The AP invoice is the record: editing or deleting it updates the entry.

export const AP_UNASSIGNED_SECTION_ID = "ap-unassigned";
const counts = (inv) => inv.status !== "disputed" && Number(inv.amount);
const label = (inv) => `${inv.vendor_name || "Vendor"}${inv.invoice_number ? ` #${inv.invoice_number}` : ""}`;

function entryFor(inv) {
  return {
    id: `ap-${inv.id}`,
    sub_invoice_id: inv.id,
    amount: Math.round(Number(inv.amount) * 100) / 100,
    date: (inv.created_at || inv.created_date || inv.due_date || "").slice(0, 10),
    note: `AP: ${label(inv)}${inv.status === "paid" ? " (paid)" : ""}`,
  };
}

// Pure: sections with every AP invoice in place. Hand-entered costs are kept.
export function mergeApInvoices(sections, invoices) {
  const live = (invoices || []).filter(counts);
  const itemIds = new Set((sections || []).filter((s) => s.id !== AP_UNASSIGNED_SECTION_ID).flatMap((s) => (s.items || []).map((i) => i.id)));
  const byItem = {};
  for (const inv of live) if (inv.job_cost_item_id && itemIds.has(inv.job_cost_item_id)) (byItem[inv.job_cost_item_id] ||= []).push(inv);

  const next = (sections || []).filter((s) => s.id !== AP_UNASSIGNED_SECTION_ID).map((s) => ({
    ...s,
    items: (s.items || []).map((it) => {
      const manual = costEntries(it).filter((c) => !c.sub_invoice_id);
      const ap = (byItem[it.id] || []).map(entryFor);
      if (!ap.length && manual.length === costEntries(it).length) return it; // untouched
      const costs = [...manual, ...ap];
      return { ...it, costs, actual: sumCosts(costs) };
    }),
  }));

  const unassigned = live.filter((inv) => !byItem[inv.job_cost_item_id]?.includes(inv));
  if (unassigned.length) {
    next.push({
      id: AP_UNASSIGNED_SECTION_ID,
      name: "AP invoices not assigned to a line",
      sectionType: "trade",
      estimate_sourced: false,
      ap_unassigned: true,
      collapsed: false,
      items: unassigned.map((inv) => ({
        id: `ap-${inv.id}`,
        ap_invoice_id: inv.id,
        description: label(inv),
        unit: "", quantity: 0, est_cost_per_unit: 0, budgeted: 0,
        costs: [entryFor(inv)],
        actual: Math.round(Number(inv.amount) * 100) / 100,
        notes: "",
      })),
    });
  }
  return next;
}

export const breakdownTotals = (sections) => ({
  budgeted: (sections || []).reduce((s, sec) => s + (sec.items || []).reduce((a, i) => a + (Number(i.budgeted) || 0), 0), 0),
  actual: (sections || []).reduce((s, sec) => s + (sec.items || []).reduce((a, i) => a + (Number(i.actual) || 0), 0), 0),
});

// After an AP invoice is saved or deleted: bring the project's Job Cost
// breakdown and cost totals up to date. If the project has no breakdown yet,
// its Job Cost tab builds one (from the estimate) and merges invoices then.
export async function syncApToJobCost(projectId) {
  const [rows, invoices] = await Promise.all([
    base44.entities.JobCostBreakdown.filter({ project_id: projectId }).catch(() => []),
    base44.entities.SubInvoice.filter({ project_id: projectId }).catch(() => []),
  ]);
  const breakdown = rows.find((r) => r.sections?.length);
  if (!breakdown) return;
  const merged = mergeApInvoices(breakdown.sections, invoices);
  if (JSON.stringify(merged) === JSON.stringify(breakdown.sections)) return;
  await base44.entities.JobCostBreakdown.update(breakdown.id, { sections: merged });
  const t = breakdownTotals(merged);
  await base44.entities.Project.update(projectId, { original_costs: t.budgeted, costs_to_date: t.actual, sync_locked: true });
}

// Job cost lines to pick from on an AP invoice: [{ id, label, group }].
export async function jobCostLineOptions(projectId) {
  const rows = await base44.entities.JobCostBreakdown.filter({ project_id: projectId }).catch(() => []);
  const sections = rows.find((r) => r.sections?.length)?.sections || [];
  return sections.filter((s) => s.id !== AP_UNASSIGNED_SECTION_ID).flatMap((s) => (s.items || []).map((i) => ({
    id: i.id,
    group: s.name,
    label: `${i.description || "Line"}${Number(i.budgeted) ? ` · est. $${Number(i.budgeted).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : !i.source_item_id ? " · extra" : ""}`,
  })));
}
