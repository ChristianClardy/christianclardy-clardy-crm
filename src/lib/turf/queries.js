import { supabase } from "@/lib/supabase";
import { CLARDY_ORG_ID, TURF_COMPANY_ID } from "./constants.js";
import { applySchedulePatch, newId } from "./schedule.js";

const JOB_COLUMNS = "id, company_id, name, customer_name, address, stage, crew, scheduled_on, materials, next_action, notes, sell_amount, cost_amount, lead_id, project_id, distribution_order_id";
const ORDER_COLUMNS = "id, company_id, customer_id, order_number, status, contact_name, bill_to_name, bill_to_address, deliver_to, delivery_fee, tax_rate, payment_method, invoice_date, schedule_date, crew, next_action, notes";

export function isMissingTurfSchema(error) {
  const msg = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return /PGRST204|PGRST205|42P01|42703|schema cache|does not exist|Could not find the/i.test(msg);
}

function fail(error) {
  if (error) throw error;
}

async function readOptional(query) {
  const result = await query;
  if (!result.error) return result.data;
  if (isMissingTurfSchema(result.error)) return null;
  throw result.error;
}

export async function loadTurf() {
  const companyId = TURF_COMPANY_ID;
  const [settings, customers, products, orders, lines, purchases, jobs, leads, projects, estimates, events, company] = await Promise.all([
    readOptional(supabase.from("turf_settings").select("*").eq("company_id", companyId).maybeSingle()),
    readOptional(supabase.from("turf_customers").select("*").eq("company_id", companyId).order("name")),
    readOptional(supabase.from("turf_products").select("*").eq("company_id", companyId).order("sort_order")),
    readOptional(supabase.from("turf_orders").select(ORDER_COLUMNS).eq("company_id", companyId).order("created_at", { ascending: false })),
    readOptional(supabase.from("turf_order_lines").select("*").order("sort_order")),
    readOptional(supabase.from("turf_supplier_purchases").select("*").eq("company_id", companyId).order("created_at")),
    readOptional(supabase.from("turf_install_jobs").select(JOB_COLUMNS).eq("company_id", companyId).order("created_at")),
    supabase.from("leads").select("id, full_name, status, company_id, property_address, address, next_action, estimated_budget, phone, email, project_description, notes, linked_contact_id").eq("company_id", companyId),
    supabase.from("projects").select("id, name, status, company_id, address, contract_value, costs_to_date, start_date, end_date, project_manager, client_id, notes").eq("company_id", companyId),
    supabase.from("estimates").select("id, title, status, company_id, project_id, client_id, total, issue_date, notes").eq("company_id", companyId),
    supabase.from("calendar_events").select("id, title, start_datetime, project_id, linked_project_id, lead_id, company_id").eq("company_id", companyId),
    supabase.from("company_profiles").select("id, name").eq("id", companyId).maybeSingle(),
  ]);
  fail(leads.error);
  fail(projects.error);
  fail(estimates.error);
  fail(events.error);
  fail(company.error);
  let payments = await supabase.from("payments").select("id, amount_received, payment_date, payment_method, reference_number, notes, linked_job_id, turf_order_id, turf_install_job_id, company_id").eq("company_id", companyId);
  if (payments.error && isMissingTurfSchema(payments.error)) {
    payments = await supabase.from("payments").select("id, amount_received, payment_date, payment_method, reference_number, notes, linked_job_id, company_id").eq("company_id", companyId);
  }
  fail(payments.error);
  const orderRows = orders || [];
  const orderIds = new Set(orderRows.map((order) => order.id));
  const schemaReady = settings !== null || customers !== null || orders !== null;
  return {
    settings: settings || null,
    customers: customers || [],
    products: products || [],
    orders: orderRows,
    lines: (lines || []).filter((line) => orderIds.has(line.order_id)),
    purchases: purchases || [],
    jobs: jobs || [],
    leads: leads.data || [],
    projects: projects.data || [],
    estimates: estimates.data || [],
    events: events.data || [],
    payments: payments.data || [],
    company: company.data,
    schemaReady,
  };
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

export async function saveJob(job) {
  const row = {
    id: job.id || newId(),
    company_id: TURF_COMPANY_ID,
    organization_id: CLARDY_ORG_ID,
    name: job.name || "Install",
    customer_name: job.customer_name || null,
    address: job.address || null,
    stage: job.stage || "lead",
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
  const { error } = await supabase.from("turf_install_jobs").upsert(row);
  fail(error);
  return row;
}

export async function saveOrder(order, lines) {
  const row = {
    id: order.id || newId(),
    company_id: TURF_COMPANY_ID,
    organization_id: CLARDY_ORG_ID,
    customer_id: order.customer_id || null,
    order_number: order.order_number || "Order",
    status: order.status || "quote",
    contact_name: order.contact_name || null,
    bill_to_name: order.bill_to_name || null,
    bill_to_address: order.bill_to_address || null,
    deliver_to: order.deliver_to || null,
    delivery_fee: numeric(order.delivery_fee) ?? 0,
    tax_rate: numeric(order.tax_rate) ?? 0.0825,
    payment_method: order.payment_method || "Check",
    invoice_date: dateOrNull(order.invoice_date),
    schedule_date: dateOrNull(order.schedule_date),
    crew: order.crew || null,
    next_action: order.next_action || null,
    notes: order.notes || null,
  };
  const { error } = await supabase.from("turf_orders").upsert(row);
  fail(error);
  const kept = [];
  for (const [index, line] of (lines || []).entries()) {
    const saved = {
      id: line.id || newId(),
      order_id: row.id,
      organization_id: CLARDY_ORG_ID,
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
    const { error: lineError } = await supabase.from("turf_order_lines").upsert(saved);
    fail(lineError);
    kept.push(saved.id);
  }
  const leftover = await supabase.from("turf_order_lines").select("id").eq("order_id", row.id);
  fail(leftover.error);
  const remove = (leftover.data || []).map((line) => line.id).filter((id) => !kept.includes(id));
  if (remove.length) {
    const { error: deleteError } = await supabase.from("turf_order_lines").delete().in("id", remove);
    fail(deleteError);
  }
  return row;
}

export async function saveCustomer(customer) {
  const row = {
    id: customer.id || newId(),
    company_id: TURF_COMPANY_ID,
    organization_id: CLARDY_ORG_ID,
    name: customer.name || "Customer",
    contact_name: customer.contact_name || null,
    phone: customer.phone || null,
    email: customer.email || null,
    bill_to_address: customer.bill_to_address || null,
    notes: customer.notes || null,
  };
  const { error } = await supabase.from("turf_customers").upsert(row);
  fail(error);
  return row;
}

export async function saveProduct(product) {
  const cost = numeric(product.cost);
  const sell = numeric(product.sell_price);
  const row = {
    id: product.id || newId(),
    company_id: TURF_COMPANY_ID,
    organization_id: CLARDY_ORG_ID,
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
  const { error } = await supabase.from("turf_products").upsert(row);
  fail(error);
  return row;
}

export async function savePurchase(purchase) {
  const row = {
    id: purchase.id || newId(),
    company_id: TURF_COMPANY_ID,
    organization_id: CLARDY_ORG_ID,
    order_id: purchase.order_id || null,
    supplier_name: purchase.supplier_name || "Supplier",
    po_number: purchase.po_number || null,
    status: purchase.status || "needed",
    amount: numeric(purchase.amount),
    notes: purchase.notes || null,
  };
  const { error } = await supabase.from("turf_supplier_purchases").upsert(row);
  fail(error);
  return row;
}

export async function deletePurchase(id) {
  const { error } = await supabase.from("turf_supplier_purchases").delete().eq("id", id).eq("company_id", TURF_COMPANY_ID);
  fail(error);
}

export async function saveSettings(settings) {
  const row = {
    company_id: TURF_COMPANY_ID,
    organization_id: CLARDY_ORG_ID,
    company_name: settings.company_name || "Turf'N Texas",
    remit_name: settings.remit_name || "Christian Clardy",
    remit_address: settings.remit_address || null,
    thank_you: settings.thank_you || null,
    signature_name: settings.signature_name || "Christian Clardy",
    tax_rate: numeric(settings.tax_rate) ?? 0.0825,
    default_delivery: numeric(settings.default_delivery) ?? 400,
  };
  const { error } = await supabase.from("turf_settings").upsert(row);
  fail(error);
  return row;
}

// A payment row is the record of money collected. This does not email or text.
export async function recordPayment(payload) {
  const row = {
    id: newId(),
    company_id: TURF_COMPANY_ID,
    organization_id: CLARDY_ORG_ID,
    amount_received: numeric(payload.amount) ?? 0,
    payment_date: dateOrNull(payload.date),
    payment_method: payload.method || "Check",
    reference_number: payload.reference || null,
    notes: payload.notes || null,
    linked_job_id: payload.projectId || null,
    turf_order_id: payload.orderId || null,
    turf_install_job_id: payload.installJobId || null,
  };
  const { error } = await supabase.from("payments").insert(row);
  fail(error);
  if (row.linked_job_id) {
    await supabase.rpc("reconcile_project_draws", { p_project_id: row.linked_job_id });
  }
  return row;
}

export async function persistSchedulePatch(model, entry, patch) {
  const assignedId = patch.newId || newId();
  const next = applySchedulePatch(model, entry, { ...patch, newId: assignedId });
  if (entry.kind === "order") {
    const order = next.orders.find((row) => row.id === entry.recordId);
    await saveOrder(order, (model.lines || []).filter((line) => line.order_id === order.id));
    return;
  }
  if (entry.kind === "job") {
    const job = next.jobs.find((row) => row.id === entry.recordId);
    await saveJob(job);
    return;
  }
  const created = next.jobs.find((row) => row.id === assignedId);
  await saveJob(created);
}
