// Single source of truth for the Lead pipeline. Previously LeadDetail.jsx and
// LeadList.jsx each hardcoded their own overlapping stage lists that drifted
// out of sync with each other.
export const LEAD_STAGES = [
  "New Lead",
  "Contact Attempted",
  "Contacted",
  "Appointment Scheduled",
  "Site Visit Complete",
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
