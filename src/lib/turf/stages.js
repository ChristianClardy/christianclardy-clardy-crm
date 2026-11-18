const BID_SENT = new Set([
  "Estimate In Progress",
  "Quote Delivered/Price Locked",
  "In Financing",
  "Negotiating/Revising Scope",
  "proposal",
  "qualified",
]);

const CLOSED_LEAD = new Set(["Lost/No Decision", "lost"]);

export function isClosedLead(status) {
  return CLOSED_LEAD.has(String(status || ""));
}

// A lead is sold when the contract is signed. Open quotes stay in the CRM.
export function isSoldLead(status) {
  const value = String(status || "").toLowerCase();
  return value === "won" || value.includes("contract signed") || value.includes("(won)");
}

export function isSoldEstimate(status) {
  return /accepted|approved|sold|won|signed|converted/i.test(String(status || ""));
}

// Map the existing lead pipeline onto the shorter install board. This does
// not write the lead, so it cannot enroll a message drip.
export function leadToInstallStage(status) {
  const value = String(status || "");
  if (CLOSED_LEAD.has(value)) return "lost";
  if (value === "Contract Signed/Deposit Collected (Won)" || value === "won") return "approved";
  if (BID_SENT.has(value)) return "bid_sent";
  return "lead";
}

export function projectToInstallStage(project, collected) {
  if (!project || project.status === "cancelled") return "lost";
  const sell = Number(project.contract_value) || 0;
  const paid = Number(collected) || 0;
  if (project.status === "completed" && sell > 0 && paid + 0.005 >= sell) return "paid";
  if (project.status === "completed") return "installed";
  if (project.status === "in_progress" || project.start_date) return "scheduled";
  return "approved";
}
