// Roles, modules and default permissions: the one list Settings → Roles &
// Permissions edits and the app enforces (useRolePermissions, the sidebar,
// page routes and project tabs). Admins always have everything.
//
// A role's saved switches (company_profiles.settings.role_permissions)
// override these defaults; a module a role has nothing saved for uses the
// default here. Municipalities is also enforced in the database (054).

export const ROLES = [
  { key: "admin",           label: "Admin / Owner",            color: "bg-rose-100 text-rose-700",       blurb: "Everything, including permissions." },
  { key: "office",          label: "Office Manager",           color: "bg-blue-100 text-blue-700",       blurb: "Runs the office: leads, clients, estimates, contracts, billing and payments." },
  { key: "bookkeeper",      label: "Bookkeeper",               color: "bg-emerald-100 text-emerald-700", blurb: "Money: billing, payments, AP, job costs, finance and reports." },
  { key: "sales",           label: "Sales / Estimator",        color: "bg-cyan-100 text-cyan-700",       blurb: "Leads to signed contract: CRM, estimates, contracts." },
  { key: "designer",        label: "Designer",                 color: "bg-fuchsia-100 text-fuchsia-700", blurb: "Design appointments, leads assigned to them, estimates and selections." },
  { key: "project_manager", label: "Project Manager",          color: "bg-violet-100 text-violet-700",   blurb: "Runs jobs: schedule, subs, change orders, job costs." },
  { key: "foreman",         label: "Superintendent / Foreman", color: "bg-amber-100 text-amber-700",     blurb: "On site: schedule, daily logs, punch list, documents. No money." },
  { key: "laborer",         label: "Field Crew",               color: "bg-slate-100 text-slate-600",     blurb: "Their calendar and job documents. No money." },
  { key: "other",           label: "Other",                    color: "bg-slate-100 text-slate-500",     blurb: "Nothing until switched on." },
];

export const MODULE_GROUPS = [
  { label: "Sales", modules: [
    { key: "dashboard",        label: "Dashboard",              description: "Company overview and to-dos" },
    { key: "sales_dashboard",  label: "Sales Dashboard",        description: "Pipeline numbers and sales activity" },
    { key: "crm",              label: "CRM & Clients",          description: "Leads, pipeline, contacts, companies, activities, clients" },
    { key: "estimates",        label: "Estimates",              description: "Build, price and send estimates" },
    { key: "contracts",        label: "Contracts",              description: "Send contracts and documents for signature (DocuSign)" },
  ]},
  { label: "Jobs", modules: [
    { key: "projects",         label: "Projects",               description: "Projects: overview, schedule, permits, selections, photos, files, comments" },
    { key: "builder_portal",   label: "Builder Portal",         description: "Job board, daily logs, punch lists, inspections" },
    { key: "change_orders",    label: "Change Orders",          description: "Create and send change orders on a project" },
    { key: "subcontractors",   label: "Subcontractor Portal",   description: "Sub compliance, agreements, fence logs, sub app access" },
    { key: "municipalities",   label: "Municipalities",         description: "Permit portal logins and passwords" },
  ]},
  { label: "Money", modules: [
    { key: "job_costs",        label: "Job Costs & Profit",     description: "A project's Job Cost tab: estimated vs actual cost, projected profit" },
    { key: "project_billing",  label: "Project Billing & AP",   description: "A project's Billing and AP & Cash tabs: draws, payments, sub invoices" },
    { key: "payments",         label: "Payments & Invoices",    description: "The Payments page: invoices and payments across all jobs" },
    { key: "finance",          label: "Finance Dashboard",      description: "Cash, receivables, payables and profit across the company" },
    { key: "reports",          label: "Reports & WIP",          description: "Financial and operational reports, WIP" },
  ]},
  { label: "Resources", modules: [
    { key: "calendar",         label: "Calendar",               description: "Company calendar and appointments" },
    { key: "documents",        label: "Documents",              description: "Company document library" },
    { key: "material_library", label: "Material Library",       description: "Add, edit and delete materials and prices" },
    { key: "workspace_items",  label: "Workspace Items",        description: "Shared workspace items" },
  ]},
  { label: "Admin", modules: [
    { key: "settings",         label: "Settings",               description: "Team, invites, companies, templates, integrations (permissions stay admin-only)" },
  ]},
];
export const MODULES = MODULE_GROUPS.flatMap((g) => g.modules);

// Recommended starting point for a residential pool / outdoor living builder.
const on = (...keys) => Object.fromEntries(MODULES.map((m) => [m.key, keys.includes(m.key)]));
export const DEFAULT_PERMISSIONS = {
  admin:           on(...MODULES.map((m) => m.key)),
  office:          on("dashboard", "sales_dashboard", "crm", "estimates", "contracts", "projects", "change_orders", "project_billing", "payments", "calendar", "documents", "material_library", "workspace_items"),
  bookkeeper:      on("dashboard", "projects", "job_costs", "project_billing", "payments", "finance", "reports", "documents", "calendar"),
  sales:           on("dashboard", "sales_dashboard", "crm", "estimates", "contracts", "projects", "calendar", "documents", "material_library"),
  designer:        on("dashboard", "crm", "estimates", "projects", "calendar", "documents", "material_library"),
  project_manager: on("dashboard", "projects", "builder_portal", "change_orders", "contracts", "subcontractors", "job_costs", "calendar", "documents", "material_library", "workspace_items"),
  foreman:         on("dashboard", "projects", "builder_portal", "subcontractors", "calendar", "documents", "workspace_items"),
  laborer:         on("calendar", "documents"),
  other:           on(),
};

// Which module each page needs (pages not listed are open to all staff:
// My To-dos, Team Chat). Several pages can need the same module.
export const PAGE_MODULE = {
  Dashboard: "dashboard", OperationsDashboard: "dashboard", Home: "dashboard", HomePage: "dashboard",
  SalesDashboard: "sales_dashboard",
  CRM: "crm", Pipeline: "crm", CRMContacts: "crm", CRMCompanies: "crm", CRMActivities: "crm", CRMDashboard: "crm",
  Clients: "crm", ClientDetail: "crm", Prospects: "crm", LeadDetail: "crm",
  Estimates: "estimates", EstimateDetail: "estimates",
  Projects: "projects", ProjectDetail: "projects", ProjectManagerDashboard: "builder_portal",
  Builder: "builder_portal",
  BuilderPortal: "subcontractors",
  Municipalities: "municipalities",
  Payments: "payments", InvoiceDesigner: "payments",
  FinanceDashboard: "finance",
  Reports: "reports", WIPReport: "reports",
  Calendar: "calendar",
  Documents: "documents",
  WorkplaceItems: "workspace_items",
  Settings: "settings",
};

// Project tabs that need more than "projects".
export const PROJECT_TAB_MODULE = {
  contracts: "contracts",
  changeorders: "change_orders",
  financials: "job_costs",
  cashflow: "project_billing",
  accounting: "project_billing",
};

// Where to send someone whose start page they can't open.
export const LANDING_ORDER = ["Dashboard", "Projects", "Builder", "CRM", "Calendar", "Documents", "MyTodos"];
