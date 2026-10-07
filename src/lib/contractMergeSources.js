// Merge-field sources a contract_templates row can pull in, resolved against
// a Deal being sent from the Contracts tab (PipelineView.jsx). Deals have no
// direct client_id — the caller resolves
// { deal, client, company, project, estimate, estimateVersion } once (chasing
// deal.lead_id -> lead.linked_contact_id -> client, client.id -> project ->
// deal.lead_id -> lead.company_id -> company_profiles, and client.id ->
// estimate -> its active estimate_version) and passes that context into
// resolveContractMergeValue for every field.
//
// Two contract_templates.body_type modes consume this list:
//   'file' — the original flow: an uploaded Word/PDF with a literal anchor
//            typed into it, mapped by hand to a source via merge_fields
//            ([{ anchor, source }]). Resolved values become locked DocuSign
//            anchor-string text tabs at send time (api/docusign-send.js).
//   'text' — body is authored in-app; the inserted token *is* the source
//            value itself (e.g. "{{client.name}}"), no separate mapping
//            step. renderContractTemplate() below resolves the whole body
//            to real text before a PDF is generated, so DocuSign only needs
//            to find the "**signature**" marker for signature placement.
//
// This same list backs the read-only merge field library shown in
// Settings -> Templates -> Merge Fields, so `label` and `description` here
// are user-facing copy, not just dropdown text.

// One set of fields per line of the payment schedule / allowances template
// applied to a project, numbered in order (draw 1 = the template's first
// milestone, ordered by draw_number on the Billing tab). Lets a contract
// written for a given template place each milestone's % and $ where it wants
// instead of only the whole schedule as a block. A line the project doesn't
// have resolves blank.
const NUMBERED_LINES = 15;
const lineNumbers = Array.from({ length: NUMBERED_LINES }, (_, i) => i + 1);

const DRAW_LINE_SOURCES = lineNumbers.flatMap((n) => [
  { value: `draws.${n}.title`,   label: `Draw ${n} — Milestone`,               group: "Draw Schedule Lines", description: `Name of draw ${n} on the project's Billing tab (from the applied payment schedule template).` },
  { value: `draws.${n}.percent`, label: `Draw ${n} — % of Contract Price`,     group: "Draw Schedule Lines", description: `Draw ${n}'s amount as a percentage of the total contract price, e.g. "30%". Includes any builder fee share.` },
  { value: `draws.${n}.amount`,  label: `Draw ${n} — Amount ($)`,              group: "Draw Schedule Lines", description: `Dollar amount of draw ${n}.` },
]);

