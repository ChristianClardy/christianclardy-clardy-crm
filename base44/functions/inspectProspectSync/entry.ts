import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clients = await base44.asServiceRole.entities.Client.list('-created_date', 2000);
    const totalClients = clients.length;
    const prospects = clients.filter((client) => client.status === 'prospect');
    const withJobId = clients.filter((client) => client.acculynx_job_id);
    const prospectsWithJobId = prospects.filter((client) => client.acculynx_job_id);

    const statusCounts = clients.reduce((acc, client) => {
      const key = client.status || 'missing';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const duplicateJobIds = Object.entries(
      withJobId.reduce((acc, client) => {
        acc[client.acculynx_job_id] = (acc[client.acculynx_job_id] || 0) + 1;
        return acc;
      }, {})
    )
      .filter(([, count]) => count > 1)
      .slice(0, 20);

    return Response.json({
      totalClients,
      totalProspects: prospects.length,
      totalWithJobId: withJobId.length,
      prospectsWithJobId: prospectsWithJobId.length,
      statusCounts,
      newestProspects: prospects.slice(0, 10).map((client) => ({
        id: client.id,
        name: client.name,
        status: client.status,
        acculynx_job_id: client.acculynx_job_id,
        created_date: client.created_date,
      })),
      duplicateJobIds,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});