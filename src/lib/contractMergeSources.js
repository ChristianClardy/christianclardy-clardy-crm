// Merge-field sources a contract_templates.merge_fields row can bind an
// anchor token to, resolved against a Deal being sent from the Contracts tab
// (PipelineView.jsx). Deals have no direct client_id — the caller resolves
// { deal, client, company, project, estimate, estimateVersion } once (chasing
// deal.lead_id -> lead.linked_contact_id -> client, client.id -> project ->
// deal.lead_id -> lead.company_id -> company_profiles, and client.id ->
// estimate -> its active estimate_version) and passes that context into
// resolveContractMergeValue for every mapped field.
//
// This same list backs the read-only merge field library shown in
// Settings -> Templates -> Merge Fields, so `label` and `description` here
// are user-facing copy, not just dropdown text.

export const MERGE_SOURCES = [
  { value: "client.name",          label: "Client — Name",             group: "Client",   description: "Client's full name." },
  { value: "client.contact_person",label: "Client — Contact Person",   group: "Client",   description: "Named contact at the client, if different from the client name." },
  { value: "client.email",         label: "Client — Email",            group: "Client",   description: "Client's email address." },
  { value: "client.phone",         label: "Client — Phone",            group: "Client",   description: "Client's phone number." },
  { value: "client.address",       label: "Client — Address",          group: "Client",   description: "Client's mailing/site address." },
  { value: "client.company",       label: "Client — Business Name",    group: "Client",   description: "Business name on the client record (if the client is a company, not an individual)." },

  { value: "deal.title",           label: "Deal — Title",              group: "Deal",     description: "Name of the deal in the pipeline." },
  { value: "deal.value",           label: "Deal — Value ($)",          group: "Deal",     description: "Deal value, formatted as currency." },
  { value: "deal.stage",           label: "Deal — Stage",              group: "Deal",     description: "Current pipeline stage (Lead, Qualified, Proposal, etc.)." },
  { value: "deal.probability",     label: "Deal — Probability (%)",    group: "Deal",     description: "Win probability percentage." },
  { value: "deal.close_date",      label: "Deal — Close Date",         group: "Deal",     description: "Expected or actual close date." },
  { value: "deal.assigned_to",     label: "Deal — Assigned To",        group: "Deal",     description: "Rep assigned to the deal." },
  { value: "deal.description",     label: "Deal — Description",        group: "Deal",     description: "Free-text deal notes/scope." },

  { value: "company.name",         label: "Company — Name",            group: "Company",  description: "Your company's name (the org sending the contract)." },
  { value: "company.address",      label: "Company — Address",         group: "Company",  description: "Your company's address." },
  { value: "company.phone",        label: "Company — Phone",           group: "Company",  description: "Your company's phone number." },
  { value: "company.email",        label: "Company — Email",           group: "Company",  description: "Your company's email address." },
  { value: "company.website",      label: "Company — Website",         group: "Company",  description: "Your company's website URL." },
  { value: "company.license",      label: "Company — License #",       group: "Company",  description: "Your company's contractor license number." },

  { value: "project.name",         label: "Project — Name",            group: "Project",  description: "Name of the linked project, if the client has one on file." },
  { value: "project.address",      label: "Project — Address",         group: "Project",  description: "Job/project site address." },
  { value: "project.status",       label: "Project — Status",          group: "Project",  description: "Project status (planning, in_progress, etc.)." },
  { value: "project.manager",      label: "Project — Manager",         group: "Project",  description: "Assigned project manager." },
  { value: "project.contract_value", label: "Project — Contract Value ($)", group: "Project", description: "Total contract value on the project record, formatted as currency." },
  { value: "project.start_date",   label: "Project — Start Date",      group: "Project",  description: "Planned or actual start date." },
  { value: "project.end_date",     label: "Project — End Date",        group: "Project",  description: "Planned or actual end date." },

  { value: "estimate.number",      label: "Estimate — Number",         group: "Estimate", description: "Estimate number, if the client has an estimate on file." },
  { value: "estimate.title",       label: "Estimate — Title",          group: "Estimate", description: "Estimate title." },
  { value: "estimate.total",       label: "Estimate — Total ($)",      group: "Estimate", description: "Total price from the estimate's active version, formatted as currency." },
  { value: "estimate.issue_date",  label: "Estimate — Issue Date",     group: "Estimate", description: "Date the estimate was issued." },
  { value: "estimate.expiry_date", label: "Estimate — Expiry Date",    group: "Estimate", description: "Date the estimate expires." },
  { value: "estimate.terms",       label: "Estimate — Terms",          group: "Estimate", description: "Payment/terms text on the estimate." },

  { value: "selections.equipment_schedule",     label: "Selections — Equipment Schedule",        group: "Pool Selections", description: "Pump/filter/heater/etc. manufacturer, model, and warranty — one line per item, from the project's Pool Selections tab." },
  { value: "selections.finish_selections",      label: "Selections — Finish & Material Selections", group: "Pool Selections", description: "Interior finish, tile, coping, decking, etc. product and color — one line per item." },
  { value: "selections.allowances_schedule",    label: "Selections — Allowances Schedule",       group: "Pool Selections", description: "Tile/coping/interior finish/decking/landscaping allowances — one line per item, with amounts." },
  { value: "selections.allowances_total",       label: "Selections — Allowances Total ($)",      group: "Pool Selections", description: "Sum of all allowance amounts." },
  { value: "selections.payment_schedule",       label: "Selections — Payment Schedule",          group: "Pool Selections", description: "The milestone payment schedule — one line per milestone, with amounts." },
  { value: "selections.payment_schedule_total", label: "Selections — Payment Schedule Total ($)", group: "Pool Selections", description: "Sum of all payment-schedule amounts." },
  { value: "selections.interior_finish_product",label: "Selections — Interior Finish Product",   group: "Pool Selections", description: "Interior finish manufacturer/product." },
  { value: "selections.interior_finish_color",  label: "Selections — Interior Finish Color",     group: "Pool Selections", description: "Interior finish color/finish." },
  { value: "selections.tile_product",           label: "Selections — Tile Product",              group: "Pool Selections", description: "Waterline tile manufacturer/product." },
  { value: "selections.tile_color",             label: "Selections — Tile Color/Style",          group: "Pool Selections", description: "Waterline tile color/style." },
  { value: "selections.coping_material",        label: "Selections — Coping Material",           group: "Pool Selections", description: "Coping material." },
  { value: "selections.decking_material",       label: "Selections — Decking Material",          group: "Pool Selections", description: "Decking material." },
  { value: "selections.decking_color",          label: "Selections — Decking Color/Finish",      group: "Pool Selections", description: "Decking color/finish." },
  { value: "selections.water_features",         label: "Selections — Water Features",            group: "Pool Selections", description: "Free-text description of included water features." },
  { value: "selections.other_improvements",     label: "Selections — Other Improvements",        group: "Pool Selections", description: "Free-text description of other improvements included in the project." },
  { value: "selections.notes",                  label: "Selections — Notes",                     group: "Pool Selections", description: "Free-text selection notes." },

  { value: "today",                label: "Today's Date",              group: "Other",    description: "Today's date, e.g. \"January 1, 2026\"." },
];

