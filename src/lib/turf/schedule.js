import { TURF_COMPANY_ID, stageLabel } from "./constants.js";
import { sumPayments } from "./money.js";
import { isSoldEstimate, isSoldLead, projectToInstallStage } from "./stages.js";

export function customerName(customers, order) {
  const match = (customers || []).find((customer) => customer.id === order?.customer_id);
  return match?.name || order?.bill_to_name || order?.contact_name || "No customer";
}

function jobItem(job) {
  return {
    id: `job:${job.id}`,
    kind: "job",
    track: "install",
    recordId: job.id,
    title: job.name || "Install",
    customer: job.customer_name || "No customer",
    status: job.stage || "lead",
    date: job.scheduled_on || null,
    crew: job.crew || "",
    notes: job.notes || "",
    nextAction: job.next_action || "",
    address: job.address || "",
    projectId: job.project_id || null,
    sell: job.sell_amount ?? null,
    cost: job.cost_amount ?? null,
    materials: job.materials || "",
    orderId: job.distribution_order_id || null,
  };
}

function leadItem(lead) {
  return {
    id: `lead:${lead.id}`,
    kind: "lead",
    track: "install",
    recordId: lead.id,
    title: lead.full_name || "Lead",
    customer: lead.full_name || "No customer",
    status: "approved",
    date: null,
    crew: "",
    notes: lead.project_description || lead.notes || "",
    nextAction: lead.next_action || "",
    address: lead.property_address || lead.address || "",
    sell: lead.estimated_budget ?? null,
    cost: null,
    materials: "",
    orderId: null,
  };
}

function projectItem(project, collected) {
  return {
    id: `project:${project.id}`,
    kind: "project",
    track: "install",
    recordId: project.id,
    title: project.name || "Project",
    customer: project.name || "No customer",
    status: projectToInstallStage(project, collected),
    date: project.start_date || null,
    crew: project.project_manager || "",
    notes: project.notes || "",
    nextAction: "",
    address: project.address || "",
    sell: project.contract_value ?? null,
    cost: project.costs_to_date ?? null,
    materials: "",
    orderId: null,
  };
}

function orderItem(order, customers) {
  return {
    id: `order:${order.id}`,
    kind: "order",
    track: "distribution",
    recordId: order.id,
    title: order.order_number || order.bill_to_name || "Material order",
    customer: customerName(customers, order),
    status: order.status || "quote",
    date: order.schedule_date || null,
    crew: order.crew || "",
    notes: order.notes || "",
    nextAction: order.next_action || "",
    address: order.deliver_to || order.bill_to_address || "",
    sell: null,
    cost: null,
    materials: "",
    orderId: order.id,
  };
}

