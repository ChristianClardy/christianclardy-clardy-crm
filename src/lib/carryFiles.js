import { base44 } from "@/api/base44Client";
import {
  OPEN_PROJECT_STATUSES,
  mergeAttachmentLists,
  leadFileQueries,
  clientFileQueries,
  projectFileQueries,
  leadFileDestination,
} from "@/lib/fileQueries";

export {
  OPEN_PROJECT_STATUSES,
  mergeAttachmentLists,
  leadFileQueries,
  clientFileQueries,
  projectFileQueries,
  leadFileDestination,
};

// True once a read has shown this database has origin_entity_* columns
// (migration 064). False after a read proves it does not, so lead/client
// pages skip those filters instead of erroring on every refresh.
let originColumns = null;

function missingOriginColumn(error) {
  const msg = error?.message || String(error || "");
  return /origin_entity/i.test(msg) && /schema cache|could not find|column|does not exist/i.test(msg);
}

async function filterAttachments(filter) {
  const usesOrigin = "origin_entity_type" in filter || "origin_entity_id" in filter;
  if (usesOrigin && originColumns === false) return [];
  try {
    const rows = await base44.entities.Attachment.filter(filter, "-created_date");
    if (usesOrigin) originColumns = true;
    return rows || [];
  } catch (err) {
    if (usesOrigin && missingOriginColumn(err)) {
      originColumns = false;
      return [];
    }
    throw err;
  }
}

export async function loadMergedFiles(queries) {
  const lists = await Promise.all((queries || []).map((query) => filterAttachments(query)));
  return mergeAttachmentLists(lists);
}

export async function carryRecordFiles(fromType, fromId, toType, toId) {
  if (!fromId || !toId || (fromType === toType && fromId === toId)) return;
  const [source, dest] = await Promise.all([
    filterAttachments({ entity_type: fromType, entity_id: fromId }),
    filterAttachments({ entity_type: toType, entity_id: toId }),
  ]);
  const destUrls = new Set((dest || []).map((file) => file.url).filter(Boolean));
  for (const file of source || []) {
    if (file.url && destUrls.has(file.url)) {
      await base44.entities.Attachment.delete(file.id);
      continue;
    }
    await base44.entities.Attachment.update(file.id, { entity_type: toType, entity_id: toId });
    if (file.url) destUrls.add(file.url);
  }
}

// Lead → client, or straight onto the client's only open project.
export async function carryLeadFiles(leadId, clientId) {
  if (!leadId || !clientId) return;
  const projects = await base44.entities.Project.filter({ client_id: clientId }).catch(() => []);
  const dest = leadFileDestination(clientId, projects);
  if (!dest) return;
  await carryRecordFiles("lead", leadId, dest.entityType, dest.entityId);
}

// Client + its leads → this project. Files already on another project are
// not in these queries, so a second job does not take the first job's files.
export async function carryContactFilesToProject(clientId, projectId) {
  if (!clientId || !projectId) return;
  await carryRecordFiles("client", clientId, "project", projectId);
  const [leads, client] = await Promise.all([
    base44.entities.Lead.filter({ linked_contact_id: clientId }).catch(() => []),
    base44.entities.Client.get(clientId).catch(() => null),
  ]);
  const leadIds = new Set((leads || []).map((lead) => lead.id));
  if (client?.linked_lead_id) leadIds.add(client.linked_lead_id);
  for (const leadId of leadIds) {
    await carryRecordFiles("lead", leadId, "project", projectId);
  }
}
