import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const clients = await base44.asServiceRole.entities.Client.list('-updated_date', 5000);
    const synced = clients.filter((c) => c.acculynx_job_id);

    const milestoneCounts = synced.reduce((acc, client) => {
      const match = (client.notes || '').match(/AccuLynx milestone:\s*(.*)/i);
      const milestone = (match?.[1] || 'missing').trim().toLowerCase();
      acc[milestone] = (acc[milestone] || 0) + 1;
      return acc;
    }, {});

    const samples = synced.slice(0, 200).reduce((acc, client) => {
      const match = (client.notes || '').match(/AccuLynx milestone:\s*(.*)/i);
      const milestone = (match?.[1] || 'missing').trim().toLowerCase();
      if (milestone.includes('approved') || milestone.includes('complete') || milestone.includes('closed') || milestone.includes('dead')) {
        acc.push({
          name: client.name,
          status: client.status,
          workflow_stage: client.workflow_stage,
          milestone,
          acculynx_job_id: client.acculynx_job_id,
          lifetime_value: client.lifetime_value || 0,
        });
      }
      return acc;
    }, []);

    const statusCounts = synced.reduce((acc, client) => {
      const key = client.status || 'missing';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Response.json({
      totalClients: clients.length,
      syncedClients: synced.length,
      statusCounts,
      milestoneCounts,
      samples: samples.slice(0, 50),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});