const ALLOWANCE_LINE_SOURCES = lineNumbers.flatMap((n) => [
  { value: `selections.allowance_${n}.item`,   label: `Allowance ${n} — Item`,       group: "Allowance Lines", description: `Name of allowance ${n} on the project's Pool Selections → Allowances tab (from the applied allowances template).` },
  { value: `selections.allowance_${n}.amount`, label: `Allowance ${n} — Amount ($)`, group: "Allowance Lines", description: `Dollar amount of allowance ${n}.` },
]);

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
  { value: "project.builder_fee",  label: "Project — Builder Fee ($)", group: "Project",  description: "The flat builder fee included in the contract value. Set when a builder fee payment schedule is applied on the Billing tab, or in the project's Edit dialog." },
  { value: "project.builder_fee_words", label: "Project — Builder Fee in Words", group: "Project", description: "The builder fee written out, e.g. \"Fifteen Thousand and 00/100 Dollars\"." },
  { value: "project.cost_of_construction", label: "Project — Cost of Construction ($)", group: "Project", description: "Contract value minus the builder fee: the amount the milestone percentages split." },
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
  { value: "selections.allowances_table",       label: "Selections — Allowances Table",          group: "Pool Selections", description: "Allowances as a formatted text table (Item | Amount) with a totals row — ready to paste into a contract." },
  { value: "selections.allowances_total",       label: "Selections — Allowances Total ($)",      group: "Pool Selections", description: "Sum of all allowance amounts." },
  { value: "selections.payment_schedule",       label: "Selections — Payment Schedule",          group: "Pool Selections", description: "The milestone payment schedule — one line per milestone, with amounts." },
  { value: "selections.payment_schedule_total", label: "Selections — Payment Schedule Total ($)", group: "Pool Selections", description: "Sum of all payment-schedule amounts." },
  ...ALLOWANCE_LINE_SOURCES,
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

  { value: "draws.payment_schedule",       label: "Draws — Payment Schedule",        group: "Draw Schedule", description: "The project's draw schedule — one line per draw with milestone name, percentage, and dollar amount. Managed on the project's Billing tab." },
  { value: "draws.payment_schedule_table", label: "Draws — Payment Schedule Table",   group: "Draw Schedule", description: "Draw schedule as a formatted text table (Milestone | % | Amount) with a totals row — ready to paste into a contract." },
  { value: "draws.payment_schedule_total", label: "Draws — Payment Schedule Total ($)", group: "Draw Schedule", description: "Sum of all draw amounts on the project's Billing tab." },
  ...DRAW_LINE_SOURCES,

  { value: "change_order.number",              label: "Change Order — Number",               group: "Change Order", description: "Change order number on this project, e.g. \"CO-3\"." },
  { value: "change_order.title",               label: "Change Order — Title",                group: "Change Order", description: "Short name of the change order." },
  { value: "change_order.description",         label: "Change Order — Description",          group: "Change Order", description: "The description written on the change order in the project's Change Orders tab." },
  { value: "change_order.line_items",          label: "Change Order — Line Items",           group: "Change Order", description: "Each line item with its amount, one per line." },
  { value: "change_order.line_items_table",    label: "Change Order — Line Items Table",     group: "Change Order", description: "Line items as a formatted text table (Item | Amount) with a total row." },
  { value: "change_order.amount",              label: "Change Order — Amount ($)",           group: "Change Order", description: "Total of this change order. A credit shows as a negative amount." },
  { value: "change_order.schedule_days",       label: "Change Order — Schedule Impact",      group: "Change Order", description: "Workdays this change adds to the schedule, e.g. \"3 workdays\" or \"No change\"." },
  { value: "change_order.date",                label: "Change Order — Date",                 group: "Change Order", description: "Date on the change order." },
  { value: "change_order.previous_contract_total", label: "Change Order — Contract Total Before ($)", group: "Change Order", description: "Original contract value plus all previously approved change orders." },
  { value: "change_order.new_contract_total",  label: "Change Order — New Contract Total ($)", group: "Change Order", description: "Contract total after this change order." },
  { value: "change_order.amount_words",        label: "Change Order — Amount in Words",      group: "Change Order", description: "The amount written out, e.g. \"One Thousand Five Hundred and 00/100 Dollars\"." },
  { value: "change_order.new_contract_total_words", label: "Change Order — New Contract Total in Words", group: "Change Order", description: "The new contract total written out in words." },
  { value: "change_order.type",                label: "Change Order — Type",                 group: "Change Order", description: "\"Addition\", \"Credit\" or \"No Cost Change\", from the amount." },
  { value: "change_order.status",              label: "Change Order — Status",               group: "Change Order", description: "Draft, Out for Signature, Approved, Declined or Void." },
  { value: "change_order.approved_date",       label: "Change Order — Approved Date",        group: "Change Order", description: "Date the change order was approved (signed)." },
  { value: "change_order.line_item_count",     label: "Change Order — Number of Line Items", group: "Change Order", description: "How many line items are on the change order." },
  { value: "change_order.completion_date_before", label: "Change Order — Completion Date Before", group: "Change Order", description: "Project end date plus the workdays from previously approved change orders." },
  { value: "change_order.new_completion_date", label: "Change Order — New Completion Date",  group: "Change Order", description: "Completion date after this change order's schedule impact (workdays, skipping weekends)." },

  { value: "change_orders.approved_count",     label: "All Change Orders — Approved Count",  group: "All Change Orders", description: "How many change orders on the project are approved." },
  { value: "change_orders.approved_total",     label: "All Change Orders — Approved Total ($)", group: "All Change Orders", description: "Sum of all approved change orders (credits subtract)." },
  { value: "change_orders.pending_total",      label: "All Change Orders — Pending Total ($)", group: "All Change Orders", description: "Sum of change orders still in draft or out for signature." },
  { value: "change_orders.approved_list",      label: "All Change Orders — Approved List",   group: "All Change Orders", description: "Every approved change order, one per line: number, title, amount and date approved." },
  { value: "change_orders.approved_table",     label: "All Change Orders — Approved Table",  group: "All Change Orders", description: "Approved change orders as a formatted text table (CO | Title | Amount) with a total row." },
  { value: "change_orders.all_list",           label: "All Change Orders — Full List",       group: "All Change Orders", description: "Every change order except void ones, one per line with its status." },
  { value: "change_orders.schedule_days_total", label: "All Change Orders — Schedule Days Added", group: "All Change Orders", description: "Total workdays added to the schedule by approved change orders." },

  { value: "contract.original_value",          label: "Contract — Original Value ($)",       group: "Contract Totals", description: "The project's contract value before any change orders." },
  { value: "contract.revised_value",           label: "Contract — Revised Value ($)",        group: "Contract Totals", description: "Original contract value plus all approved change orders." },
  { value: "contract.revised_value_words",     label: "Contract — Revised Value in Words",   group: "Contract Totals", description: "The revised contract value written out in words." },
  { value: "contract.paid_to_date",            label: "Contract — Paid to Date ($)",         group: "Contract Totals", description: "Total of payments recorded on the project." },
  { value: "contract.balance_due",             label: "Contract — Balance Due ($)",          group: "Contract Totals", description: "Revised contract value minus payments recorded." },
  { value: "contract.revised_completion_date", label: "Contract — Revised Completion Date",  group: "Contract Totals", description: "Project end date plus workdays from all approved change orders." },

  { value: "today",                label: "Today's Date",              group: "Other",    description: "Today's date, e.g. \"January 1, 2026\"." },
];

