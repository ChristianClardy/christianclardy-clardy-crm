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

function buildLeadPayload(client, existingLead) {
  const mappedStatus = STAGE_STATUS_MAP[client?.workflow_stage] || existingLead?.status || 'New Lead';
  return {
    full_name: client?.name || existingLead?.full_name || 'Unknown Lead',
    email: client?.email || existingLead?.email || '',
    phone: client?.phone || existingLead?.phone || '',
    property_address: client?.address || existingLead?.property_address || '',
    notes: existingLead?.notes || client?.notes || '',
    lead_source: existingLead?.lead_source || 'Other',
    project_type: existingLead?.project_type || 'Other',
    assigned_sales_rep: existingLead?.assigned_sales_rep || client?.contact_person || 'Unassigned',
    status: mappedStatus,
    linked_contact_id: client.id,
  };
}

async function syncOne(base44, client) {
  if (!client?.id || !shouldSyncClient(client)) {
    return { synced: false, skipped: true };
  }

  const leadById = client.linked_lead_id
    ? await base44.asServiceRole.entities.Lead.filter({ id: client.linked_lead_id }, '-updated_date', 1)
    : [];
  const leadByClient = await base44.asServiceRole.entities.Lead.filter({ linked_contact_id: client.id }, '-updated_date', 1);
  const existingLead = leadById[0] || leadByClient[0] || null;
  const leadPayload = buildLeadPayload(client, existingLead);

  if (existingLead) {
    await base44.asServiceRole.entities.Lead.update(existingLead.id, leadPayload);
    if (client.linked_lead_id !== existingLead.id) {
      await base44.asServiceRole.entities.Client.update(client.id, { linked_lead_id: existingLead.id });
    }
    return { synced: true, created: false, lead_id: existingLead.id };
  }

  const createdLead = await base44.asServiceRole.entities.Lead.create(leadPayload);
  await base44.asServiceRole.entities.Client.update(client.id, { linked_lead_id: createdLead.id });
  return { synced: true, created: true, lead_id: createdLead.id };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const client = payload?.data || payload?.client || null;

    if (!client) {
      return Response.json({ ok: true, skipped: true });
    }

    const result = await syncOne(base44, client);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});