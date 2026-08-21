import { base44 } from "@/api/base44Client";
import { LEAD_STAGES, PROSPECT_THRESHOLD_STAGE } from "@/lib/leadStages";

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

/**
 * Updates a Lead's pipeline stage. Reaching PROSPECT_THRESHOLD_STAGE or later
 * flips the persistent is_prospect badge on — it never reverts automatically.
 */
export async function setLeadStatus(lead, newStatus) {
  const shouldBeProspect = LEAD_STAGES.indexOf(newStatus) >= LEAD_STAGES.indexOf(PROSPECT_THRESHOLD_STAGE);
  const is_prospect = lead.is_prospect || shouldBeProspect;
  // Crossing the threshold needs a Client row to exist — Prospects.jsx is a
  // Client-based board and has nothing to show without one.
  if (is_prospect && !lead.linked_contact_id) {
    await ensureContactForLead(lead);
  }
  await base44.entities.Lead.update(lead.id, { status: newStatus, is_prospect });
  return { ...lead, status: newStatus, is_prospect };
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
