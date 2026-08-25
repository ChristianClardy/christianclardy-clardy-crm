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

  { value: "today",                label: "Today's Date",              group: "Other",    description: "Today's date, e.g. \"January 1, 2026\"." },
];

function formatCurrency(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function resolveContractMergeValue(source, { deal, client, company, project, estimate, estimateVersion } = {}) {
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

    case "today":                    return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    default:                         return "";
  }
}
