// Turf'n Texas is one company inside Clardy.io. Every turf row is pinned to
// this id in the database so it cannot be filed under another brand.
export const TURF_COMPANY_ID = "053ff852-852b-4709-8b3b-3fb27c43c0ab";
// Clardy Construction, LLC. Same organization 065 backfills and this
// migration stamps onto every turf row.
export const CLARDY_ORG_ID = "2c9485d2-9b17-48d4-bea7-72770c1e9eb9";
// Tenant module keys reserved by migration 065. Install is the job board.
// Distribution is wholesale orders, the catalog, and deliveries.
export const INSTALL_MODULE = "install";
export const DISTRIBUTION_MODULE = "distribution";
export const TURF_COMPANY_NAME = "Turf'n Texas";

// The draft Midland order uses this id in the migration and in the preview.
export const EE_ORDER_ID = "a5f30000-0000-4000-8000-000000000001";

export const INSTALL_STAGES = [
  { key: "lead", label: "Lead" },
  { key: "bid_sent", label: "Bid sent" },
  { key: "approved", label: "Approved" },
  { key: "scheduled", label: "Scheduled" },
  { key: "installed", label: "Installed" },
  { key: "paid", label: "Paid" },
];

export const ORDER_STATUSES = [
  { key: "quote", label: "Quote" },
  { key: "ordered", label: "Ordered from supplier" },
  { key: "delivered", label: "Picked up / delivered" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
];

export const PURCHASE_STATUSES = [
  { key: "needed", label: "Needed" },
  { key: "ordered", label: "Ordered" },
  { key: "picked_up", label: "Picked up" },
  { key: "paid", label: "Paid" },
];

export const DEFAULT_TAX_RATE = 0.0825;
export const DEFAULT_DELIVERY = 400;

export const DEFAULT_SETTINGS = {
  company_id: TURF_COMPANY_ID,
  company_name: "Turf'N Texas",
  remit_name: "Christian Clardy",
  remit_address: "5882 Caruth Haven Ln\nApt 1302\nDallas, TX 75206",
  thank_you: "We appreciate your business. Please find your invoice details here. Feel free to contact us if you have any questions.",
  signature_name: "Christian Clardy",
  tax_rate: DEFAULT_TAX_RATE,
  default_delivery: DEFAULT_DELIVERY,
};

// Stage filter shared by the schedule and the unscheduled report.
// "paid" matches both tracks. The others belong to one track.
export const STAGE_FILTERS = [
  { key: "lead", label: "Lead", track: "install" },
  { key: "bid_sent", label: "Bid sent", track: "install" },
  { key: "approved", label: "Approved", track: "install" },
  { key: "scheduled", label: "Scheduled", track: "install" },
  { key: "installed", label: "Installed", track: "install" },
  { key: "quote", label: "Quote", track: "distribution" },
  { key: "ordered", label: "Ordered from supplier", track: "distribution" },
  { key: "delivered", label: "Picked up / delivered", track: "distribution" },
  { key: "invoiced", label: "Invoiced", track: "distribution" },
  { key: "paid", label: "Paid", track: "both" },
];

// access is null when company-access helpers are not in the database yet
// (the sidebar then keeps showing every company). A loaded access object
// hides Turf'n Texas from anyone who is not the owner and not assigned.
export function canSeeTurf(access) {
  if (access == null) return true;
  if (access.isOwner) return true;
  return (access.companyIds || []).includes(TURF_COMPANY_ID);
}

export function stageLabel(track, status) {
  const list = track === "distribution" ? ORDER_STATUSES : INSTALL_STAGES;
  return list.find((item) => item.key === status)?.label || status || "—";
}
