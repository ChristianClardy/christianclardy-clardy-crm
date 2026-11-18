import { DEFAULT_SETTINGS, EE_ORDER_ID, TURF_COMPANY_ID } from "./constants.js";

// The Turf'n Texas book in the database on 17 Nov 2026. One project, three
// sold leads (Brian Gilley is already the project), no sold estimates.
// None of them have a start date or a calendar event.
export const LIVE_TURF_PROJECTS = [
  {
    id: "c3615651-eb10-477a-8814-c90968017c71",
    company_id: TURF_COMPANY_ID,
    name: "Brian Gilley",
    status: "planning",
    address: "300 Cobb Dr Joshua Tx",
    contract_value: 4059.38,
    costs_to_date: null,
    start_date: null,
    end_date: null,
    project_manager: null,
    client_id: "8faab419-10d8-41b5-a32d-5c704a7eddff",
    notes: "",
  },
];

export const LIVE_TURF_LEADS = [
  { id: "270631ad-2a79-40a7-be12-c11f35a8abaa", company_id: TURF_COMPANY_ID, full_name: "Brian Gilley", status: "Contract Signed/Deposit Collected (Won)", linked_contact_id: "8faab419-10d8-41b5-a32d-5c704a7eddff", property_address: "300 Cobb Dr Joshua Tx", next_action: null },
  { id: "c22b8daf-8eef-4c4a-b7fc-0c05d2d272e5", company_id: TURF_COMPANY_ID, full_name: "Burleson", status: "Contract Signed/Deposit Collected (Won)", linked_contact_id: null, next_action: "Check status (asked Oct 31)" },
  { id: "819b4fd2-3537-4ab5-b567-85849daa1ddb", company_id: TURF_COMPANY_ID, full_name: "AAI baseball fields", status: "Contract Signed/Deposit Collected (Won)", linked_contact_id: null, next_action: null },
  { id: "e618d26f-9fa6-4f66-8250-b7d4a1fd3d21", company_id: TURF_COMPANY_ID, full_name: "Alyssa / Extreme Exteriors", status: "Appointment Scheduled", linked_contact_id: null, next_action: "Wingate install Thursday Nov 19" },
];
import { newId } from "./schedule.js";

const EE = "a5f20000-0000-4000-8000-000000000001";
const SPO = "a5f20000-0000-4000-8000-000000000002";
const KINGDOM = "a5f20000-0000-4000-8000-000000000003";
const POOLCORP = "a5f20000-0000-4000-8000-000000000004";

export const PREVIEW_CUSTOMERS = [
  { id: EE, company_id: TURF_COMPANY_ID, name: "Extreme Exteriors", contact_name: "Jayesh", phone: "", email: "", bill_to_address: "5111 E Hwy 80\nMidland, TX 79705", notes: "Wholesale. Midland and Abilene. Pays by check." },
  { id: SPO, company_id: TURF_COMPANY_ID, name: "Spanish Oaks Landscapes", contact_name: "Dale Garner", phone: "(210) 383-3214", email: "", bill_to_address: "635 TX-46\nBoerne, TX 78006", notes: "Wholesale. Boerne." },
  { id: KINGDOM, company_id: TURF_COMPANY_ID, name: "Kingdom Driven", contact_name: "", phone: "", email: "", bill_to_address: "", notes: "Wholesale turf customer." },
  { id: POOLCORP, company_id: TURF_COMPANY_ID, name: "PoolCorp / NPT", contact_name: "", phone: "", email: "", bill_to_address: "", notes: "National Pool Tile / PoolCorp." },
];

