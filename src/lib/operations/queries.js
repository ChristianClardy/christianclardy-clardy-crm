import { supabase } from "@/lib/supabase";
import { CLARDY_ORG_ID, TURF_COMPANY_ID } from "@/lib/turf/constants";
import { isMissingTurfSchema } from "@/lib/turf/queries";
import { newId } from "@/lib/turf/schedule";

const JOB_COLUMNS = "id, company_id, name, customer_name, address, stage, crew, scheduled_on, materials, next_action, notes, sell_amount, cost_amount, lead_id, project_id, distribution_order_id";
const ORDER_COLUMNS = "id, company_id, customer_id, order_number, status, contact_name, bill_to_name, bill_to_address, deliver_to, delivery_fee, tax_rate, payment_method, invoice_date, schedule_date, crew, next_action, notes";
const STAGES = new Set(["lead", "bid_sent", "approved", "scheduled", "installed", "paid"]);
const MIGRATION = "Apply supabase/migrations/067_company_operations.sql before saving this. It has not been run.";

function fail(error) {
  if (!error) return;
  if (isMissingTurfSchema(error)) throw new Error(MIGRATION);
  throw error;
}

async function readOptional(query) {
  const result = await query;
  if (!result.error) return result.data;
  if (isMissingTurfSchema(result.error)) return null;
  throw result.error;
}

function numeric(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function assertGeneric(companyId) {
  if (companyId === TURF_COMPANY_ID) {
    throw new Error("Turf'n Texas keeps its orders in the turf tables.");
  }
}

function defaultSettings(company) {
  return {
    company_id: company?.id,
    company_name: company?.name || "Company",
    remit_name: company?.name || "",
    remit_address: company?.address || "",
    thank_you: "We appreciate your business. Please find your invoice details here. Feel free to contact us if you have any questions.",
    signature_name: "",
    tax_rate: 0.0825,
    default_delivery: null,
  };
}

async function loadPayments(companyId) {
  const full = "id, amount_received, payment_date, payment_method, reference_number, notes, linked_job_id, turf_order_id, turf_install_job_id, distribution_order_id, operations_job_id, company_id";
  let payments = await supabase.from("payments").select(full).eq("company_id", companyId);
  if (payments.error && isMissingTurfSchema(payments.error)) {
    payments = await supabase.from("payments").select("id, amount_received, payment_date, payment_method, reference_number, notes, linked_job_id, company_id").eq("company_id", companyId);
  }
  fail(payments.error);
  return payments.data || [];
}

// Projects, sold leads, and estimates for this company, plus generic
// orders when distribution is on. Turf'n Texas does not use this loader.
export async function loadOperations(companyId, { distribution = false, company = null } = {}) {
  assertGeneric(companyId);
  const [jobs, leads, projects, estimates, events, profile] = await Promise.all([
    readOptional(supabase.from("operations_jobs").select(JOB_COLUMNS).eq("company_id", companyId).order("created_at")),
    supabase.from("leads").select("id, full_name, status, company_id, property_address, address, next_action, estimated_budget, phone, email, project_description, notes, linked_contact_id").eq("company_id", companyId),
    supabase.from("projects").select("id, name, status, company_id, address, contract_value, costs_to_date, start_date, end_date, project_manager, client_id, notes").eq("company_id", companyId),
    supabase.from("estimates").select("id, title, status, company_id, project_id, client_id, total, issue_date, notes").eq("company_id", companyId),
    supabase.from("calendar_events").select("id, title, start_datetime, project_id, linked_project_id, lead_id, company_id").eq("company_id", companyId),
    company
      ? Promise.resolve({ data: company, error: null })
      : supabase.from("company_profiles").select("id, name, address, organization_id").eq("id", companyId).maybeSingle(),
  ]);
  fail(leads.error);
  fail(projects.error);
  fail(estimates.error);
  fail(events.error);
  fail(profile.error);

  let settings = null;
  let customers = [];
  let products = [];
  let orders = [];
  let lines = [];
  let purchases = [];
  let distributionReady = false;
  if (distribution) {
    const [settingsRow, customerRows, productRows, orderRows, purchaseRows] = await Promise.all([
      readOptional(supabase.from("distribution_settings").select("*").eq("company_id", companyId).maybeSingle()),
      readOptional(supabase.from("distribution_customers").select("*").eq("company_id", companyId).order("name")),
      readOptional(supabase.from("distribution_products").select("*").eq("company_id", companyId).order("sort_order")),
      readOptional(supabase.from("distribution_orders").select(ORDER_COLUMNS).eq("company_id", companyId).order("created_at", { ascending: false })),
      readOptional(supabase.from("distribution_supplier_purchases").select("*").eq("company_id", companyId).order("created_at")),
    ]);
    distributionReady = settingsRow !== null || customerRows !== null || orderRows !== null;
    settings = settingsRow;
    customers = customerRows || [];
    products = productRows || [];
    orders = orderRows || [];
    purchases = purchaseRows || [];
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length && distributionReady) {
      const lineRows = await readOptional(
        supabase.from("distribution_order_lines").select("*").in("order_id", orderIds).order("sort_order"),
      );
      const ids = new Set(orderIds);
      lines = (lineRows || []).filter((line) => ids.has(line.order_id));
    }
  }

  const payments = await loadPayments(companyId);
  const profileRow = profile.data;
  return {
    settings: settings || defaultSettings(profileRow),
    customers,
    products,
    orders,
    lines,
    purchases,
    jobs: jobs || [],
    leads: leads.data || [],
    projects: projects.data || [],
    estimates: estimates.data || [],
    events: events.data || [],
    payments,
    company: profileRow,
    organizationId: profileRow?.organization_id || CLARDY_ORG_ID,
    schemaReady: jobs !== null,
    distributionReady: distribution ? distributionReady : true,
  };
}

