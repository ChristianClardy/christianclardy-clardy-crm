import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function today() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const lead = payload.data;
    const oldLead = payload.old_data;
    const eventType = payload.event?.type;

    if (!lead) return Response.json({ ok: true });

    if (eventType === 'create') {
      if (!lead.status || lead.status !== 'New Lead') {
        await base44.asServiceRole.entities.Lead.update(lead.id, { status: 'New Lead' });
      }
      await base44.asServiceRole.entities.Task.create({
        name: 'First Contact Attempt',
        linked_lead_id: lead.id,
        task_type: 'Call',
        assigned_to: lead.assigned_sales_rep,
        due_date: today(),
        priority: 'high',
        status: 'not_started',
        description: `Initial outreach for ${lead.full_name}`,
      });
    }

    if (eventType === 'update' && lead.status !== oldLead?.status) {
      if (lead.status === 'Appointment Scheduled') {
        await base44.asServiceRole.entities.SiteVisit.create({
          linked_lead_id: lead.id,
          visit_type: 'Initial Consultation',
          scheduled_date: lead.follow_up_date || today(),
          assigned_to: lead.assigned_sales_rep,
          notes: lead.notes || '',
        });
      }

      if (lead.status === 'Lost' && !lead.lost_reason) {
        await base44.asServiceRole.entities.Task.create({
          name: 'Add Lost Reason',
          linked_lead_id: lead.id,
          task_type: 'Follow Up',
          assigned_to: lead.assigned_sales_rep,
          due_date: today(),
          priority: 'urgent',
          status: 'not_started',
          description: `Add lost reason for ${lead.full_name}`,
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});