function norm(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function projectDate(project, events) {
  if (project.start_date) return String(project.start_date).slice(0, 10);
  const dated = (events || [])
    .filter((event) => event.project_id === project.id || event.linked_project_id === project.id)
    .map((event) => String(event.start_datetime || "").slice(0, 10))
    .filter((day) => day.length === 10)
    .sort();
  return dated[0] || null;
}

function leadDate(lead, events) {
  const dated = (events || [])
    .filter((event) => event.lead_id === lead.id)
    .map((event) => String(event.start_datetime || "").slice(0, 10))
    .filter((day) => day.length === 10)
    .sort();
  return dated[0] || null;
}

function estimateItem(estimate) {
  return {
    id: `estimate:${estimate.id}`,
    kind: "estimate",
    track: "install",
    recordId: estimate.id,
    title: estimate.title || "Estimate",
    customer: estimate.title || "No customer",
    status: "approved",
    date: null,
    crew: "",
    notes: estimate.notes || "",
    nextAction: "",
    address: "",
    sell: estimate.total ?? null,
    cost: null,
    materials: "",
    orderId: null,
  };
}

// Existing Turf'n Texas work, not only rows created in the turf tables:
// every project for the company, plus sold leads and sold estimates that
// are not already that project. A start date or a calendar event puts the
// job on the calendar. Everything else stays in the unscheduled report.
export function allScheduleItems(model) {
  const jobs = model?.jobs || [];
  const projects = model?.projects || [];
  const events = model?.events || [];
  const linkedLeads = new Set(jobs.map((job) => job.lead_id).filter(Boolean));
  const linkedProjects = new Set(jobs.map((job) => job.project_id).filter(Boolean));
  const projectNames = new Set(projects.map((project) => norm(project.name)));
  const projectClients = new Set(projects.map((project) => project.client_id).filter(Boolean));
  const items = jobs.map(jobItem);

  for (const project of projects) {
    if (linkedProjects.has(project.id)) continue;
    const collected = sumPayments(model.payments, (payment) => payment.linked_job_id === project.id);
    const item = projectItem(project, collected);
    item.date = projectDate(project, events);
    if (project.status === "cancelled") item.status = "cancelled";
    items.push(item);
  }

  for (const lead of model?.leads || []) {
    if (!isSoldLead(lead.status) || linkedLeads.has(lead.id)) continue;
    if (lead.linked_contact_id && projectClients.has(lead.linked_contact_id)) continue;
    if (projectNames.has(norm(lead.full_name))) continue;
    const item = leadItem(lead);
    item.status = "approved";
    item.date = leadDate(lead, events);
    items.push(item);
  }

  for (const estimate of model?.estimates || []) {
    if (!isSoldEstimate(estimate.status)) continue;
    if (estimate.project_id && (linkedProjects.has(estimate.project_id) || projects.some((project) => project.id === estimate.project_id))) continue;
    items.push(estimateItem(estimate));
  }

  for (const order of model?.orders || []) {
    items.push(orderItem(order, model.customers));
  }

  return items.map((item) => ({ ...item, statusLabel: stageLabel(item.track, item.status) }));
}

export function matchesScheduleFilter(item, filters = {}) {
  if (filters.track && filters.track !== "all" && item.track !== filters.track) return false;
  if (filters.stage && filters.stage !== "all" && item.status !== filters.stage) return false;
  if (filters.customer && filters.customer !== "all" && item.customer !== filters.customer) return false;
  return true;
}

export function splitSchedule(model, filters) {
  const items = allScheduleItems(model).filter((item) => matchesScheduleFilter(item, filters));
  return {
    dated: items.filter((item) => item.date).sort(byDateThenTitle),
    undated: items.filter((item) => !item.date).sort(byTitle),
  };
}

function byDateThenTitle(a, b) {
  if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
  return byTitle(a, b);
}

function byTitle(a, b) {
  return String(a.title).localeCompare(String(b.title));
}

export function scheduleCensus(model) {
  const items = allScheduleItems(model).filter((item) => item.track === "install");
  const fromDatabase = items.filter((item) => item.kind === "project" || item.kind === "lead" || item.kind === "estimate");
  return {
    shown: fromDatabase.length,
    dated: fromDatabase.filter((item) => item.date).length,
    undated: fromDatabase.filter((item) => !item.date).length,
    projects: (model?.projects || []).length,
    soldLeads: (model?.leads || []).filter((lead) => isSoldLead(lead.status)).length,
    soldEstimates: (model?.estimates || []).filter((estimate) => isSoldEstimate(estimate.status)).length,
  };
}

export function customerOptions(items) {
  return [...new Set(items.map((item) => item.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function groupUndated(items, group) {
  if (group === "customer") {
    const names = [...new Set(items.map((item) => item.customer || "No customer"))].sort((a, b) => a.localeCompare(b));
    return names.map((name) => ({
      key: name,
      label: name,
      items: items.filter((item) => (item.customer || "No customer") === name),
    }));
  }
  if (group === "none") return [{ key: "all", label: "Unscheduled", items }];
  return [
    { key: "install", label: "Install", items: items.filter((item) => item.track === "install") },
    { key: "distribution", label: "Distribution", items: items.filter((item) => item.track === "distribution") },
  ].filter((section) => section.items.length > 0);
}

const INSTALL_COLOR = {
  lead: "bg-emerald-50 text-emerald-950 border-emerald-300",
  bid_sent: "bg-emerald-100 text-emerald-950 border-emerald-400",
  approved: "bg-green-200 text-green-950 border-green-500",
  scheduled: "bg-green-300 text-green-950 border-green-600",
  installed: "bg-emerald-700 text-white border-emerald-800",
  paid: "bg-emerald-900 text-white border-emerald-950",
};

const DISTRIBUTION_COLOR = {
  quote: "bg-amber-50 text-amber-950 border-amber-300",
  ordered: "bg-amber-200 text-amber-950 border-amber-500",
  delivered: "bg-orange-300 text-orange-950 border-orange-500",
  invoiced: "bg-orange-500 text-white border-orange-600",
  paid: "bg-orange-800 text-white border-orange-950",
};

export function entryClass(item) {
  const palette = item.track === "distribution" ? DISTRIBUTION_COLOR : INSTALL_COLOR;
  return palette[item.status] || "bg-slate-100 text-slate-800 border-slate-300";
}

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Local stand-in for a saved schedule edit. Dating a lead or a project files
// a turf install job and leaves the lead/project row alone.
export function applySchedulePatch(model, entry, patch = {}) {
  const date = Object.prototype.hasOwnProperty.call(patch, "date") ? (patch.date || null) : entry.date;
  if (entry.kind === "order") {
    return {
      ...model,
      orders: (model.orders || []).map((order) => (order.id === entry.recordId ? {
        ...order,
        schedule_date: date,
        crew: patch.crew ?? order.crew,
        status: patch.status ?? order.status,
        notes: patch.notes ?? order.notes,
        next_action: patch.nextAction ?? order.next_action,
      } : order)),
    };
  }
  if (entry.kind === "job") {
    return {
      ...model,
      jobs: (model.jobs || []).map((job) => (job.id === entry.recordId ? {
        ...job,
        scheduled_on: date,
        crew: patch.crew ?? job.crew,
        stage: patch.status ?? job.stage,
        notes: patch.notes ?? job.notes,
        next_action: patch.nextAction ?? job.next_action,
      } : job)),
    };
  }
  const job = {
    id: patch.newId || newId(),
    company_id: TURF_COMPANY_ID,
    lead_id: entry.kind === "lead" ? entry.recordId : null,
    project_id: entry.kind === "project" ? entry.recordId : null,
    name: entry.title,
    customer_name: entry.customer,
    address: entry.address || "",
    stage: patch.status || entry.status || "lead",
    scheduled_on: date,
    crew: patch.crew ?? entry.crew ?? "",
    notes: patch.notes ?? entry.notes ?? "",
    next_action: patch.nextAction ?? entry.nextAction ?? "",
    sell_amount: entry.sell ?? null,
    cost_amount: entry.cost ?? null,
    materials: entry.materials || "",
    distribution_order_id: null,
  };
  return { ...model, jobs: [...(model.jobs || []), job] };
}
