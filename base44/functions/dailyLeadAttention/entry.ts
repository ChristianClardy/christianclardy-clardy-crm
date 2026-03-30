import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function daysBetween(a, b) {
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor((a.getTime() - b.getTime()) / oneDay);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const leads = await base44.asServiceRole.entities.Lead.list('-updated_date', 5000);
    let flagged = 0;

    for (const lead of leads) {
      const openStatus = ['New Lead', 'Contact Attempted'].includes(lead.status);
      if (!openStatus) continue;
      const referenceDate = lead.last_contact_date || lead.updated_date || lead.created_date;
      const age = daysBetween(new Date(), new Date(referenceDate));
      if (age < 2) continue;

      await base44.asServiceRole.entities.Lead.update(lead.id, { needs_attention: true });
      await base44.asServiceRole.entities.Task.create({
        name: 'Lead Follow Up Needed',
        linked_lead_id: lead.id,
        task_type: 'Follow Up',
        assigned_to: lead.assigned_sales_rep,
        due_date: today(),
        priority: 'high',
        status: 'not_started',
        description: `Lead needs attention: ${lead.full_name}`,
      });
      flagged++;
    }

    return Response.json({ flagged });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});