// Single source of truth for the Lead pipeline. Previously LeadDetail.jsx and
// LeadList.jsx each hardcoded their own overlapping stage lists that drifted
// out of sync with each other.
export const LEAD_STAGES = [
  "New Lead",
  "Contact Attempted",
  "Contacted",
  "Appointment Scheduled",
  "Site Visit Complete",
  "Design Appointment Scheduled",
  "In Design",
  "Estimate In Progress",
  "Quote Delivered/Price Locked",
  "Negotiating/Revising Scope",
  "Contract Signed/Deposit Collected (Won)",
  "Lost/No Decision",
];

// A lead becomes a Prospect the moment it reaches this stage or later.
export const PROSPECT_THRESHOLD_STAGE = "In Design";

export const DEAD_LEAD_STATUSES = ["Lost/No Decision"];

// Fixed reason codes captured when a lead is marked Lost/No Decision, so the
// archived pipeline can be filtered and reported on by why deals were lost.
export const LOST_REASON_CODES = [
  "Price too high",
  "Went with a competitor",
  "Chose to DIY",
  "Timing not right",
  "Unresponsive / went dark",
  "Budget mismatch",
  "Outside service area",
  "Project cancelled",
  "Other",
];
