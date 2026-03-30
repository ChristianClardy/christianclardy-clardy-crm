import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const changeOrder = payload.data;
    const oldChangeOrder = payload.old_data;

    if (changeOrder?.approval_status === 'Approved' && oldChangeOrder?.approval_status !== 'Approved') {
      const projects = await base44.asServiceRole.entities.Project.filter({ id: changeOrder.linked_job_id }, '-created_date', 1);
      const project = projects[0];
      if (project) {
        const approvedChangeOrderValue = (project.approved_change_order_value || 0) + (changeOrder.revenue_change || 0);
        const totalJobValue = (project.contract_value || 0) + approvedChangeOrderValue;
        const remainingBalance = totalJobValue - (project.collected_to_date || 0);
        await base44.asServiceRole.entities.Project.update(project.id, {
          approved_change_order_value: approvedChangeOrderValue,
          total_job_value: totalJobValue,
          remaining_balance: remainingBalance,
        });

        await base44.asServiceRole.entities.Invoice.create({
          linked_job_id: project.id,
          invoice_type: 'Change Order',
          invoice_name: changeOrder.change_order_name,
          amount: changeOrder.revenue_change || 0,
          invoice_status: 'Draft',
          notes: changeOrder.description || '',
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});