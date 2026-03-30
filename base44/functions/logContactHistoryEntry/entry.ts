import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function nowIso() {
  return new Date().toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const event = payload?.event;
    const data = payload?.data;
    const oldData = payload?.old_data;

    if (!event || !data || !["Lead", "Client"].includes(event.entity_name)) {
      return Response.json({ skipped: true, reason: 'No supported entity event provided.' });
    }

    const historyEntries = [];

    if (event.entity_name === 'Lead') {
      if (event.type === 'create') {
        historyEntries.push({
          linked_lead_id: data.id,
          linked_client_id: data.linked_contact_id || '',
          contact_name: data.full_name || '',
          entry_type: 'system',
          title: 'Lead created',
          details: `Lead entered the CRM${data.status ? ` with status: ${data.status}` : ''}.`,
          entry_datetime: nowIso(),
          source_entity: 'lead',
        });
      }

      if (event.type === 'update' && oldData && data.status !== oldData.status) {
        historyEntries.push({
          linked_lead_id: data.id,
          linked_client_id: data.linked_contact_id || oldData.linked_contact_id || '',
          contact_name: data.full_name || oldData.full_name || '',
          entry_type: 'status_change',
          title: 'Lead status changed',
          details: `Lead moved from ${oldData.status || 'No status'} to ${data.status || 'No status'}.`,
          entry_datetime: nowIso(),
          status_from: oldData.status || '',
          status_to: data.status || '',
          source_entity: 'lead',
        });
      }
    }

    if (event.entity_name === 'Client') {
      if (event.type === 'create') {
        historyEntries.push({
          linked_lead_id: data.linked_lead_id || '',
          linked_client_id: data.id,
          contact_name: data.name || '',
          entry_type: 'system',
          title: 'Contact created',
          details: `Contact entered the CRM${data.workflow_stage ? ` in ${data.workflow_stage}` : ''}.`,
          entry_datetime: nowIso(),
          source_entity: 'client',
        });
      }

      if (event.type === 'update' && oldData && data.workflow_stage !== oldData.workflow_stage) {
        historyEntries.push({
          linked_lead_id: data.linked_lead_id || oldData.linked_lead_id || '',
          linked_client_id: data.id,
          contact_name: data.name || oldData.name || '',
          entry_type: 'status_change',
          title: 'Workflow stage changed',
          details: `Contact moved from ${oldData.workflow_stage || 'No stage'} to ${data.workflow_stage || 'No stage'}.`,
          entry_datetime: nowIso(),
          status_from: oldData.workflow_stage || '',
          status_to: data.workflow_stage || '',
          source_entity: 'client',
        });
      }

      if (event.type === 'update' && oldData && data.status !== oldData.status) {
        historyEntries.push({
          linked_lead_id: data.linked_lead_id || oldData.linked_lead_id || '',
          linked_client_id: data.id,
          contact_name: data.name || oldData.name || '',
          entry_type: 'status_change',
          title: 'Contact status changed',
          details: `Contact moved from ${oldData.status || 'No status'} to ${data.status || 'No status'}.`,
          entry_datetime: nowIso(),
          status_from: oldData.status || '',
          status_to: data.status || '',
          source_entity: 'client',
        });
      }
    }

    if (!historyEntries.length) {
      return Response.json({ skipped: true, reason: 'No history change detected.' });
    }

    await Promise.all(
      historyEntries.map((entry) => base44.asServiceRole.entities.ContactHistory.create(entry))
    );

    return Response.json({ success: true, created: historyEntries.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});