// The signature placement marker. It isn't a MERGE_SOURCES entry — it has no
// resolved value, it's a literal string DocuSign's anchor-string matching
// looks for (api/docusign-send.js) — but it belongs in the library and any
// export of it since it's a real anchor a template author needs to place.
export const SIGNATURE_FIELD = {
  value: "**signature**",
  label: "Signer's Signature",
  group: "Signature",
  description: "Where the signer's signature goes. DocuSign finds this marker and places the signature block there.",
};

// Canonical anchor text for a merge source: the literal string a template
// author types into an uploaded Word/PDF ('file' mode) or that gets inserted
// into an in-app body ('text' mode, see MergeFieldPicker.jsx). Every source
// uses the same {{dotted.path}} shape so the library, the picker, and any
// exported reference doc all agree on one anchor per field.
export function anchorForSource(source) {
  return source.value === SIGNATURE_FIELD.value ? source.value : `{{${source.value}}}`;
}

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

function formatDrawSchedule(draws) {
  return (draws || [])
    .filter((d) => d.title)
    .map((d) => {
      const pct = d.percent_of_contract > 0 ? ` (${Number(d.percent_of_contract).toFixed(1)}%)` : "";
      return `${d.title}: ${formatCurrency(d.amount)}${pct}`;
    })
    .join("\n");
}

