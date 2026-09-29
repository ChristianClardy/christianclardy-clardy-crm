// Principle Outdoor Living — Pool Construction Barrier Safety Policy.
// Mirrors "Daily Subcontractor Barrier Checklist.docx" (sections A–D) and
// "Subcontractor Requirements for Barrier Policy.docx" (acknowledgment terms).
// Item keys are persisted in barrier_daily_logs.checklist — don't rename them.

export const CHECKLIST_SECTIONS = [
  {
    key: "start",
    title: "A. Start-of-Day Inspection",
    items: [
      ["start_surrounds", "Construction barrier completely surrounds pool/excavation"],
      ["start_height", "Temporary fencing is at least 4 feet high"],
      ["start_secure", "Fence is secure and properly positioned"],
      ["start_no_gaps", "No significant gaps or openings exist"],
      ["start_not_damaged", "Fence has not been damaged or displaced"],
      ["start_gate_present", "Gate is present and functional"],
      ["start_gate_closes", "Gate closes and can be secured"],
      ["start_no_ladder", "No ladder or equipment creates climbing access"],
      ["start_no_materials", "No materials create an access point"],
      ["start_excavation", "Excavation is completely secured"],
    ],
  },
  {
    key: "during",
    title: "B. During-Construction Inspection",
    items: [
      ["during_in_place", "Barrier remains continuously in place"],
      ["during_gates", "Gates remain controlled"],
      ["during_openings", "Temporary openings are immediately secured"],
      ["during_subs", "Subcontractors have not compromised barrier"],
      ["during_equipment", "Equipment/material placement does not facilitate access"],
      ["during_damage_fixed", "Damaged fencing has been corrected"],
      ["during_inaccessible", "Pool area remains inaccessible to unauthorized persons"],
    ],
  },
  {
    key: "end",
    title: "C. End-of-Day Security Check",
    items: [
      ["end_enclosed", "Pool/excavation completely enclosed"],
      ["end_gates_closed", "All gates closed"],
      ["end_gates_secured", "All gates secured"],
      ["end_no_gaps", "No barrier openings or gaps"],
      ["end_no_ladders", "No ladders against barrier"],
      ["end_no_equipment", "No equipment positioned against barrier"],
      ["end_no_debris", "No debris creates access"],
      ["end_not_compromised", "Barrier has not been compromised"],
      ["end_overnight", "Site is secure for overnight conditions"],
    ],
  },
  {
    key: "permanent",
    title: "D. Permanent Barrier Inspection",
    optional: true,
    note: "ISPSC: minimum 48-inch barrier height; openings must not pass a 4-inch sphere; specific gate and latch requirements apply.",
    items: [
      ["perm_height", "Barrier height verified"],
      ["perm_clearance", "Bottom clearance verified"],
      ["perm_openings", "Openings verified"],
      ["perm_climbing", "Climbing hazards checked"],
      ["perm_spacing", "Horizontal/vertical spacing checked where applicable"],
      ["perm_gate_outward", "Gate opens outward where applicable"],
      ["perm_self_closing", "Gate is self-closing"],
      ["perm_self_latching", "Gate is self-latching"],
      ["perm_locking", "Gate accommodates locking device"],
      ["perm_latch_location", "Latch/release location verified where applicable"],
      ["perm_clear_zone", "Equipment clear zone verified where applicable"],
      ["perm_ladders", "Ladders/steps secured where applicable"],
      ["perm_documented", "Final barrier condition documented"],
    ],
  },
];

export const CERTIFICATION_TEXT =
  "I certify that I inspected the pool construction barrier and, to the best of my knowledge, the site was secured in accordance with the Principle Outdoor Living Pool Construction Barrier Safety Policy.";

// The one Subcontractor Agreement every sub signs, whatever their trade.
// Signing it is what the "signed" status on a sub means everywhere.
export const AGREEMENT_TITLE = "Principle Outdoor Living Subcontractor Agreement";

export const ACKNOWLEDGMENT_TEXT =
  "The undersigned acknowledges receipt of the Principle Outdoor Living Subcontractor Agreement and agrees to comply with it on every Principle Outdoor Living project, including the pool construction barrier safety requirements on any pool or spa project, the Friday payment schedule, and the subcontractor direct warranty and charge back terms described above.";