function orgOf(model) {
  return model?.organizationId || CLARDY_ORG_ID;
}

export async function saveOperationsJob(companyId, job, organizationId) {
  assertGeneric(companyId);
  const stage = STAGES.has(job.stage) ? job.stage : "approved";
  const row = {
    id: job.id || newId(),
    company_id: companyId,
    organization_id: organizationId || CLARDY_ORG_ID,
    name: job.name || "Job",
    customer_name: job.customer_name || null,
    address: job.address || null,
    stage,
    crew: job.crew || null,
    scheduled_on: dateOrNull(job.scheduled_on),
    materials: job.materials || null,
    next_action: job.next_action || null,
    notes: job.notes || null,
    sell_amount: numeric(job.sell_amount),
    cost_amount: numeric(job.cost_amount),
    lead_id: job.lead_id || null,
    project_id: job.project_id || null,
    distribution_order_id: job.distribution_order_id || null,
  };
  const { error } = await supabase.from("operations_jobs").upsert(row);
  fail(error);
  return row;
}

export async function saveDistributionOrder(companyId, order, lines, organizationId) {
  assertGeneric(companyId);
  const row = {
    id: order.id || newId(),
    company_id: companyId,
    organization_id: organizationId || CLARDY_ORG_ID,
    customer_id: order.customer_id || null,
    order_number: order.order_number || "Order",
    status: order.status || "quote",
    contact_name: order.contact_name || null,
    bill_to_name: order.bill_to_name || null,
    bill_to_address: order.bill_to_address || null,
    deliver_to: order.deliver_to || null,
    delivery_fee: numeric(order.delivery_fee),
    tax_rate: numeric(order.tax_rate) ?? 0.0825,
    payment_method: order.payment_method || "Check",
    invoice_date: dateOrNull(order.invoice_date),
    schedule_date: dateOrNull(order.schedule_date),
    crew: order.crew || null,
    next_action: order.next_action || null,
    notes: order.notes || null,
  };
  const { error } = await supabase.from("distribution_orders").upsert(row);
  fail(error);
  const kept = [];
  for (const [index, line] of (lines || []).entries()) {
    const saved = {
      id: line.id || newId(),
      order_id: row.id,
      organization_id: row.organization_id,
      product_id: line.product_id || null,
      description: line.description || "Item",
      detail: line.detail || null,
      unit: line.unit || null,
      qty: numeric(line.qty) ?? 0,
      rate: line.rate_unknown ? null : numeric(line.rate),
      unit_cost: line.cost_unknown ? null : numeric(line.unit_cost),
      rate_unknown: !!line.rate_unknown || line.rate == null || line.rate === "",
      cost_unknown: !!line.cost_unknown || line.unit_cost == null || line.unit_cost === "",
      sort_order: index + 1,
    };
    const { error: lineError } = await supabase.from("distribution_order_lines").upsert(saved);
    fail(lineError);
    kept.push(saved.id);
  }
  const leftover = await supabase.from("distribution_order_lines").select("id").eq("order_id", row.id);
  fail(leftover.error);
  const remove = (leftover.data || []).map((line) => line.id).filter((id) => !kept.includes(id));
  if (remove.length) {
    const { error: deleteError } = await supabase.from("distribution_order_lines").delete().in("id", remove);
    fail(deleteError);
  }
  return row;
}

export async function saveDistributionCustomer(companyId, customer, organizationId) {
  assertGeneric(companyId);
  const row = {
    id: customer.id || newId(),
    company_id: companyId,
    organization_id: organizationId || CLARDY_ORG_ID,
    name: customer.name || "Customer",
    contact_name: customer.contact_name || null,
    phone: customer.phone || null,
    email: customer.email || null,
    bill_to_address: customer.bill_to_address || null,
    notes: customer.notes || null,
  };
  const { error } = await supabase.from("distribution_customers").upsert(row);
  fail(error);
  return row;
}

export async function saveDistributionProduct(companyId, product, organizationId) {
  assertGeneric(companyId);
  const cost = numeric(product.cost);
  const sell = numeric(product.sell_price);
  const row = {
    id: product.id || newId(),
    company_id: companyId,
    organization_id: organizationId || CLARDY_ORG_ID,
    name: product.name || "Product",
    category: product.category || null,
    unit: product.unit || null,
    pack: product.pack || null,
    supplier_name: product.supplier_name || null,
    cost,
    sell_price: sell,
    cost_unknown: product.cost_unknown || cost == null,
    sell_unknown: product.sell_unknown || sell == null,
    notes: product.notes || null,
    sort_order: product.sort_order ?? 0,
    active: product.active !== false,
  };
  const { error } = await supabase.from("distribution_products").upsert(row);
  fail(error);
  return row;
}