// Change orders can have cents and can be credits.
function formatMoney(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

function changeOrderItems(co) {
  return (co?.line_items || []).filter((li) => (li.description || "").trim() || Number(li.amount));
}

function formatChangeOrderItems(co) {
  return changeOrderItems(co).map((li) => `${li.description || "Item"}: ${formatMoney(li.amount)}`).join("\n");
}

function formatChangeOrderTable(co) {
  const items = changeOrderItems(co);
  if (!items.length) return "";
  const rows = items.map((li) => [li.description || "Item", formatMoney(li.amount)]);
  const table = buildTable(["Item", "Amount"], rows);
  const pad = rows.reduce((m, r) => Math.max(m, r[0].length), 4);
  return `${table}\n${"-".repeat(20)}\n${"Total".padEnd(pad)} | ${formatMoney(co.amount)}`;
}

// "One Thousand Five Hundred and 00/100 Dollars" (check-writing style).
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function under1000(n) {
  const out = [];
  if (n >= 100) { out.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { out.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "")); }
  else if (n > 0) out.push(ONES[n]);
  return out.join(" ");
}
function moneyInWords(amount) {
  const v = Math.abs(Number(amount || 0));
  let dollars = Math.floor(v);
  const cents = Math.round((v - dollars) * 100);
  const parts = [];
  for (const [size, name] of [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"], [1, ""]]) {
    if (dollars >= size) {
      parts.push(`${under1000(Math.floor(dollars / size))}${name ? ` ${name}` : ""}`);
      dollars %= size;
    }
  }
  const words = `${parts.join(" ") || "Zero"} and ${String(cents).padStart(2, "0")}/100 Dollars`;
  return Number(amount) < 0 ? `Credit of ${words}` : words;
}

// Adds workdays (Mon–Fri) to a YYYY-MM-DD date, like the schedule does.
function addWorkdays(iso, days) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (isNaN(d)) return "";
  let left = Math.abs(parseInt(days, 10) || 0);
  const step = days < 0 ? -1 : 1;
  while (left > 0) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toLocaleDateString("en-CA");
}

const CO_STATUS_LABELS = { draft: "Draft", sent: "Out for Signature", approved: "Approved", declined: "Declined", void: "Void" };
const coNumber = (co) => (co?.number ? `CO-${co.number}` : "CO");
const approvedOrders = (orders) => (orders || []).filter((o) => o.status === "approved")
  .sort((a, b) => (a.number || 0) - (b.number || 0));
const sumField = (rows, f) => (rows || []).reduce((s, r) => s + (Number(r[f]) || 0), 0);

function formatApprovedTable(orders) {
  const rows = approvedOrders(orders);
  if (!rows.length) return "";
  const data = rows.map((o) => [coNumber(o), o.title || "", formatMoney(o.amount)]);
  const table = buildTable(["CO", "Title", "Amount"], data);
  return `${table}\n${"-".repeat(20)}\nTotal | ${formatMoney(sumField(rows, "amount"))}`;
}

function formatDateLong(iso) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return isNaN(d) ? String(iso) : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function sumAmounts(rows) {
  return (rows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

// Pipe-table helpers — produce a fixed-width text table that pastes cleanly
// into Word / in-app contracts. Works for both 'file' anchor replacement and
// 'text' mode inline rendering.
function padR(str, len) { return String(str).padEnd(len, " "); }
function padL(str, len) { return String(str).padStart(len, " "); }

function buildTable(headers, rows) {
  if (!rows.length) return "";
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)));
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const header = headers.map((h, i) => padR(h, widths[i])).join(" | ");
  const body = rows.map((r) => r.map((cell, i) => (i === r.length - 1 ? padL(cell, widths[i]) : padR(cell, widths[i]))).join(" | "));
  return [header, sep, ...body].join("\n");
}

function formatAllowancesTable(selections) {
  const rows = (selections?.allowances || []).filter((r) => r.item);
  if (!rows.length) return "";
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const dataRows = rows.map((r) => [r.item, formatCurrency(r.amount)]);
  const table = buildTable(["Item", "Amount"], dataRows);
  return `${table}\n${"-".repeat(20)}\n${"Total".padEnd(dataRows.reduce((m, r) => Math.max(m, r[0].length), 4))} | ${formatCurrency(total)}`;
}

function formatAllowancesTableDraws(draws) {
  // used when drawing the payment schedule as a table
  const rows = (draws || []).filter((d) => d.title);
  if (!rows.length) return "";
  const total = rows.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const dataRows = rows.map((d) => [
    d.title,
    d.percent_of_contract > 0 ? `${Number(d.percent_of_contract).toFixed(1)}%` : "—",
    formatCurrency(d.amount),
  ]);
  const table = buildTable(["Milestone", "%", "Amount"], dataRows);
  const pad = dataRows.reduce((m, r) => Math.max(m, r[0].length), 9);
  return `${table}\n${"-".repeat(20)}\n${"Total".padEnd(pad)} |     | ${formatCurrency(total)}`;
}

