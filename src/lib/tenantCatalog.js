import { supabase } from "@/lib/supabase";

// Clardy Construction, LLC. Same id as staff_org_id() in the database.
export const FOUNDING_ORG_ID = "2c9485d2-9b17-48d4-bea7-72770c1e9eb9";

// Modules a tenant can turn on. distribution and install are the slots for
// the Turf'n Texas work (inventory/deliveries, and job installs).
export const TENANT_MODULES = [
  { key: "crm", label: "CRM", group: "Sales", description: "Leads, pipeline, contacts, and clients." },
  { key: "estimating", label: "Estimating", group: "Sales", description: "Estimates and price lists." },
  { key: "messaging", label: "Messaging", group: "Sales", description: "Email, text, and follow-up drips." },
  { key: "projects", label: "Projects", group: "Jobs", description: "Jobs, schedules, files, and photos." },
  { key: "builder", label: "Builder portal", group: "Jobs", description: "Daily logs, punch lists, and inspections." },
  { key: "subcontractors", label: "Subcontractors", group: "Jobs", description: "Sub agreements and the sub portal." },
  { key: "install", label: "Install tracking", group: "Jobs", description: "Crew installs. Turns on with the Turf'n Texas install module." },
  { key: "invoicing", label: "Invoicing", group: "Money", description: "Invoices, payments, and finance. Job payments stay the record of truth." },
  { key: "distribution", label: "Distribution & inventory", group: "Operations", description: "Warehouses, stock, and deliveries. Turns on with the distribution module." },
  { key: "purchasing", label: "Purchasing", group: "Operations", description: "Purchase orders and vendors." },
  { key: "time_tracking", label: "Time tracking", group: "Operations", description: "Payroll-ready time. No payroll run in this release." },
  { key: "documents", label: "Documents", group: "Office", description: "Files, contracts, and templates." },
  { key: "calendar", label: "Calendar", group: "Office", description: "Schedule and appointments." },
];

export const TENANT_MODULE_KEYS = TENANT_MODULES.map((m) => m.key);

// Which tenant module a page needs. Pages not listed stay available.
export const PAGE_TENANT_MODULE = {
  SalesDashboard: "crm",
  CRM: "crm", Pipeline: "crm", CRMContacts: "crm", CRMCompanies: "crm", CRMActivities: "crm", CRMDashboard: "crm",
  Clients: "crm", ClientDetail: "crm", Prospects: "crm", LeadDetail: "crm",
  Estimates: "estimating", EstimateDetail: "estimating",
  Automations: "messaging",
  Projects: "projects", ProjectDetail: "projects",
  Builder: "builder", ProjectManagerDashboard: "builder",
  BuilderPortal: "subcontractors",
  Payments: "invoicing", InvoiceDesigner: "invoicing", FinanceDashboard: "invoicing",
  Documents: "documents",
  Calendar: "calendar",
};

// Role-permission module (permissions.js) → tenant module. A tenant that
// turns CRM off hides it even from an admin role.
export const ROLE_MODULE_TENANT = {
  crm: "crm",
  estimates: "estimating",
  automations: "messaging",
  projects: "projects",
  builder_portal: "builder",
  subcontractors: "subcontractors",
  payments: "invoicing",
  finance: "invoicing",
  project_billing: "invoicing",
  documents: "documents",
  calendar: "calendar",
};

// Tables that have organization_id once migration 065 has run. The client
// filters these only after tenant_isolation_enabled() exists, so today's
// database (migration not applied) is unchanged.
export const ORG_ISOLATED_TABLES = new Set([
  "allowances_templates", "assemblies", "attachments", "barrier_daily_logs",
  "calendar_events", "calendar_feed_tokens", "change_orders", "chat_messages",
  "clients", "comments", "company_profiles", "contact_history", "contract_templates",
  "cost_codes", "crm_activities", "crm_companies", "custom_field_definitions",
  "custom_field_values", "customer_portal_users", "data_erasure_log", "deals",
  "designs", "documents", "docusign_credentials", "docusign_envelopes", "draws",
  "employees", "estimate_templates", "estimate_versions", "estimates",
  "followup_log", "followup_rules", "followup_settings", "invoices",
  "job_cost_breakdowns", "lead_follow_ups", "leads", "line_items", "materials",
  "message_enrollments", "message_opt_outs", "message_sequence_steps",
  "message_sequences", "message_settings", "message_templates", "messages",
  "municipalities", "notifications", "organization_invitations", "payment_schedule_rules",
  "payment_schedule_templates", "payments", "permit_inspection_tasks", "permit_updates",
  "pipeline_stages", "pm_portal_users", "pool_selections", "price_list_items",
  "price_lists", "project_photos", "project_sheet_templates", "project_sheets",
  "project_subcontractors", "projects", "punch_list_items", "quickbooks_connection",
  "quickbooks_credentials", "quickbooks_links", "reminders", "scope_templates",
  "selection_allowances", "site_visits", "sub_invoices", "subcontractor_barrier_acknowledgments",
  "subcontractor_portal_users", "subcontractors", "tasks", "tax_rates", "tenant_modules",
  "tenant_settings", "todo_items",
  "turf_customers", "turf_install_jobs", "turf_order_lines", "turf_orders",
  "turf_products", "turf_settings", "turf_supplier_purchases",
  "distribution_customers", "distribution_order_lines", "distribution_orders",
  "distribution_products", "distribution_settings", "distribution_supplier_purchases",
  "operations_jobs",
]);

let isolationPromise = null;
export function tenantIsolationOn() {
  if (!isolationPromise) {
    isolationPromise = supabase.rpc("tenant_isolation_enabled")
      .then(({ data, error }) => !error && data === true)
      .catch(() => false);
  }
  return isolationPromise;
}

export const STRIPE_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_PROFESSIONAL",
  "STRIPE_PRICE_ENTERPRISE",
  "VITE_STRIPE_PUBLISHABLE_KEY",
];

export function subscriptionAllowsUse(subscription) {
  if (!subscription) return true;
  if (!["trialing", "active", "comped"].includes(subscription.status)) return false;
  if (subscription.status === "trialing" && subscription.trial_ends_at) {
    return new Date(subscription.trial_ends_at).getTime() > Date.now();
  }
  return true;
}