export const PREVIEW_PRODUCTS = [
  { id: "a5f10000-0000-4000-8000-000000000001", company_id: TURF_COMPANY_ID, name: "Kentucky Pro (2\" pile, 80 oz)", category: "Turf", unit: "SF", pack: "15' rolls", supplier_name: "Unconfirmed", cost: null, sell_price: 1.86, cost_unknown: true, sell_unknown: false, notes: "Standard invoice sell is $1.86. Cost was not found.", sort_order: 0, active: true },
  { id: "a5f10000-0000-4000-8000-000000000002", company_id: TURF_COMPANY_ID, name: "Nails 40D 5\" / 60D 6\" (50 lb box)", category: "Fastener", unit: "Box", pack: "50 lb", supplier_name: "Realturf Dallas", cost: 55, sell_price: 74, cost_unknown: false, sell_unknown: false, notes: "", sort_order: 1, active: true },
  { id: "a5f10000-0000-4000-8000-000000000003", company_id: TURF_COMPANY_ID, name: "Seaming tape 12\" x 330 LF", category: "Seam tape", unit: "Roll", pack: "330 LF", supplier_name: "Realturf Dallas", cost: 119, sell_price: 134, cost_unknown: false, sell_unknown: false, notes: "", sort_order: 2, active: true },
  { id: "a5f10000-0000-4000-8000-000000000004", company_id: TURF_COMPANY_ID, name: "Silica sand 50 lb (16/30)", category: "Infill", unit: "Bag", pack: "50 lb", supplier_name: "Realturf Dallas", cost: 4.5, sell_price: 5.5, cost_unknown: false, sell_unknown: false, notes: "", sort_order: 3, active: true },
  { id: "a5f10000-0000-4000-8000-000000000005", company_id: TURF_COMPANY_ID, name: "Pad", category: "Pad", unit: "SF", pack: "", supplier_name: "", cost: null, sell_price: null, cost_unknown: true, sell_unknown: true, notes: "No sell price on file. Do not guess.", sort_order: 4, active: true },
  { id: "a5f10000-0000-4000-8000-000000000006", company_id: TURF_COMPANY_ID, name: "Adhesive 5 Gal Bucket", category: "Adhesive", unit: "Bucket", pack: "5 gal", supplier_name: "", cost: null, sell_price: null, cost_unknown: true, sell_unknown: true, notes: "5-gal pail on the Midland draft. Price not guessed.", sort_order: 5, active: true },
  { id: "a5f10000-0000-4000-8000-000000000007", company_id: TURF_COMPANY_ID, name: "Plush (2\", 80/107 oz)", category: "Turf", unit: "SF", pack: "15' x 100'", supplier_name: "Realturf Dallas", cost: 1.46, sell_price: 1.31, cost_unknown: false, sell_unknown: false, notes: "Sell on the San Antonio list is below the 2026 cost.", sort_order: 6, active: true },
  { id: "a5f10000-0000-4000-8000-000000000008", company_id: TURF_COMPANY_ID, name: "Emerald", category: "Turf", unit: "SF", pack: "15' x 100'", supplier_name: "Realturf Dallas", cost: 1.29, sell_price: 1.41, cost_unknown: false, sell_unknown: false, notes: "", sort_order: 7, active: true },
];

export function eeMidlandLines() {
  return [
    { id: "a5f40000-0000-4000-8000-000000000001", order_id: EE_ORDER_ID, product_id: PREVIEW_PRODUCTS[0].id, description: "Kentucky Pro", detail: "Turf, per SF", unit: "SF", qty: 3000, rate: 1.86, unit_cost: null, rate_unknown: false, cost_unknown: true, sort_order: 1 },
    { id: "a5f40000-0000-4000-8000-000000000002", order_id: EE_ORDER_ID, product_id: PREVIEW_PRODUCTS[4].id, description: "Pad", detail: "per SF", unit: "SF", qty: 2306, rate: null, unit_cost: null, rate_unknown: true, cost_unknown: true, sort_order: 2 },
    { id: "a5f40000-0000-4000-8000-000000000003", order_id: EE_ORDER_ID, product_id: PREVIEW_PRODUCTS[1].id, description: "Nails 40D 5\"", detail: "50 lb box", unit: "Box", qty: 4, rate: 74, unit_cost: 55, rate_unknown: false, cost_unknown: false, sort_order: 3 },
    { id: "a5f40000-0000-4000-8000-000000000004", order_id: EE_ORDER_ID, product_id: PREVIEW_PRODUCTS[2].id, description: "Seaming Tape 330'", detail: "330 feet long (12\" wide)", unit: "Roll", qty: 1, rate: 134, unit_cost: 119, rate_unknown: false, cost_unknown: false, sort_order: 4 },
    { id: "a5f40000-0000-4000-8000-000000000005", order_id: EE_ORDER_ID, product_id: PREVIEW_PRODUCTS[5].id, description: "Adhesive 5 Gal Bucket", detail: "", unit: "Bucket", qty: 1, rate: null, unit_cost: null, rate_unknown: true, cost_unknown: true, sort_order: 5 },
    { id: "a5f40000-0000-4000-8000-000000000006", order_id: EE_ORDER_ID, product_id: PREVIEW_PRODUCTS[3].id, description: "Silica Sand 16/30", detail: "Infill, 50 lb bags", unit: "Bag", qty: 50, rate: 5.5, unit_cost: 4.5, rate_unknown: false, cost_unknown: false, sort_order: 6 },
  ];
}

export function eeMidlandOrder() {
  return {
    id: EE_ORDER_ID,
    company_id: TURF_COMPANY_ID,
    customer_id: EE,
    order_number: "EE-MID-2026-11",
    status: "quote",
    contact_name: "Jayesh",
    bill_to_name: "Extreme Exteriors",
    bill_to_address: "5111 E Hwy 80\nMidland, TX 79705",
    deliver_to: "",
    delivery_fee: 400,
    tax_rate: 0.0825,
    payment_method: "Check",
    invoice_date: "2026-11-17",
    schedule_date: null,
    crew: "",
    next_action: "Price the pad and the 5-gal adhesive",
    notes: "Draft invoice. Pad and 5-gal adhesive are not priced.",
  };
}