// Resolves draws.<n>.<field> and selections.allowance_<n>.<field>. Returns
// undefined for any other source so the main switch handles it.
function formatPercent(p) {
  return `${Math.round(p * 100) / 100}%`;
}

function resolveNumberedLine(source, { project, selections, draws }) {
  let m = /^draws\.(\d+)\.(title|percent|amount)$/.exec(source);
  if (m) {
    const draw = (draws || []).filter((d) => d.title || Number(d.amount))[Number(m[1]) - 1];
    if (!draw) return "";
    if (m[2] === "title") return draw.title || "";
    if (m[2] === "amount") return formatMoney(draw.amount);
    // % of the total contract price — not the template's % of contract minus
    // builder fee — so the percentages in the contract add up to 100%.
    const contract = Number(project?.contract_value) || 0;
    if (contract > 0) return formatPercent((Number(draw.amount) || 0) / contract * 100);
    return Number(draw.percent_of_contract) > 0 ? formatPercent(Number(draw.percent_of_contract)) : "";
  }
  m = /^selections\.allowance_(\d+)\.(item|amount)$/.exec(source);
  if (m) {
    const row = (selections?.allowances || []).filter((r) => r.item)[Number(m[1]) - 1];
    if (!row) return "";
    return m[2] === "item" ? row.item : formatMoney(row.amount);
  }
  return undefined;
}