function formatCurrency(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// Looks up a row in selections.finishes by its item label (e.g. "Waterline
// Tile") — the finish/material rows are keyed by label, not a fixed field
// name, since PoolSelectionsPanel lets rows be renamed/added.
function findFinish(selections, itemLabel) {
  return (selections?.finishes || []).find((f) => (f.item || "").toLowerCase() === itemLabel.toLowerCase());
}

function formatEquipmentSchedule(selections) {
  return (selections?.equipment || [])
    .filter((r) => r.manufacturer || r.model || r.warranty)
    .map((r) => `${r.equipment}: ${r.manufacturer || "—"}${r.model ? ` ${r.model}` : ""}${r.warranty ? ` (warranty: ${r.warranty})` : ""}`)
    .join("\n");
}

function formatFinishSelections(selections) {
  return (selections?.finishes || [])
    .filter((r) => r.manufacturer_product || r.color_finish)
    .map((r) => `${r.item}: ${r.manufacturer_product || "—"}${r.color_finish ? ` — ${r.color_finish}` : ""}`)
    .join("\n");
}

function formatAmountSchedule(rows, labelField) {
  return (rows || [])
    .filter((r) => r[labelField] && Number(r.amount) > 0)
    .map((r) => `${r[labelField]}: ${formatCurrency(r.amount)}`)
    .join("\n");
}

function sumAmounts(rows) {
  return (rows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

export function resolveContractMergeValue(source, { deal, client, company, project, estimate, estimateVersion, selections } = {}) {
  switch (source) {
    case "client.name":              return client?.name || "";
    case "client.contact_person":    return client?.contact_person || "";
    case "client.email":             return client?.email || "";
    case "client.phone":             return client?.phone || "";
    case "client.address":           return client?.address || "";
    case "client.company":           return client?.company || "";

    case "deal.title":               return deal?.title || "";
    case "deal.value":               return deal?.value != null ? formatCurrency(deal.value) : "";
    case "deal.stage":               return deal?.stage || "";
    case "deal.probability":         return deal?.probability != null ? `${deal.probability}%` : "";
    case "deal.close_date":          return deal?.close_date || "";
    case "deal.assigned_to":         return deal?.assigned_to || "";
    case "deal.description":         return deal?.description || "";

    case "company.name":             return company?.invoice_company_name || company?.name || "";
    case "company.address":          return company?.address || "";
    case "company.phone":            return company?.phone || "";
    case "company.email":            return company?.email || "";
    case "company.website":          return company?.website || "";
    case "company.license":          return company?.license_number || "";

    case "project.name":             return project?.name || "";
    case "project.address":          return project?.address || "";
    case "project.status":           return project?.status || "";
    case "project.manager":          return project?.project_manager || "";
    case "project.contract_value":   return project?.contract_value != null ? formatCurrency(project.contract_value) : "";
    case "project.start_date":       return project?.start_date || "";
    case "project.end_date":         return project?.end_date || "";

    case "estimate.number":          return estimate?.estimate_number || "";
    case "estimate.title":           return estimate?.title || "";
    case "estimate.total":           return estimateVersion?.total_price != null ? formatCurrency(estimateVersion.total_price) : "";
    case "estimate.issue_date":      return estimate?.issue_date || "";
    case "estimate.expiry_date":     return estimate?.expiry_date || "";
    case "estimate.terms":           return estimate?.terms || "";

    case "selections.equipment_schedule":      return formatEquipmentSchedule(selections);
    case "selections.finish_selections":       return formatFinishSelections(selections);
    case "selections.allowances_schedule":     return formatAmountSchedule(selections?.allowances, "item");
    case "selections.allowances_total":        return formatCurrency(sumAmounts(selections?.allowances));
    case "selections.payment_schedule":        return formatAmountSchedule(selections?.payment_schedule, "milestone");
    case "selections.payment_schedule_total":  return formatCurrency(sumAmounts(selections?.payment_schedule));
    case "selections.interior_finish_product": return findFinish(selections, "Interior Finish")?.manufacturer_product || "";
    case "selections.interior_finish_color":   return findFinish(selections, "Interior Finish")?.color_finish || "";
    case "selections.tile_product":            return findFinish(selections, "Waterline Tile")?.manufacturer_product || "";
    case "selections.tile_color":              return findFinish(selections, "Waterline Tile")?.color_finish || "";
    case "selections.coping_material":         return findFinish(selections, "Coping")?.manufacturer_product || "";
    case "selections.decking_material":        return findFinish(selections, "Decking")?.manufacturer_product || "";
    case "selections.decking_color":           return findFinish(selections, "Decking")?.color_finish || "";
    case "selections.water_features":          return selections?.water_features || "";
    case "selections.other_improvements":      return selections?.other_improvements || "";
    case "selections.notes":                   return selections?.notes || "";

    case "today":                    return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    default:                         return "";
  }
}
