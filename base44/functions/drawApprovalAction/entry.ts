import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { draw_id, action } = await req.json(); // action: 'approve' | 'reject'

    if (!draw_id || !action) {
      return Response.json({ error: 'draw_id and action required' }, { status: 400 });
    }

    const draws = await base44.asServiceRole.entities.Draw.filter({ id: draw_id });
    if (!draws.length) return Response.json({ error: 'Draw not found' }, { status: 404 });
    const draw = draws[0];

    const projects = await base44.asServiceRole.entities.Project.filter({ id: draw.project_id });
    if (!projects.length) return Response.json({ error: 'Project not found' }, { status: 404 });
    const project = projects[0];

    if (action === 'approve') {
      // Set status to approved, set due_date 14 days from today
      const today = new Date();
      const dueDate = new Date(today);
      dueDate.setDate(today.getDate() + 14);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      await base44.asServiceRole.entities.Draw.update(draw_id, {
        status: 'approved',
        due_date: dueDateStr,
      });

      // Notify the submitter (project creator or created_by)
      const submitterEmail = draw.created_by;
      if (submitterEmail) {
        await base44.asServiceRole.entities.Notification.create({
          user_email: submitterEmail,
          title: `Draw Approved: ${draw.title}`,
          message: `Draw "${draw.title}" on project "${project.name}" has been approved. Due date set to ${dueDateStr}.`,
          type: 'reminder',
          read: false,
          related_id: draw.id,
          link: `ProjectDetail?id=${project.id}&tab=cashflow`,
        });

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: submitterEmail,
          subject: `Draw Approved: ${draw.title}`,
          body: `Your draw "${draw.title}" on project "${project.name}" has been approved.\n\nDue date: ${dueDateStr}\nAmount: $${(draw.amount || 0).toLocaleString()}\n\nThank you,\nClarity Construction`,
        });
      }

      return Response.json({ success: true, action: 'approved', due_date: dueDateStr });
    }

    if (action === 'reject') {
      await base44.asServiceRole.entities.Draw.update(draw_id, {
        status: 'pending',
      });

      const submitterEmail = draw.created_by;
      if (submitterEmail) {
        await base44.asServiceRole.entities.Notification.create({
          user_email: submitterEmail,
          title: `Draw Rejected: ${draw.title}`,
          message: `Draw "${draw.title}" on project "${project.name}" was rejected by ${user.full_name || user.email}. The draw has been reset to pending for revision.`,
          type: 'reminder',
          read: false,
          related_id: draw.id,
          link: `ProjectDetail?id=${project.id}&tab=cashflow`,
        });

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: submitterEmail,
          subject: `Draw Rejected: ${draw.title}`,
          body: `Your draw "${draw.title}" on project "${project.name}" was rejected by ${user.full_name || user.email}.\n\nThe draw status has been reset to Pending. Please revise and resubmit.\n\nThank you,\nClarity Construction`,
        });
      }

      return Response.json({ success: true, action: 'rejected' });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});