// changeOrder / changeOrderPriorTotal come from a project's Change Orders tab
// (src/components/projects/ChangeOrdersPanel.jsx); priorTotal is the contract
// value plus every other approved change order.
// changeOrders is every change order on the project and payments its payments
// (the "All Change Orders" and "Contract Totals" fields); both work in any
// contract sent for a client with a project.
export function resolveContractMergeValue(source, { deal, client, company, project, estimate, estimateVersion, selections, draws, changeOrder, changeOrderPriorTotal, changeOrders, payments } = {}) {
  const approved = approvedOrders(changeOrders);
  const approvedTotal = sumField(approved, "amount");
  const approvedDays = sumField(approved, "schedule_days");
  const revisedValue = Number(project?.contract_value || 0) + approvedTotal;
  const priorDays = sumField(approved.filter((o) => o.id !== changeOrder?.id), "schedule_days");
  const lineValue = resolveNumberedLine(source, { project, selections, draws });
  if (lineValue !== undefined) return lineValue;
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
    case "project.builder_fee":            return project?.builder_fee != null ? formatMoney(project.builder_fee) : "";
    case "project.builder_fee_words":      return project?.builder_fee != null ? moneyInWords(project.builder_fee) : "";
    case "project.cost_of_construction":   return project ? formatMoney(Number(project.contract_value || 0) - Number(project.builder_fee || 0)) : "";
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
    case "selections.allowances_table":        return formatAllowancesTable(selections);
    case "selections.allowances_total":        return formatCurrency(sumAmounts(selections?.allowances));
    case "selections.payment_schedule": {
      // Prefer pool_selections JSONB data; fall back to the draw schedule if empty
      const rows = selections?.payment_schedule?.filter((r) => r.milestone && Number(r.amount) > 0) || [];
      if (rows.length > 0) return formatAmountSchedule(rows, "milestone");
      return formatDrawSchedule(draws);
    }
    case "selections.payment_schedule_total": {
      const rows = selections?.payment_schedule?.filter((r) => Number(r.amount) > 0) || [];
      if (rows.length > 0) return formatCurrency(sumAmounts(rows));
      return formatCurrency(sumAmounts(draws));
    }
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

    case "draws.payment_schedule":       return formatDrawSchedule(draws);
    case "draws.payment_schedule_table": return formatAllowancesTableDraws(draws);
    case "draws.payment_schedule_total": return formatCurrency(sumAmounts(draws));

    case "change_order.number":            return changeOrder?.number ? `CO-${changeOrder.number}` : "";
    case "change_order.title":             return changeOrder?.title || "";
    case "change_order.description":       return changeOrder?.description || "";
    case "change_order.line_items":        return formatChangeOrderItems(changeOrder);
    case "change_order.line_items_table":  return formatChangeOrderTable(changeOrder);
    case "change_order.amount":            return changeOrder ? formatMoney(changeOrder.amount) : "";
    case "change_order.schedule_days": {
      if (!changeOrder) return "";
      const days = Number(changeOrder.schedule_days) || 0;
      return days ? `${days} workday${Math.abs(days) === 1 ? "" : "s"}` : "No change";
    }
    case "change_order.date":              return formatDateLong(changeOrder?.requested_date);
    case "change_order.previous_contract_total": return changeOrder ? formatMoney(changeOrderPriorTotal) : "";
    case "change_order.new_contract_total":      return changeOrder ? formatMoney(Number(changeOrderPriorTotal || 0) + Number(changeOrder.amount || 0)) : "";
    case "change_order.amount_words":      return changeOrder ? moneyInWords(changeOrder.amount) : "";
    case "change_order.new_contract_total_words": return changeOrder ? moneyInWords(Number(changeOrderPriorTotal || 0) + Number(changeOrder.amount || 0)) : "";
    case "change_order.type": {
      if (!changeOrder) return "";
      const a = Number(changeOrder.amount || 0);
      return a > 0 ? "Addition" : a < 0 ? "Credit" : "No Cost Change";
    }
    case "change_order.status":            return changeOrder ? CO_STATUS_LABELS[changeOrder.status] || changeOrder.status || "" : "";
    case "change_order.approved_date":     return formatDateLong(changeOrder?.approved_date);
    case "change_order.line_item_count":   return changeOrder ? String(changeOrderItems(changeOrder).length) : "";
    case "change_order.completion_date_before": return changeOrder ? formatDateLong(addWorkdays(project?.end_date, priorDays)) : "";
    case "change_order.new_completion_date":    return changeOrder ? formatDateLong(addWorkdays(project?.end_date, priorDays + (parseInt(changeOrder.schedule_days, 10) || 0))) : "";

    case "change_orders.approved_count":   return String(approved.length);
    case "change_orders.approved_total":   return formatMoney(approvedTotal);
    case "change_orders.pending_total":    return formatMoney(sumField((changeOrders || []).filter((o) => o.status === "draft" || o.status === "sent"), "amount"));
    case "change_orders.approved_list":    return approved.map((o) => `${coNumber(o)} ${o.title || ""}: ${formatMoney(o.amount)}${o.approved_date ? ` (approved ${formatDateLong(o.approved_date)})` : ""}`).join("\n");
    case "change_orders.approved_table":   return formatApprovedTable(changeOrders);
    case "change_orders.all_list":         return (changeOrders || []).filter((o) => o.status !== "void")
      .sort((a, b) => (a.number || 0) - (b.number || 0))
      .map((o) => `${coNumber(o)} ${o.title || ""}: ${formatMoney(o.amount)} (${CO_STATUS_LABELS[o.status] || o.status || "Draft"})`).join("\n");
    case "change_orders.schedule_days_total": return `${approvedDays} workday${Math.abs(approvedDays) === 1 ? "" : "s"}`;

    case "contract.original_value":        return project ? formatMoney(project.contract_value) : "";
    case "contract.revised_value":         return project ? formatMoney(revisedValue) : "";
    case "contract.revised_value_words":   return project ? moneyInWords(revisedValue) : "";
    case "contract.paid_to_date":          return project ? formatMoney(sumField(payments, "amount_received")) : "";
    case "contract.balance_due":           return project ? formatMoney(revisedValue - sumField(payments, "amount_received")) : "";
    case "contract.revised_completion_date": return formatDateLong(addWorkdays(project?.end_date, approvedDays));

    case "today":                    return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    default:                         return "";
  }
}

// Which {{source}} tokens appear in a 'text' mode template body, for the
// editor to flag ones that aren't a real MERGE_SOURCES value. Mirrors
// scopeTemplateEngine.js's extractTemplateTokens.
export function extractContractTokens(body) {
  const tokens = new Set();
  for (const m of (body || "").matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    tokens.add(m[1]);
  }
  return [...tokens];
}

