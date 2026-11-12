// Server-side twin of src/lib/carryFiles.js. The database triggers in
// 064_lead_client_files.sql do the same move inside the insert. This runs
// afterwards so a database that does not have that migration yet still
// re-links the row. Both paths update the same row; neither inserts a copy.
// If the trigger already moved the file, the source query is empty.

const { sbList, sbUpdate, sbFetch } = require('./supabaseAdmin.js');

const OPEN_PROJECT_STATUSES = ['planning', 'in_progress', 'on_hold'];

async function listFiles(type, id) {
  if (!id) return [];
  return sbList('attachments', {
    filters: { entity_type: `eq.${type}`, entity_id: `eq.${id}` },
    limit: 500,
  });
}

async function carryAttachments(fromType, fromId, toType, toId) {
  if (!fromId || !toId || (fromType === toType && fromId === toId)) return;
  const [source, dest] = await Promise.all([
    listFiles(fromType, fromId),
    listFiles(toType, toId),
  ]);
  const destUrls = new Set(dest.map((file) => file.url).filter(Boolean));
  for (const file of source) {
    if (file.url && destUrls.has(file.url)) {
      await sbFetch(`attachments?id=eq.${file.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      continue;
    }
    await sbUpdate('attachments', file.id, { entity_type: toType, entity_id: toId });
    if (file.url) destUrls.add(file.url);
  }
}

async function carryLeadFiles(leadId, clientId) {
  if (!leadId || !clientId) return;
  const projects = await sbList('projects', { select: 'id,status', filters: { client_id: `eq.${clientId}` }, limit: 100 });
  const open = projects.filter((project) => OPEN_PROJECT_STATUSES.includes(project.status));
  if (open.length === 1) {
    await carryAttachments('lead', leadId, 'project', open[0].id);
  } else {
    await carryAttachments('lead', leadId, 'client', clientId);
  }
}

async function carryContactFilesToProject(clientId, projectId) {
  if (!clientId || !projectId) return;
  await carryAttachments('client', clientId, 'project', projectId);
  const [leads, clients] = await Promise.all([
    sbList('leads', { select: 'id', filters: { linked_contact_id: `eq.${clientId}` }, limit: 100 }),
    sbList('clients', { select: 'linked_lead_id', filters: { id: `eq.${clientId}` }, limit: 1 }),
  ]);
  const leadIds = new Set(leads.map((lead) => lead.id));
  if (clients[0]?.linked_lead_id) leadIds.add(clients[0].linked_lead_id);
  for (const leadId of leadIds) {
    await carryAttachments('lead', leadId, 'project', projectId);
  }
}

module.exports = { carryLeadFiles, carryContactFilesToProject };
