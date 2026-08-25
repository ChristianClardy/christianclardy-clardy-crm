// Fixed list of merge-field sources a contract_templates.merge_fields row can
// bind an anchor token to, resolved against a Deal being sent from the
// Contracts tab (PipelineView.jsx). Deals have no direct client_id — the
// caller resolves { deal, client, company } once (chasing
// deal.lead_id -> lead.linked_contact_id -> client, and
// deal.lead_id -> lead.company_id -> company_profiles) and passes that
// context into resolveContractMergeValue for every mapped field.

export const MERGE_SOURCES = [
  { value: "client.name",     label: "Client — Name" },
  { value: "client.email",    label: "Client — Email" },
  { value: "client.phone",    label: "Client — Phone" },
  { value: "client.address",  label: "Client — Address" },
  { value: "deal.title",      label: "Deal — Title" },
  { value: "deal.value",      label: "Deal — Value ($)" },
  { value: "deal.close_date", label: "Deal — Close Date" },
  { value: "company.name",    label: "Company — Name" },
  { value: "company.address", label: "Company — Address" },
  { value: "company.phone",   label: "Company — Phone" },
  { value: "company.email",   label: "Company — Email" },
  { value: "today",           label: "Today's Date" },
];

function formatCurrency(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function resolveContractMergeValue(source, { deal, client, company } = {}) {
  switch (source) {
    case "client.name":     return client?.name || "";
    case "client.email":    return client?.email || "";
    case "client.phone":    return client?.phone || "";
    case "client.address":  return client?.address || "";
    case "deal.title":      return deal?.title || "";
    case "deal.value":      return deal?.value != null ? formatCurrency(deal.value) : "";
    case "deal.close_date": return deal?.close_date || "";
    case "company.name":    return company?.invoice_company_name || company?.name || "";
    case "company.address": return company?.address || "";
    case "company.phone":   return company?.phone || "";
    case "company.email":   return company?.email || "";
    case "today":            return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    default:                 return "";
  }
}
