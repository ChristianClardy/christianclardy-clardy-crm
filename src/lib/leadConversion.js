import { base44 } from "@/api/base44Client";

// Client.workflow_stage values that already represent an active prospect or
// further along the pipeline — conversion should never downgrade these.
const PROSPECT_OR_LATER = new Set(["proposal_sent", "negotiating", "approved", "completed", "closed"]);

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
 * Promotes a Lead into the Prospects pipeline: ensures its contact-book
 * record exists, then flags it as a prospect using the same fields the
 * Prospects workflow board already reads (see WorkflowDrawer.jsx).
 */
export async function convertLeadToProspect(lead) {
  const client = await ensureContactForLead(lead);

  const nextStage = PROSPECT_OR_LATER.has(client.workflow_stage) ? client.workflow_stage : "proposal_sent";

  await base44.entities.Client.update(client.id, {
    status: "prospect",
    workflow_stage: nextStage,
    sync_locked: true,
    linked_lead_id: lead.id,
  });

  return { ...client, status: "prospect", workflow_stage: nextStage, sync_locked: true };
}
