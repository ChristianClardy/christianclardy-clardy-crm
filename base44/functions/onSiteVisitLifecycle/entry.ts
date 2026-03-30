import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function addBusinessDays(days) {
  const date = new Date();
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const visit = payload.data;
    const oldVisit = payload.old_data;

    if (visit?.outcome === 'Completed' && oldVisit?.outcome !== 'Completed') {
      await base44.asServiceRole.entities.Task.create({
        name: 'Build Estimate',
        linked_lead_id: visit.linked_lead_id,
        linked_job_id: visit.linked_job_id,
        task_type: 'Estimate',
        assigned_to: visit.assigned_to,
        due_date: addBusinessDays(2),
        priority: 'high',
        status: 'not_started',
        description: 'Create estimate after completed site visit',
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});