import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function todayPlus(days) {
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
    const project = payload.data;
    const oldProject = payload.old_data;

    if (!project) return Response.json({ ok: true });

    const totalJobValue = (project.contract_value || 0) + (project.approved_change_order_value || 0);
    const remainingBalance = totalJobValue - (project.collected_to_date || 0);
    await base44.asServiceRole.entities.Project.update(project.id, {
      total_job_value: totalJobValue,
      remaining_balance: remainingBalance,
    });

    if (project.linked_property_id) {
      const properties = await base44.asServiceRole.entities.Property.filter({ id: project.linked_property_id }, '-created_date', 1);
      const property = properties[0];
      if (property?.permit_required === 'Yes' && project.permit_status === 'Not Required') {
        await base44.asServiceRole.entities.Project.update(project.id, { permit_status: 'Needed' });
      }
    }

    if (project.status === 'pre_construction' && oldProject?.status !== 'pre_construction') {
      const checklist = ['Verify contract', 'Verify deposit received', 'Confirm measurements', 'Confirm material selections', 'Check permit requirements', 'Schedule crew'];
      for (const item of checklist) {
        await base44.asServiceRole.entities.Task.create({
          name: item,
          linked_job_id: project.id,
          project_id: project.id,
          task_type: item.includes('permit') ? 'Permit' : item.includes('material') ? 'Material Order' : item.includes('Schedule') ? 'Scheduling' : 'Other',
          assigned_to: project.project_manager || project.superintendent,
          due_date: todayPlus(2),
          priority: 'high',
          status: 'not_started',
        });
      }
    }

    if (project.status === 'substantially_complete' && oldProject?.status !== 'substantially_complete') {
      const closeout = ['Punch list', 'Final invoice', 'Warranty documents', 'Final walkthrough'];
      for (const item of closeout) {
        await base44.asServiceRole.entities.Task.create({
          name: item,
          linked_job_id: project.id,
          project_id: project.id,
          task_type: item === 'Final invoice' ? 'Billing' : item === 'Punch list' ? 'Punch List' : 'Closeout',
          assigned_to: project.project_manager || project.superintendent,
          due_date: todayPlus(3),
          priority: 'high',
          status: 'not_started',
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});