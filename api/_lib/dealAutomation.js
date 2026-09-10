// Runs when a DocuSign envelope's status transitions to 'completed' — the
// contract came back fully signed. Creates/advances a `deals` row so a Deal
// exists in the Pipeline without one having to be created first (see
// src/components/crm/ContractsPanel.jsx, which can send a contract straight
// from a Lead, no Deal required). Called from both api/docusign-webhook.js
// (the real-time path) and api/docusign-status.js (the manual-refresh poller,
// for parity in case a webhook delivery is ever missed).
//
// Safe to call more than once for the same envelope — every path here is a
// find-or-update against `deals.lead_id`, not a blind insert, matching the
// same dedup `pushWonLeadToPipeline` (src/lib/leadConversion.js) already uses
// for the existing "Lead marked Won manually" flow.

const { sbGetById, sbList, sbInsert, sbUpdate } = require('./supabaseAdmin.js');

const WON_STATUS = 'Contract Signed/Deposit Collected (Won)';

async function handleEnvelopeCompleted(entityType, entityId) {
  if (!entityType || !entityId) return;
  try {
    if (entityType === 'lead') {
      await advanceFromLead(entityId);
    } else if (entityType === 'deal') {
      await advanceExistingDeal(entityId);
    }
  } catch (err) {
    // Never let this break envelope status tracking — that's the caller's
    // real responsibility, deal automation is a best-effort side effect.
    console.error('dealAutomation.handleEnvelopeCompleted failed:', err.message);
  }
}

async function advanceFromLead(leadId) {
  const lead = await sbGetById('leads', leadId);
  if (!lead) return;

  let clientName = lead.full_name;
  if (lead.linked_contact_id) {
    const client = await sbGetById('clients', lead.linked_contact_id);
    if (client?.name) clientName = client.name;
  }

  const wonAt = new Date().toISOString();
  const existing = await sbList('deals', { filters: { lead_id: `eq.${leadId}` }, limit: 1 });
  if (existing[0]) {
    await sbUpdate('deals', existing[0].id, { stage: 'Closed Won', won_at: wonAt });
  } else {
    await sbInsert('deals', {
      title: clientName,
      value: Number(lead.estimated_budget) || 0,
      stage: 'Closed Won',
      probability: 100,
      assigned_to: lead.assigned_sales_rep || '',
      lead_id: leadId,
      won_at: wonAt,
    });
  }

  if (lead.status !== WON_STATUS) {
    await sbUpdate('leads', leadId, { status: WON_STATUS, status_changed_at: wonAt });
  }
}

async function advanceExistingDeal(dealId) {
  const deal = await sbGetById('deals', dealId);
  if (!deal || deal.stage === 'Closed Won') return;
  await sbUpdate('deals', dealId, { stage: 'Closed Won', won_at: new Date().toISOString() });
}

module.exports = { handleEnvelopeCompleted };
