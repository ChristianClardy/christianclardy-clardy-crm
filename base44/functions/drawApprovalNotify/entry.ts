import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { draw_id } = await req.json();

    if (!draw_id) {
      return Response.json({ error: 'draw_id required' }, { status: 400 });
    }

    const draws = await base44.asServiceRole.entities.Draw.filter({ id: draw_id });
    if (!draws.length) return Response.json({ error: 'Draw not found' }, { status: 404 });
    const draw = draws[0];

    if (draw.status !== 'submitted') {
      return Response.json({ message: 'Draw is not in submitted status, skipping.' });
    }

    // Get project to find project manager
    const projects = await base44.asServiceRole.entities.Project.filter({ id: draw.project_id });
    if (!projects.length) return Response.json({ error: 'Project not found' }, { status: 404 });
    const project = projects[0];

    // Find project manager's email from Employee list
    let pmEmail = null;
    if (project.project_manager) {
      const employees = await base44.asServiceRole.entities.Employee.filter({ full_name: project.project_manager });
      if (employees.length) pmEmail = employees[0].email;
    }

    // Create in-app notification for PM
    if (pmEmail) {
      await base44.asServiceRole.entities.Notification.create({
        user_email: pmEmail,
        title: `Draw Submitted: ${draw.title}`,
        message: `Draw "${draw.title}" on project "${project.name}" has been submitted for approval. Amount: $${(draw.amount || 0).toLocaleString()}. Please review and approve or reject.`,
        type: 'reminder',
        read: false,
        related_id: draw.id,
        link: `ProjectDetail?id=${project.id}&tab=cashflow`,
      });

      // Also send email notification
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: pmEmail,
        subject: `Action Required: Draw Submitted – ${draw.title}`,
        body: `Hello ${project.project_manager},\n\nA draw has been submitted for your review on project "${project.name}".\n\nDraw: ${draw.title}\nAmount: $${(draw.amount || 0).toLocaleString()}\n\nPlease log in to review and approve or reject this draw.\n\nThank you,\nClarity Construction`,
      });
    }

    return Response.json({ success: true, pm_email: pmEmail });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});