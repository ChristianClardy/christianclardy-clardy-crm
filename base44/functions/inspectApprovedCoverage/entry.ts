import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function normalize(name) {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [clients, projects] = await Promise.all([
      base44.asServiceRole.entities.Client.list('-updated_date', 5000),
      base44.asServiceRole.entities.Project.list('-updated_date', 2000),
    ]);

    const activeProjects = projects.filter((project) => !['closed', 'completed', 'cancelled'].includes(project.status));
    const clientById = Object.fromEntries(clients.map((client) => [client.id, client]));

    const groupedByName = {};
    for (const project of activeProjects) {
      const client = clientById[project.client_id];
      const key = normalize(client?.name) || project.acculynx_job_id || project.id;
      if (!groupedByName[key]) groupedByName[key] = [];
      groupedByName[key].push({
        project_id: project.id,
        project_name: project.name,
        project_status: project.status,
        project_client_id: project.client_id,
        project_job_id: project.acculynx_job_id,
        client_name: client?.name || null,
        client_status: client?.status || null,
        workflow_stage: client?.workflow_stage || null,
        notes: client?.notes || null,
      });
    }

    const duplicates = Object.values(groupedByName)
      .filter((items) => items.length > 1)
      .map((items) => ({
        client_name: items[0].client_name,
        project_count: items.length,
        projects: items,
      }));

    return Response.json({
      activeProjectCount: activeProjects.length,
      uniqueActiveProjectContacts: Object.keys(groupedByName).length,
      duplicateContactProjects: duplicates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});