// Barrier items are condensed from sections 2–9 of the barrier requirements
// doc; they apply whenever the sub works on a pool or spa project. Payment,
// warranty and charge back terms apply to all work. Shown before signing.
export const SUB_REQUIREMENTS = [
  ["Pool barrier safety (pool and spa projects)", "Items 2–9 apply whenever Subcontractor works on a Principle pool or spa project, whatever Subcontractor's trade."],
  ["No unsecured pool excavation", "Never leave an excavation or partially completed pool unsecured. If a barrier is damaged, missing, displaced, or inadequate: secure the area, notify the Principle Site Supervisor or PM, prevent unauthorized access, and don't leave until it's addressed."],
  ["Fencing", "Construction fencing (min. 4 ft high) surrounds the pool site from excavation until the permanent barrier is complete. Never remove, relocate, cut, or compromise it without Principle's authorization."],
  ["Gates", "Keep construction gates closed and secured when not in active use. Never prop open, leave unsecured, disable locks, remove hardware, or leave a gate open when leaving the property."],
  ["Materials & equipment", "Never place ladders, scaffolding, machinery, materials, debris, furniture, or other objects where they create a way to climb over or enter the barrier."],
  ["Temporary removal", "Coordinate with Principle before temporarily removing/relocating fencing. Control the opening for the shortest practical time and restore the barrier immediately after."],
  ["Damage to barrier", "Any sub that damages a barrier must immediately notify Principle and help restore it. Don't assume another contractor will find or fix it."],
  ["Permanent barrier work", "Follow approved plans, manufacturer's instructions, applicable requirements, and Principle's direction (height, clearance, openings, gate, latch, access control)."],
  ["Stop-work", "Principle may stop work whenever a sub's activities create an unsafe or unsecured pool-access condition. Work resumes only once corrected to Principle's satisfaction."],
  ["Payment schedule", "Payouts and payments are made on Fridays. Work must be completed by Wednesday at 5:00 PM to be paid that Friday. Work completed after Wednesday at 5:00 PM will be paid the following Friday."],
  ["Subcontractor direct warranty", "Subcontractor directly warrants its own work and materials to Principle and the homeowner. Subcontractor must take care of any warranty call within 2 weeks (14 days) of being notified by Principle."],
  ["What is warrantable", "Not every call is a warranty item. Warranty covers defects in Subcontractor's workmanship or in materials Subcontractor supplied or installed. It does not cover normal wear and tear, damage caused by the homeowner or others, misuse or lack of maintenance, weather or acts of nature, or work and materials Subcontractor did not perform or supply. Principle will tell Subcontractor, with each warranty call, why it is Subcontractor's responsibility."],
  ["Charge back", "If Subcontractor does not take care of a warrantable call within 2 weeks, Principle will have the warranty work completed and the full cost will be charged back to Subcontractor. The charge back will be deducted from Subcontractor's next check, or, if no payment is due, billed to Subcontractor's company."],
];

export const ITEM_STATES = ["pass", "fail", "na"];

// Each photo on a daily log is either job progress or fence/barrier
// compliance documentation (the checklist's "Photographic Documentation").
// Photos saved before this split have no `kind` and count as progress.
export const FENCE_CHECKPOINTS = [
  { value: "start", label: "Start of day" },
  { value: "end", label: "End of day" },
  { value: "other", label: "Other / repair" },
];

export const photoKind = (photo) => (photo?.kind === "fence" ? "fence" : "progress");
export const progressPhotos = (log) => (log?.photos || []).filter((p) => photoKind(p) === "progress");
export const fencePhotos = (log) => (log?.photos || []).filter((p) => photoKind(p) === "fence");

export function applicableSections(log) {
  return CHECKLIST_SECTIONS.filter((s) => !s.optional || log?.permanent_inspection);
}

// Summarize a log's daily fence compliance for badges and the dashboard.
//   compliant  — every applicable item answered with no open failures, at
//                least one fence photo, and certified
//   deficiency — a failed item or reported deficiency not yet marked corrected
//   incomplete — anything else (unanswered items, no fence photo, not certified)
// The fence photo counts as one required item in answered/total.
export function logStatus(log) {
  const checklist = log?.checklist || {};
  const items = applicableSections(log).flatMap((s) => s.items.map(([k]) => k));
  const hasFencePhoto = fencePhotos(log).length > 0;
  const answered = items.filter((k) => checklist[k]).length + (hasFencePhoto ? 1 : 0);
  const total = items.length + 1;
  const failed = items.filter((k) => checklist[k] === "fail").length;
  const corrected = !!log?.corrected_at;
  const openDeficiency = (failed > 0 || log?.deficiency_found) && !corrected;
  let status = "incomplete";
  if (openDeficiency) status = "deficiency";
  else if (answered === total && log?.certified) status = "compliant";
  return { status, answered, total, failed, hasFencePhoto };
}

export const STATUS_STYLES = {
  compliant: { label: "Compliant", className: "bg-emerald-100 text-emerald-700" },
  deficiency: { label: "Open deficiency", className: "bg-red-100 text-red-700" },
  incomplete: { label: "Incomplete", className: "bg-amber-100 text-amber-700" },
};