// Dates are the week of 17 Nov 2026 so the preview calendar opens on them.
// These install jobs and the extra orders exist only in this preview.
export function previewModel() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    customers: PREVIEW_CUSTOMERS.map((row) => ({ ...row })),
    products: PREVIEW_PRODUCTS.map((row) => ({ ...row })),
    orders: [
      eeMidlandOrder(),
      {
        id: "preview-order-spo",
        company_id: TURF_COMPANY_ID,
        customer_id: SPO,
        order_number: "SPO-PICKUP-1120",
        status: "ordered",
        contact_name: "Dale Garner",
        bill_to_name: "Spanish Oaks Landscapes",
        bill_to_address: "635 TX-46\nBoerne, TX 78006",
        deliver_to: "Yard pickup",
        delivery_fee: 0,
        tax_rate: 0.0825,
        payment_method: "Check",
        invoice_date: "2026-11-18",
        schedule_date: "2026-11-20",
        crew: "Christian",
        next_action: "Stage the seam tape and nails",
        notes: "Preview pickup. Not written to the database.",
      },
      {
        id: "preview-order-kingdom",
        company_id: TURF_COMPANY_ID,
        customer_id: KINGDOM,
        order_number: "KD-DEL-1116",
        status: "quote",
        contact_name: "",
        bill_to_name: "Kingdom Driven",
        bill_to_address: "",
        deliver_to: "Customer yard",
        delivery_fee: 400,
        tax_rate: 0.0825,
        payment_method: "Check",
        invoice_date: null,
        schedule_date: "2026-11-16",
        crew: "Delivery",
        next_action: "Confirm the gate code",
        notes: "Preview delivery. Not written to the database.",
      },
      {
        id: "preview-order-npt",
        company_id: TURF_COMPANY_ID,
        customer_id: POOLCORP,
        order_number: "NPT-QUOTE",
        status: "quote",
        contact_name: "",
        bill_to_name: "PoolCorp / NPT",
        bill_to_address: "",
        deliver_to: "",
        delivery_fee: 400,
        tax_rate: 0.0825,
        payment_method: "Check",
        invoice_date: null,
        schedule_date: null,
        crew: "",
        next_action: "Send the current price list",
        notes: "No delivery date yet.",
      },
    ],
    lines: [
      ...eeMidlandLines(),
      { id: "preview-line-spo", order_id: "preview-order-spo", product_id: PREVIEW_PRODUCTS[2].id, description: "Seaming Tape 330'", detail: "330 feet long (12\" wide)", unit: "Roll", qty: 2, rate: 134, unit_cost: 119, rate_unknown: false, cost_unknown: false, sort_order: 1 },
      { id: "preview-line-kd", order_id: "preview-order-kingdom", product_id: PREVIEW_PRODUCTS[7].id, description: "Emerald", detail: "per SF", unit: "SF", qty: 1500, rate: 1.41, unit_cost: 1.29, rate_unknown: false, cost_unknown: false, sort_order: 1 },
    ],
    jobs: [],
    leads: LIVE_TURF_LEADS.map((row) => ({ ...row })),
    projects: LIVE_TURF_PROJECTS.map((row) => ({ ...row })),
    estimates: [],
    events: [],
    purchases: [
      {
        id: "a5f50000-0000-4000-8000-000000000001",
        company_id: TURF_COMPANY_ID,
        order_id: EE_ORDER_ID,
        supplier_name: "Realturf Dallas",
        po_number: "",
        status: "needed",
        amount: null,
        notes: "Kentucky Pro cost is not on file. Pad and 5-gal adhesive are not priced.",
      },
    ],
    payments: [],
  };
}

export function blankJob(partial = {}) {
  return {
    id: newId(),
    company_id: TURF_COMPANY_ID,
    name: "",
    customer_name: "",
    address: "",
    stage: "lead",
    crew: "",
    scheduled_on: null,
    materials: "",
    next_action: "",
    notes: "",
    sell_amount: null,
    cost_amount: null,
    lead_id: null,
    project_id: null,
    distribution_order_id: null,
    ...partial,
  };
}

export function blankOrder(settings, partial = {}) {
  return {
    id: newId(),
    company_id: TURF_COMPANY_ID,
    customer_id: null,
    order_number: "",
    status: "quote",
    contact_name: "",
    bill_to_name: "",
    bill_to_address: "",
    deliver_to: "",
    delivery_fee: settings?.default_delivery ?? 400,
    tax_rate: settings?.tax_rate ?? 0.0825,
    payment_method: "Check",
    invoice_date: null,
    schedule_date: null,
    crew: "",
    next_action: "",
    notes: "",
    ...partial,
  };
}

export function blankLine(orderId, partial = {}) {
  return {
    id: newId(),
    order_id: orderId,
    product_id: null,
    description: "",
    detail: "",
    unit: "SF",
    qty: 1,
    rate: null,
    unit_cost: null,
    rate_unknown: true,
    cost_unknown: true,
    sort_order: 1,
    ...partial,
  };
}
