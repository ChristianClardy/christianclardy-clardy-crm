// Pure helpers for the lead / client / project Files sections.
// No network calls, so the carry rules can be checked without a database.

export const OPEN_PROJECT_STATUSES = ["planning", "in_progress", "on_hold"];

export function mergeAttachmentLists(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const att of list || []) {
      if (!att?.id || seen.has(att.id)) continue;
      if (att.url && seen.has(`url:${att.url}`)) continue;
      seen.add(att.id);
      if (att.url) seen.add(`url:${att.url}`);
      out.push(att);
    }
  }
  out.sort((a, b) => new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0));
  return out;
}

export function leadFileQueries(lead) {
  if (!lead?.id) return [];
  const queries = [
    { entity_type: "lead", entity_id: lead.id },
    { origin_entity_type: "lead", origin_entity_id: lead.id },
  ];
  if (lead.linked_contact_id) {
    queries.push(
      { entity_type: "client", entity_id: lead.linked_contact_id },
      { origin_entity_type: "client", origin_entity_id: lead.linked_contact_id },
    );
  }
  return queries;
}

export function clientFileQueries(clientId, leadIds) {
  if (!clientId) return [];
  const queries = [
    { entity_type: "client", entity_id: clientId },
    { origin_entity_type: "client", origin_entity_id: clientId },
  ];
  for (const leadId of leadIds || []) {
    if (!leadId) continue;
    queries.push(
      { entity_type: "lead", entity_id: leadId },
      { origin_entity_type: "lead", origin_entity_id: leadId },
    );
  }
  return queries;
}

export function projectFileQueries(projectId, clientId, leadIds) {
  const queries = [];
  if (projectId) queries.push({ entity_type: "project", entity_id: projectId });
  if (clientId) queries.push({ entity_type: "client", entity_id: clientId });
  for (const leadId of leadIds || []) {
    if (leadId) queries.push({ entity_type: "lead", entity_id: leadId });
  }
  return queries;
}

// Same decision the SQL function carry_lead_files makes.
export function leadFileDestination(clientId, projects) {
  if (!clientId) return null;
  const open = (projects || []).filter((project) => OPEN_PROJECT_STATUSES.includes(project.status));
  if (open.length === 1) return { entityType: "project", entityId: open[0].id };
  return { entityType: "client", entityId: clientId };
}
