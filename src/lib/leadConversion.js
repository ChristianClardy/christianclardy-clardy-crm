import { base44 } from "@/api/base44Client";
import { LEAD_STAGES, PROSPECT_THRESHOLD_STAGE, WON_STATUS } from "@/lib/leadStages";

// Deal.stage key the Pipeline board (PipelineView.jsx) uses for a won deal.
const PIPELINE_WON_STAGE = "Closed Won";

function firstMatch(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// Finds the Client (contact book) record for a Lead — by linked_contact_id
// first, then falling back to email/phone so duplicate contacts aren't
// created for someone who already exists in the contact book.
async function findExistingClient(lead) {
  if (lead.linked_contact_id) {
    const match = firstMatch(await base44.entities.Client.filter({ id: lead.linked_contact_id }));
    if (match) return match;
  }
  if (lead.email) {
    const match = firstMatch(await base44.entities.Client.filter({ email: lead.email }));
    if (match) return match;
  }
  if (lead.phone) {
    const match = firstMatch(await base44.entities.Client.filter({ phone: lead.phone }));
    if (match) return match;
  }
  return null;
}

/**
 * Ensures a Lead has a matching contact-book (Client) record, creating one
 * from the lead's details if none exists yet, and linking both records
 * together. Safe to call repeatedly.
 */
export async function ensureContactForLead(lead) {
  let client = await findExistingClient(lead);

  if (!client) {
    client = await base44.entities.Client.create({
      name: lead.full_name,
      email: lead.email || "",
      phone: lead.phone || "",
      address: lead.property_address || "",
      notes: lead.notes || "",
      status: "active",
      linked_lead_id: lead.id,
    });
  } else if (!client.linked_lead_id) {
    await base44.entities.Client.update(client.id, { linked_lead_id: lead.id });
    client = { ...client, linked_lead_id: lead.id };
  }

  if (lead.linked_contact_id !== client.id) {
    await base44.entities.Lead.update(lead.id, { linked_contact_id: client.id });
  }

  return client;
}

// Finds the Deal already pushed to the Pipeline board for this Lead, if any,
// so winning a lead twice (or a stray re-render) updates it instead of
// creating a duplicate.
async function findExistingDealForLead(leadId) {
  const matches = await base44.entities.Deal.filter({ lead_id: leadId });
  return Array.isArray(matches) && matches.length > 0 ? matches[0] : null;
}

// Reaching WON_STATUS pushes the lead's (and its contact-book Client's)
// details into a Deal on the Pipeline board, landed directly in Closed Won.
async function pushWonLeadToPipeline(lead, client) {
  const payload = {
    title: client?.name || lead.full_name,
    value: Number(lead.estimated_budget) || 0,
    stage: PIPELINE_WON_STAGE,
    probability: 100,
    assigned_to: lead.assigned_sales_rep || "",
    lead_id: lead.id,
    won_at: new Date().toISOString(),
  };

  const existingDeal = await findExistingDealForLead(lead.id);
  if (existingDeal) {
    await base44.entities.Deal.update(existingDeal.id, payload);
  } else {
    await base44.entities.Deal.create(payload);
  }
}

/**
 * Updates a Lead's pipeline stage. Reaching PROSPECT_THRESHOLD_STAGE or later
 * flips the persistent is_prospect badge on — it never reverts automatically.
 * Reaching WON_STATUS also pushes the lead into the Pipeline board as a deal.
 */
export async function setLeadStatus(lead, newStatus) {
  const shouldBeProspect = LEAD_STAGES.indexOf(newStatus) >= LEAD_STAGES.indexOf(PROSPECT_THRESHOLD_STAGE);
  const is_prospect = lead.is_prospect || shouldBeProspect;
  // Crossing the threshold needs a Client row to exist — Prospects.jsx is a
  // Client-based board and has nothing to show without one.
  if (is_prospect && !lead.linked_contact_id) {
    await ensureContactForLead(lead);
  }
  const updatedLead = await base44.entities.Lead.update(lead.id, { status: newStatus, is_prospect });

  if (newStatus === WON_STATUS) {
    const client = await ensureContactForLead(updatedLead);
    await pushWonLeadToPipeline(updatedLead, client);
  }

  return updatedLead;
}

/**
 * Marks a Lead Lost/No Decision along with a reason code (and optional free
 * text detail) for why it was lost. Also used to edit the reason on a lead
 * that's already in this stage — setLeadStatus is a no-op status-wise then,
 * but harmless to re-run.
 */
export async function markLeadLost(lead, { reason = "", notes = "" } = {}) {
  await setLeadStatus(lead, "Lost/No Decision");
  const payload = { lost_reason: reason || null, lost_reason_notes: notes || null };
  return await base44.entities.Lead.update(lead.id, payload);
}

/**
 * Manually promotes a Lead to Prospect (e.g. before it reaches the normal
 * threshold stage). Ensures its contact-book record exists so billing/project
 * flows have a Client to attach to, then flags the Lead itself as a prospect.
 */
export async function promoteLeadToProspect(lead) {
  await ensureContactForLead(lead);
  await base44.entities.Lead.update(lead.id, { is_prospect: true });
  return { ...lead, is_prospect: true };
}