export async function saveDistributionPurchase(companyId, purchase, organizationId) {
  assertGeneric(companyId);
  const row = {
    id: purchase.id || newId(),
    company_id: companyId,
    organization_id: organizationId || CLARDY_ORG_ID,
    order_id: purchase.order_id || null,
    supplier_name: purchase.supplier_name || "Supplier",
    po_number: purchase.po_number || null,
    status: purchase.status || "needed",
    amount: numeric(purchase.amount),
    notes: purchase.notes || null,
  };
  const { error } = await supabase.from("distribution_supplier_purchases").upsert(row);
  fail(error);
  return row;
}

export async function deleteDistributionPurchase(companyId, id) {
  assertGeneric(companyId);
  const { error } = await supabase.from("distribution_supplier_purchases").delete().eq("id", id).eq("company_id", companyId);
  fail(error);
}

export async function saveDistributionSettings(companyId, settings, organizationId) {
  assertGeneric(companyId);
  const row = {
    company_id: companyId,
    organization_id: organizationId || CLARDY_ORG_ID,
    company_name: settings.company_name || "Company",
    remit_name: settings.remit_name || "",
    remit_address: settings.remit_address || null,
    thank_you: settings.thank_you || null,
    signature_name: settings.signature_name || "",
    tax_rate: numeric(settings.tax_rate) ?? 0.0825,
    default_delivery: numeric(settings.default_delivery),
  };
  const { error } = await supabase.from("distribution_settings").upsert(row);
  fail(error);
  return row;
}

// A payment row is the record of money collected. This does not email or
// text, and it does not set turf_order_id, so it cannot land on Turf'n Texas.
export async function recordOperationsPayment(companyId, payload, organizationId) {
  assertGeneric(companyId);
  const row = {
    id: newId(),
    company_id: companyId,
    organization_id: organizationId || CLARDY_ORG_ID,
    amount_received: numeric(payload.amount) ?? 0,
    payment_date: dateOrNull(payload.date),
    payment_method: payload.method || "Check",
    reference_number: payload.reference || null,
    notes: payload.notes || null,
    linked_job_id: payload.projectId || null,
    distribution_order_id: payload.orderId || null,
    operations_job_id: payload.installJobId || null,
  };
  const { error } = await supabase.from("payments").insert(row);
  fail(error);
  if (row.linked_job_id) {
    await supabase.rpc("reconcile_project_draws", { p_project_id: row.linked_job_id });
  }
  return row;
}

// Files an operations job. Does not update the lead or the project status.
export async function persistOperationsSchedule(model, entry, patch) {
  const companyId = model?.company?.id;
  assertGeneric(companyId);
  const organizationId = orgOf(model);
  if (entry.kind === "order") {
    const order = (model.orders || []).find((row) => row.id === entry.recordId);
    if (!order) return;
    const date = Object.prototype.hasOwnProperty.call(patch, "date") ? (patch.date || null) : order.schedule_date;
    await saveDistributionOrder(companyId, {
      ...order,
      schedule_date: date,
      crew: patch.crew ?? order.crew,
      status: patch.status ?? order.status,
      notes: patch.notes ?? order.notes,
      next_action: patch.nextAction ?? order.next_action,
    }, (model.lines || []).filter((line) => line.order_id === order.id), organizationId);
    return;
  }
  if (entry.kind === "job") {
    const job = (model.jobs || []).find((row) => row.id === entry.recordId);
    if (!job) return;
    const date = Object.prototype.hasOwnProperty.call(patch, "date") ? (patch.date || null) : job.scheduled_on;
    await saveOperationsJob(companyId, {
      ...job,
      scheduled_on: date,
      crew: patch.crew ?? job.crew,
      stage: patch.status ?? job.stage,
      notes: patch.notes ?? job.notes,
      next_action: patch.nextAction ?? job.next_action,
    }, organizationId);
    return;
  }
  const date = Object.prototype.hasOwnProperty.call(patch, "date") ? (patch.date || null) : entry.date;
  await saveOperationsJob(companyId, {
    id: patch.newId || newId(),
    lead_id: entry.kind === "lead" ? entry.recordId : null,
    project_id: entry.kind === "project" ? entry.recordId : null,
    name: entry.title,
    customer_name: entry.customer,
    address: entry.address || "",
    stage: STAGES.has(patch.status || entry.status) ? (patch.status || entry.status) : "approved",
    scheduled_on: date,
    crew: patch.crew ?? entry.crew ?? "",
    notes: patch.notes ?? entry.notes ?? "",
    next_action: patch.nextAction ?? entry.nextAction ?? "",
    sell_amount: entry.sell ?? null,
    cost_amount: entry.cost ?? null,
    materials: entry.materials || "",
    distribution_order_id: null,
  }, organizationId);
}