// Resolves every {{source}} token in a 'text' mode template body to real
// data. Unrecognized tokens are left as-is rather than blanked, so a typo
// stays visible instead of silently disappearing. The literal "**signature**"
// marker has no braces, so it's untouched here and left for DocuSign's
// anchor-string signature placement (api/docusign-send.js).
//
// `fieldDefaults` is a template's { source: value } map (contract_templates
// .field_defaults) — a non-empty entry there always wins over the
// live-resolved value, letting a template pin a value that should stay the
// same regardless of which deal it's sent from.
export function renderContractTemplate(body, ctx, fieldDefaults) {
  return (body || "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, source) => {
    if (!MERGE_SOURCES.some((s) => s.value === source)) return match;
    const override = fieldDefaults?.[source];
    if (typeof override === "string" && override.trim()) return override;
    return resolveContractMergeValue(source, ctx);
  });
}

// Canned placeholder data for the template editor's sample-data Preview —
// covers every source resolveContractMergeValue switches on so every group
// renders something non-blank without needing a real deal.
export const SAMPLE_CONTEXT = {
  deal: {
    title: "Sample Deal — Backyard Renovation",
    value: 45000,
    stage: "Proposal",
    probability: 60,
    close_date: "2026-10-15",
    assigned_to: "Jordan Rep",
    description: "Full backyard renovation including pool and decking.",
  },
  client: {
    name: "John Sample",
    contact_person: "Jane Sample",
    email: "john.sample@example.com",
    phone: "(555) 123-4567",
    address: "123 Main St, Austin, TX 78701",
    company: "Sample Holdings LLC",
  },
  company: {
    invoice_company_name: "Clardy Construction",
    address: "456 Builder Ave, Austin, TX 78702",
    phone: "(555) 987-6543",
    email: "info@clardy.io",
    website: "https://clardy.io",
    license_number: "TX-00000",
  },
  project: {
    name: "Sample Backyard Project",
    address: "123 Main St, Austin, TX 78701",
    status: "in_progress",
    project_manager: "Alex Manager",
    contract_value: 45000,
    builder_fee: 6750,
    start_date: "2026-11-01",
    end_date: "2027-02-01",
  },
  estimate: {
    estimate_number: "EST-1000",
    title: "Backyard Renovation Estimate",
    issue_date: "2026-09-01",
    expiry_date: "2026-10-01",
    terms: "50% deposit due at signing, balance due at completion.",
  },
  estimateVersion: {
    total_price: 45000,
  },
  selections: {
    equipment: [{ equipment: "Pump", manufacturer: "Pentair", model: "IntelliFlo", warranty: "3 years" }],
    finishes: [{ item: "Interior Finish", manufacturer_product: "Diamond Brite", color_finish: "Blue Granite" }],
    allowances: [
      { item: "Tile",             amount: 2000 },
      { item: "Coping",           amount: 1500 },
      { item: "Interior Finish",  amount: 3000 },
      { item: "Decking",          amount: 4000 },
    ],
    payment_schedule: [],
    water_features: "Raised spa with waterfall.",
    other_improvements: "New paver decking.",
    notes: "Sample selection notes.",
  },
  changeOrder: {
    number: 2,
    title: "Add spa spillway lighting",
    description: "Add two LED lights to the spa spillway and run a new circuit to the equipment pad.",
    line_items: [
      { description: "LED spillway lights (2)", amount: 850 },
      { description: "Electrical circuit to equipment pad", amount: 650 },
    ],
    amount: 1500,
    schedule_days: 2,
    requested_date: "2026-10-05",
    status: "sent",
  },
  changeOrderPriorTotal: 47400,
  changeOrders: [
    { id: "co1", number: 1, title: "Upgrade to travertine coping", amount: 2400, schedule_days: 1, status: "approved", approved_date: "2026-09-20" },
    { id: "co2", number: 2, title: "Add spa spillway lighting", amount: 1500, schedule_days: 2, status: "sent" },
  ],
  payments: [{ amount_received: 13500 }],
  draws: [
    { title: "30% Deposit", percent_of_contract: 30, amount: 13500 },
    { title: "40% Midway", percent_of_contract: 40, amount: 18000 },
    { title: "30% Final", percent_of_contract: 30, amount: 13500 },
  ],
};
