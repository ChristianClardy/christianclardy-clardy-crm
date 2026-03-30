import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const estimate = payload.data;
    const oldEstimate = payload.old_data;

    if (!estimate || estimate.status === oldEstimate?.status) {
      return Response.json({ ok: true });
    }

    const leadId = estimate.linked_lead_id;
    const clientId = estimate.linked_contact_id || estimate.client_id;

    if (estimate.status === 'sent') {
      if (leadId) {
        await base44.asServiceRole.entities.Lead.update(leadId, { status: 'Estimate Sent' });
      }
      await base44.asServiceRole.entities.Task.create({
        name: 'Follow Up on Estimate',
        linked_lead_id: leadId,
        linked_estimate_id: estimate.id,
        task_type: 'Follow Up',
        assigned_to: estimate.sales_rep,
        due_date: addDays(3),
        priority: 'high',
        status: 'not_started',
        description: `Follow up on estimate ${estimate.title}`,
      });
    }

    if (['approved', 'accepted'].includes(estimate.status)) {
      if (leadId) {
        await base44.asServiceRole.entities.Lead.update(leadId, { status: 'Won' });
      }

      const existingProjects = await base44.asServiceRole.entities.Project.filter({ linked_estimate_id: estimate.id }, '-created_date', 1);
      let project = existingProjects[0];
      if (!project) {
        project = await base44.asServiceRole.entities.Project.create({
          name: estimate.estimate_name || estimate.title,
          client_id: clientId,
          linked_estimate_id: estimate.id,
          linked_property_id: estimate.linked_property_id,
          project_type: estimate.project_type || 'residential',
          status: 'pre_construction',
          contract_value: estimate.total || estimate.estimated_revenue || 0,
          total_job_value: estimate.total || estimate.estimated_revenue || 0,
          remaining_balance: estimate.total || estimate.estimated_revenue || 0,
          description: estimate.scope_of_work || estimate.notes || '',
          project_manager: estimate.sales_rep || '',
        });
      }

      await base44.asServiceRole.entities.Task.create({
        name: 'Collect Deposit',
        linked_estimate_id: estimate.id,
        linked_job_id: project.id,
        task_type: 'Billing',
        assigned_to: estimate.sales_rep,
        due_date: addDays(1),
        priority: 'high',
        status: 'not_started',
      });

      await base44.asServiceRole.entities.Task.create({
        name: 'Start Pre-Construction Checklist',
        linked_estimate_id: estimate.id,
        linked_job_id: project.id,
        task_type: 'Scheduling',
        assigned_to: project.project_manager,
        due_date: addDays(1),
        priority: 'high',
        status: 'not_started',
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});