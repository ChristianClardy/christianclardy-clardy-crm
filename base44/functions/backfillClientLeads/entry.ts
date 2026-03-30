import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STAGE_STATUS_MAP = {
  new_lead: 'New Lead',
  contacted: 'Contacted',
  proposal_sent: 'Estimate Sent',
  negotiating: 'Negotiation',
  approved: 'Won',
  completed: 'Won',
  closed: 'Won',
  dead_lead: 'Lost',
};

function shouldSyncClient(client) {
  return Boolean(
    client?.linked_lead_id ||
    client?.customer_type === 'Prospect' ||
    client?.status === 'prospect' ||
    STAGE_STATUS_MAP[client?.workflow_stage]
  );
}

function buildLeadPayload(client) {
  return {
    full_name: client?.name || 'Unknown Lead',
    email: client?.email || '',
    phone: client?.phone || '',
    property_address: client?.address || '',
    notes: client?.notes || '',
    lead_source: 'Other',
    project_type: 'Other',
    assigned_sales_rep: client?.contact_person || 'Unassigned',
    status: STAGE_STATUS_MAP[client?.workflow_stage] || 'New Lead',
    linked_contact_id: client.id,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const clients = await base44.asServiceRole.entities.Client.list('-updated_date', 500);
    const leads = await base44.asServiceRole.entities.Lead.list('-updated_date', 500);

    const existingByClientId = new Set(leads.map((lead) => lead.linked_contact_id).filter(Boolean));
    const existingBySignature = new Set(
      leads.map((lead) => `${(lead.full_name || '').trim().toLowerCase()}::${(lead.email || '').trim().toLowerCase()}`)
    );

    const toCreate = clients
      .filter(shouldSyncClient)
      .filter((client) => {
        const signature = `${(client.name || '').trim().toLowerCase()}::${(client.email || '').trim().toLowerCase()}`;
        return !existingByClientId.has(client.id) && !existingBySignature.has(signature);
      })
      .map(buildLeadPayload);

    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.Lead.bulkCreate(toCreate);
    }

    return Response.json({ ok: true, scanned: clients.length, created: toCreate.length, skipped: clients.length - toCreate.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});